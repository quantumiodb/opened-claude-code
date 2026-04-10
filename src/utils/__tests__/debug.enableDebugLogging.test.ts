import { describe, expect, it } from 'vitest'
import { wasDebugLoggingAlreadyActive } from '../debugGate.js'

describe('enableDebugLogging', () => {
  it('treats debug as already active only when debug mode is active', () => {
    expect(wasDebugLoggingAlreadyActive(false)).toBe(false)
    expect(wasDebugLoggingAlreadyActive(true)).toBe(true)
  })

  it('does not grant ant-only always-active behavior', () => {
    const antUserWithNoDebugFlag = false
    expect(wasDebugLoggingAlreadyActive(antUserWithNoDebugFlag)).toBe(false)
  })
})
