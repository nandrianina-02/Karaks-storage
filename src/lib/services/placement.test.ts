import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { choisirAutre, depasseSeuil, SEUIL_BASCULE } from './placement-regles'

const GO = 1024 ** 3

describe('bascule de stockage', () => {
  it('bascule à 80 % de l’espace, pas avant', () => {
    assert.equal(SEUIL_BASCULE, 0.8)
    assert.equal(depasseSeuil({ usage: 11 * GO, limit: 15 * GO }, 0.9 * GO), false)
    assert.equal(depasseSeuil({ usage: 11 * GO, limit: 15 * GO }, 1.1 * GO), true)
    assert.equal(depasseSeuil({ usage: 12.5 * GO, limit: 15 * GO }, 0), true)
  })

  it('ne bascule jamais un stockage sans limite connue', () => {
    assert.equal(depasseSeuil({ usage: 500 * GO, limit: null }, 10 * GO), false)
  })

  it('choisit le compte qui a le plus de place sous le seuil', () => {
    const choix = choisirAutre(
      [
        { id: 'compte-a', usage: 10 * GO, limit: 15 * GO },
        { id: 'compte-b', usage: 2 * GO, limit: 15 * GO },
        { id: 'compte-c', usage: 13 * GO, limit: 15 * GO },
      ],
      100 * 1024 ** 2,
    )
    assert.equal(choix, 'compte-b')
  })

  it('préfère un stockage sans limite (S3) à un compte Google', () => {
    assert.equal(choisirAutre([{ id: 'drive', usage: 0, limit: 15 * GO }, { id: 'r2', usage: 900 * GO, limit: null }], GO), 'r2')
  })

  it('ne propose rien si tous les autres sont au-delà du seuil', () => {
    assert.equal(choisirAutre([{ id: 'a', usage: 12.1 * GO, limit: 15 * GO }], 0), null)
    assert.equal(choisirAutre([], GO), null)
  })

  it('écarte un compte qu’un gros fichier ferait passer au-delà du seuil', () => {
    assert.equal(choisirAutre([{ id: 'a', usage: 11.5 * GO, limit: 15 * GO }], 1 * GO), null)
  })
})
