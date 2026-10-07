import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { activeFilterCount, filterCriteria, parseFilters } from './filters'

const reader = (values: Record<string, string>) => (name: string) => values[name]

describe('filtres de l’explorateur', () => {
  it('ignore les valeurs inconnues de l’adresse', () => {
    const filters = parseFilters(reader({ type: 'exe', taille: '9000', ajout: 'hier' }))
    assert.equal(filters.type, null)
    assert.equal(filters.size, null)
    assert.equal(filters.added, null)
    assert.equal(activeFilterCount(filters), 0)
  })

  it('traduit type, taille et période relative', () => {
    const now = Date.UTC(2026, 9, 7)
    const filters = parseFilters(reader({ type: 'audio', taille: '1-10', ajout: '7j' }))
    assert.equal(activeFilterCount(filters), 3)
    const criteria = filterCriteria(filters, now)
    assert.equal(criteria.category, 'audio')
    assert.equal(criteria.minSize, 1024 * 1024)
    assert.equal(criteria.maxSize, 10 * 1024 * 1024)
    assert.equal(criteria.from?.getTime(), now - 7 * 86_400_000)
    assert.equal(criteria.to, undefined)
  })

  it('une période précise couvre toute la journée de fin', () => {
    const filters = parseFilters(reader({ ajout: 'plage', du: '2026-10-01', au: '2026-10-03' }))
    const criteria = filterCriteria(filters)
    assert.equal(criteria.from?.getDate(), 1)
    assert.equal(criteria.to?.getHours(), 23)
    assert.equal(criteria.to?.getDate(), 3)
  })

  it('ne retient les dates que pour une période précise et bien formée', () => {
    assert.equal(parseFilters(reader({ ajout: '7j', du: '2026-10-01' })).from, null)
    assert.equal(parseFilters(reader({ ajout: 'plage', du: '1er octobre' })).from, null)
  })
})
