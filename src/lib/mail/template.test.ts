import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { describeDevice, renderEmail } from './template'

describe('renderEmail', () => {
  const content = {
    preheader: 'Aperçu',
    title: 'Projet <Karaks> & co',
    paragraphs: ['Bonjour "Rado",', 'Deuxième paragraphe.'],
    action: { label: 'Ouvrir', url: 'https://storage.karaks.mg/profil?a=1&b=2' },
    details: [['Adresse IP', '10.0.0.1']] as [string, string][],
    note: 'Ce n’était pas vous ?',
    footer: { reason: 'Raison de l’envoi.', unsubscribeUrl: 'https://storage.karaks.mg/desabonnement?u=1' },
  }

  it('échappe le contenu dans la version HTML', () => {
    const { html } = renderEmail(content)
    assert.ok(html.includes('Projet &lt;Karaks&gt; &amp; co'))
    assert.ok(html.includes('Bonjour &quot;Rado&quot;,'))
    assert.ok(html.includes('href="https://storage.karaks.mg/profil?a=1&amp;b=2"'))
    assert.ok(!html.includes('<Karaks>'))
  })

  it('produit une version texte complète, liens compris', () => {
    const { text } = renderEmail(content)
    assert.ok(text.startsWith('Projet <Karaks> & co'))
    assert.ok(text.includes('Ouvrir : https://storage.karaks.mg/profil?a=1&b=2'))
    assert.ok(text.includes('Adresse IP : 10.0.0.1'))
    assert.ok(text.includes('Ne plus recevoir ces emails : https://storage.karaks.mg/desabonnement?u=1'))
  })

  it('omet le désabonnement quand il n’y en a pas', () => {
    const { html, text } = renderEmail({ ...content, footer: { reason: 'Sécurité.' } })
    assert.ok(!html.includes('Ne plus recevoir'))
    assert.ok(!text.includes('Ne plus recevoir'))
  })
})

describe('describeDevice', () => {
  it('reconnaît les navigateurs et systèmes courants', () => {
    assert.equal(
      describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'),
      'Chrome sur Windows',
    )
    assert.equal(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'), 'Safari sur iOS')
    assert.equal(describeDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 Edg/130.0'), 'Edge sur Android')
    assert.equal(describeDevice('node'), 'Programme ou script')
    assert.equal(describeDevice(null), 'Appareil inconnu')
  })
})
