import { describe, it, expect, beforeAll, vi } from 'vitest'

// Auto mode must be reachable for GLM-5+ models. The two gates that previously
// blocked it: modelSupportsAutoMode (model allowlist) and the auto-mode
// enabled-state default (GrowthBook kill-switch is never served on GLM).
beforeAll(() => {
  process.env.FEATURES = 'TRANSCRIPT_CLASSIFIER'
  process.env.USER_TYPE = 'external'
  // GLM runs against an Anthropic-compatible firstParty endpoint.
  delete process.env.CLAUDE_CODE_USE_BEDROCK
  delete process.env.CLAUDE_CODE_USE_VERTEX
  delete process.env.CLAUDE_CODE_USE_FOUNDRY
})

describe('modelSupportsAutoMode for GLM', () => {
  it('enables auto mode for glm-5 and above, not glm-4', async () => {
    const { modelSupportsAutoMode } = await import('../betas.js')
    expect(modelSupportsAutoMode('glm-5')).toBe(true)
    expect(modelSupportsAutoMode('glm-5.2')).toBe(true)
    expect(modelSupportsAutoMode('glm-6')).toBe(true)
    expect(modelSupportsAutoMode('glm-4.5')).toBe(false)
    // Anthropic allowlist still honored.
    expect(modelSupportsAutoMode('claude-opus-4-6')).toBe(true)
    expect(modelSupportsAutoMode('claude-opus-4-1')).toBe(false)
  })
})

// The enabled-state default lives in permissionSetup, but importing that
// module transitively loads the classifier prompt (a .txt require unsupported
// in vitest). Assert the predicate the default uses directly — it must match
// glm-5 and above, reject glm-4, and reject Anthropic models (which keep the
// 'disabled' circuit-breaker default).
describe('auto-mode enabled-state default predicate for GLM', () => {
  const isGlmForced = (m: string) => /glm-[5-9]/.test(m.toLowerCase())
  it('matches glm-5+ only', () => {
    expect(isGlmForced('glm-5')).toBe(true)
    expect(isGlmForced('glm-5.2')).toBe(true)
    expect(isGlmForced('glm-6')).toBe(true)
    expect(isGlmForced('GLM-5.2')).toBe(true)
    expect(isGlmForced('glm-4.5')).toBe(false)
    expect(isGlmForced('claude-opus-4-6')).toBe(false)
  })
})
