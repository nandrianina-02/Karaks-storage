import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { decrypt, encrypt, hashSecret, randomBase62, safeEqual, signPayload } from './crypto'
import { API_KEY_PERMISSIONS, canCreateProject, permissionsFor } from './permissions'
import { rateLimit, resetRateLimits } from './rate-limit'

const SECRET = 'un-secret-de-test-suffisamment-long-pour-l-essai'

describe('crypto', () => {
  it('tire des jetons de la bonne longueur, tous différents', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomBase62(24)))
    assert.equal(tokens.size, 200)
    for (const token of tokens) assert.match(token, /^[0-9A-Za-z]{24}$/)
  })

  it('chiffre et déchiffre, avec un résultat différent à chaque fois', () => {
    const first = encrypt('1//jeton-de-rafraichissement', SECRET)
    const second = encrypt('1//jeton-de-rafraichissement', SECRET)
    assert.notEqual(first, second)
    assert.equal(decrypt(first, SECRET), '1//jeton-de-rafraichissement')
  })

  it('refuse un texte chiffré altéré ou une autre clé', () => {
    const payload = encrypt('secret', SECRET)
    const parts = payload.split('.')
    parts[3] = Buffer.from('autre-chose').toString('base64url')
    assert.throws(() => decrypt(parts.join('.'), SECRET))
    assert.throws(() => decrypt(payload, `${SECRET}-autre`))
  })

  it('produit une empreinte stable, dépendante du poivre', () => {
    assert.equal(hashSecret('ks_test_abc', SECRET), hashSecret('ks_test_abc', SECRET))
    assert.notEqual(hashSecret('ks_test_abc', SECRET), hashSecret('ks_test_abc', `${SECRET}x`))
    assert.equal(safeEqual('abc', 'abc'), true)
    assert.equal(safeEqual('abc', 'abd'), false)
    assert.equal(safeEqual('abc', 'abcd'), false)
  })

  it('signe un webhook sur l’horodatage et le corps', () => {
    const signature = signPayload('{"a":1}', 'whsec', 1_700_000_000)
    assert.notEqual(signature, signPayload('{"a":1}', 'whsec', 1_700_000_001))
    assert.notEqual(signature, signPayload('{"a":2}', 'whsec', 1_700_000_000))
  })
})

describe('permissions', () => {
  it('donne tout au super administrateur, même hors des projets', () => {
    assert.ok(permissionsFor('SUPER_ADMIN', null).includes('project:manage'))
  })

  it('ne donne rien à un compte qui n’est pas membre, même administrateur', () => {
    assert.deepEqual(permissionsFor('ADMIN', null), [])
    assert.deepEqual(permissionsFor('USER', null), [])
  })

  it('cantonne un lecteur à la lecture', () => {
    const viewer = permissionsFor('USER', 'VIEWER')
    assert.ok(viewer.includes('stream:read'))
    assert.ok(!viewer.includes('files:upload'))
    assert.ok(!viewer.includes('files:delete'))
  })

  it('interdit à une clé de gérer les clés ou le projet', () => {
    assert.ok(!API_KEY_PERMISSIONS.includes('api-keys:manage'))
    assert.ok(!API_KEY_PERMISSIONS.includes('project:manage'))
  })

  it('réserve la création de projets aux administrateurs', () => {
    assert.equal(canCreateProject('ADMIN'), true)
    assert.equal(canCreateProject('DEVELOPER'), false)
    assert.equal(canCreateProject('USER'), false)
  })
})

describe('rateLimit', () => {
  it('bloque au-delà de la limite puis rouvre la fenêtre', () => {
    resetRateLimits()
    const now = 1_000_000
    for (let i = 0; i < 3; i += 1) assert.equal(rateLimit('k', 3, 60_000, now).allowed, true)
    const blocked = rateLimit('k', 3, 60_000, now + 1000)
    assert.equal(blocked.allowed, false)
    assert.equal(blocked.resetIn, 59)
    assert.equal(rateLimit('k', 3, 60_000, now + 60_001).allowed, true)
  })

  it('compte séparément chaque clé', () => {
    resetRateLimits()
    assert.equal(rateLimit('a', 1, 60_000, 0).allowed, true)
    assert.equal(rateLimit('b', 1, 60_000, 0).allowed, true)
    assert.equal(rateLimit('a', 1, 60_000, 0).allowed, false)
  })
})
