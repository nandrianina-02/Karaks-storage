import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

/**
 * Fonctions pures des services. Les modules de service importent la base :
 * on les charge avec une configuration factice, sans jamais s'y connecter.
 */
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:1/test'
process.env.BETTER_AUTH_SECRET ??= 'x'.repeat(32)
process.env.API_SECRET ??= 'y'.repeat(32)
process.env.ENCRYPTION_KEY ??= 'z'.repeat(32)

let isAllowedWebhookUrl: typeof import('./webhooks').isAllowedWebhookUrl
let variation: typeof import('./stats').variation
let slugify: typeof import('./projects').slugify

before(async () => {
  ;({ isAllowedWebhookUrl } = await import('./webhooks'))
  ;({ variation } = await import('./stats'))
  ;({ slugify } = await import('./projects'))
})

describe('isAllowedWebhookUrl', () => {
  it('accepte une adresse HTTPS publique en production', () => {
    assert.equal(isAllowedWebhookUrl('https://api.karaks.com/webhooks/storage', true), true)
  })

  it('refuse en production le réseau interne et le HTTP clair', () => {
    for (const url of [
      'http://api.karaks.com/hook',
      'https://localhost/hook',
      'https://127.0.0.1/hook',
      'https://10.0.0.4/hook',
      'https://172.20.1.1/hook',
      'https://192.168.1.10/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/hook',
      'https://service.internal/hook',
      'https://user:pass@api.karaks.com/hook',
      'ftp://api.karaks.com/hook',
    ]) {
      assert.equal(isAllowedWebhookUrl(url, true), false, url)
    }
  })

  it('admet localhost en développement', () => {
    assert.equal(isAllowedWebhookUrl('http://localhost:4000/hook', false), true)
  })
})

describe('variation', () => {
  it('calcule une évolution en pour cent', () => {
    assert.equal(variation(112, 100), 12)
    assert.equal(variation(50, 100), -50)
    assert.equal(variation(0, 0), 0)
    assert.equal(variation(5, 0), null)
  })
})

describe('slugify', () => {
  it('produit un identifiant lisible', () => {
    assert.equal(slugify('Karaks Production'), 'karaks-production')
    assert.equal(slugify('Moziik — Été 2026 !'), 'moziik-ete-2026')
    assert.equal(slugify('***'), 'projet')
  })
})
