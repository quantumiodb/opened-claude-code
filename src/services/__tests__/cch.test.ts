import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  computeCch,
  hasCchPlaceholder,
  replaceCchPlaceholder,
  CCH_PLACEHOLDER,
} from '../cch.js'

// Restore the known cch value back to placeholder, then re-serialize as
// compact JSON — this recreates the exact bytes the SDK sends over the wire.
function prepareFixture(filePath: string, knownCch: string): Uint8Array {
  const raw = readFileSync(filePath, 'utf-8')
  const parsed = JSON.parse(raw)
  for (const block of parsed.system ?? []) {
    if (block.text) block.text = block.text.replace(`cch=${knownCch}`, CCH_PLACEHOLDER)
  }
  return new TextEncoder().encode(JSON.stringify(parsed))
}

const FIXTURES = join(import.meta.dirname, 'fixtures')

describe('hasCchPlaceholder', () => {
  it('returns true when placeholder present', () => {
    expect(hasCchPlaceholder('prefix cch=00000 suffix')).toBe(true)
  })
  it('returns false when placeholder absent', () => {
    expect(hasCchPlaceholder('cch=9500b')).toBe(false)
    expect(hasCchPlaceholder('')).toBe(false)
  })
})

describe('replaceCchPlaceholder', () => {
  it('replaces placeholder with computed value', () => {
    expect(replaceCchPlaceholder('cch=00000;', '9500b')).toBe('cch=9500b;')
  })
  it('only replaces first occurrence', () => {
    expect(replaceCchPlaceholder('cch=00000 cch=00000', 'abcde')).toBe('cch=abcde cch=00000')
  })
})

describe('computeCch — real Claude Code v2.1.92 requests', () => {
  // Fixture bodies are 115–116 KB compact JSON from actual Claude Code traffic.
  // Expected cch values observed in the real HTTP requests.

  it('request 1: user="hi" → cch=9500b', async () => {
    const bytes = prepareFixture(
      join(FIXTURES, 'request1_cch9500b.json'),
      '9500b',
    )
    expect(await computeCch(bytes)).toBe('9500b')
  })

  it('request 2: user="1" (turn 2) → cch=be662', async () => {
    const bytes = prepareFixture(
      join(FIXTURES, 'request2_cchbe662.json'),
      'be662',
    )
    expect(await computeCch(bytes)).toBe('be662')
  })

  it('different bodies produce different cch values', async () => {
    const bytes1 = prepareFixture(join(FIXTURES, 'request1_cch9500b.json'), '9500b')
    const bytes2 = prepareFixture(join(FIXTURES, 'request2_cchbe662.json'), 'be662')
    const [cch1, cch2] = await Promise.all([computeCch(bytes1), computeCch(bytes2)])
    expect(cch1).not.toBe(cch2)
  })

  it('output is always 5 lowercase hex chars', async () => {
    const bytes = prepareFixture(join(FIXTURES, 'request1_cch9500b.json'), '9500b')
    const cch = await computeCch(bytes)
    expect(cch).toMatch(/^[0-9a-f]{5}$/)
  })
})
