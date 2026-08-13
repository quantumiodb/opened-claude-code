import { describe, expect, it, vi } from 'vitest'

// Pre-existing environment gap: the `color-diff-napi` stub re-exports from
// src/native-ts/color-diff/index.ts, which imports '../../ink/stringWidth.js'.
// Only the .ts file exists, so under vitest the module graph that reaches
// this package fails to load. Mock the package so this unit test (which
// doesn't exercise color-diff) can run. Unrelated to the bug under test.
vi.mock('color-diff-napi', () => ({
  ColorDiff: class {},
  ColorFile: class {},
  getSyntaxTheme: () => null,
}))

import { interpretCommandResult } from '../commandSemantics.js'

/**
 * Regression tests for the && short-circuit misinterpretation bug.
 *
 * Background: when `cmd1 && cmd2` runs and cmd1 fails (exit 1), cmd2 never
 * executes but the aggregate exit code is 1. Applying cmd2's per-command
 * semantic (e.g. rg's "exit 1 = no matches") misread cmd1's real failure as
 * a benign "no matches" — masking build/test/lint failures from the model.
 *
 * Fix: when a top-level `&&` is present, fall back to DEFAULT_SEMANTIC so
 * real failures surface as errors. We can't statically prove the last
 * segment executed, so we err on the side of safety.
 */
describe('interpretCommandResult: && short-circuit', () => {
  describe('left side fails — must report error, not mask as benign', () => {
    const cases: Array<[string, string]> = [
      ['rg', "false && rg needle /dev/null"],
      ['grep', "false && grep needle /dev/null"],
      ['diff', "false && diff /dev/null /dev/null"],
      ['test', "false && test -e /definitely-not-present"],
      ['find', "false && find /dev/null -name needle"],
      ['[', "false && [ -e /definitely-not-present ]"],
    ]
    for (const [cmd, command] of cases) {
      it(`treats ${cmd} after failed && as error`, () => {
        const result = interpretCommandResult(command, 1, '', '')
        expect(result.isError).toBe(true)
        expect(result.message).toMatch(/failed with exit code/i)
        // Critical: must NOT be masked as the benign per-command message
        expect(result.message).not.toMatch(/No matches|Files differ|Condition is false|inaccessible/i)
      })
    }
  })

  describe('top-level && with left success — conservative default', () => {
    // `true && rg needle`: rg did run and found nothing, but we can't prove
    // statically that the left succeeded. Default semantic is the price.
    it('falls back to default for `true && rg needle` (precision regression accepted)', () => {
      const result = interpretCommandResult('true && rg needle /dev/null', 1, '', '')
      expect(result.isError).toBe(true)
      expect(result.message).not.toMatch(/No matches/i)
    })

    it('returns success when `true && rg` exits 0', () => {
      const result = interpretCommandResult('true && rg needle file', 0, 'match', '')
      expect(result.isError).toBe(false)
      expect(result.message).toBeUndefined()
    })
  })
})

describe('interpretCommandResult: preserved semantics', () => {
  it('plain rg exit 1 → "No matches found"', () => {
    const result = interpretCommandResult('rg needle /dev/null', 1, '', '')
    expect(result.isError).toBe(false)
    expect(result.message).toBe('No matches found')
  })

  it('pipe: last segment semantic applies (rg | rg, no match)', () => {
    const result = interpretCommandResult('cat file | rg needle', 1, '', '')
    expect(result.isError).toBe(false)
    expect(result.message).toBe('No matches found')
  })

  it('|| : right side runs on left failure, last semantic applies', () => {
    const result = interpretCommandResult('false || rg needle /dev/null', 1, '', '')
    expect(result.isError).toBe(false)
    expect(result.message).toBe('No matches found')
  })

  it('; : both run, last segment semantic applies', () => {
    const result = interpretCommandResult('echo hi; rg needle /dev/null', 1, '', '')
    expect(result.isError).toBe(false)
    expect(result.message).toBe('No matches found')
  })

  it('rg exit 2 → error', () => {
    const result = interpretCommandResult('rg needle /dev/null', 2, '', 'oops')
    expect(result.isError).toBe(true)
  })
})

describe('interpretCommandResult: && nested in non-top-level contexts', () => {
 // `&&` inside a quoted arg, subshell, or command substitution is NOT
 // top-level and must not trigger the conservative fallback.
  it('quoted && (bash -c "a && b") does not bail — last segment semantic applies', () => {
    // Outer command is `bash -c "..."`, last segment after pipe-split is the
    // whole string; extractBaseCommand → 'bash' → no specific semantic →
    // default. Either way, must not bail just because && appears in a quote.
    const result = interpretCommandResult('bash -c "a && b"', 1, '', '')
    expect(result.isError).toBe(true)
    expect(result.message).toMatch(/failed with exit code/i)
  })

  it('subshell (a && b) | rg c — outer operator is pipe, inner && is nested', () => {
    // Last segment is `rg c`; if the subshell produced nothing, rg exits 1.
    // Inner && is at paren depth 1, must not trigger bail. We expect rg's
    // "No matches found" semantic to apply.
    const result = interpretCommandResult('(true && true) | rg c', 1, '', '')
    expect(result.message).toBe('No matches found')
    expect(result.isError).toBe(false)
  })
})
