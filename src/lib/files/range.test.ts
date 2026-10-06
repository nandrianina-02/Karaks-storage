import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseContentRange, parseRange } from './range'

describe('parseRange', () => {
  it('sert le fichier entier sans en-tête ou avec un en-tête illisible', () => {
    assert.deepEqual(parseRange(null, 100), { kind: 'full' })
    assert.deepEqual(parseRange('items=0-5', 100), { kind: 'full' })
    assert.deepEqual(parseRange('bytes=0-1,5-9', 100), { kind: 'full' })
  })

  it('lit une plage bornée et la ramène à la taille du fichier', () => {
    assert.deepEqual(parseRange('bytes=0-999999', 100), { kind: 'partial', start: 0, end: 99 })
    assert.deepEqual(parseRange('bytes=10-19', 100), { kind: 'partial', start: 10, end: 19 })
  })

  it('lit une plage ouverte et une plage de fin', () => {
    assert.deepEqual(parseRange('bytes=90-', 100), { kind: 'partial', start: 90, end: 99 })
    assert.deepEqual(parseRange('bytes=-10', 100), { kind: 'partial', start: 90, end: 99 })
    assert.deepEqual(parseRange('bytes=-500', 100), { kind: 'partial', start: 0, end: 99 })
  })

  it('refuse une plage hors du fichier', () => {
    assert.deepEqual(parseRange('bytes=100-', 100), { kind: 'unsatisfiable' })
    assert.deepEqual(parseRange('bytes=50-10', 100), { kind: 'unsatisfiable' })
    assert.deepEqual(parseRange('bytes=-0', 100), { kind: 'unsatisfiable' })
  })
})

describe('parseContentRange', () => {
  it('lit le morceau annoncé', () => {
    assert.deepEqual(parseContentRange('bytes 0-8388607/52428800'), { start: 0, end: 8388607, total: 52428800 })
  })

  it('refuse une plage incohérente', () => {
    assert.equal(parseContentRange('bytes 10-5/100'), null)
    assert.equal(parseContentRange('bytes 0-100/100'), null)
    assert.equal(parseContentRange('bytes */100'), null)
    assert.equal(parseContentRange(null), null)
  })
})
