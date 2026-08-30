import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const providers = vi.hoisted(() => ({
  getAPIProvider: vi.fn(() => 'firstParty' as string),
  isFirstPartyAnthropicBaseUrl: vi.fn(() => true),
}))

vi.mock('../model/providers.js', () => providers)

const { getToolSearchTransport, isLocalToolSearchTransport } = await import(
  '../toolSearchTransport.js'
)

const ENV_KEYS = [
  'ENABLE_TOOL_SEARCH',
  'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
] as const

describe('getToolSearchTransport', () => {
  const saved = new Map<string, string | undefined>()

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved.set(k, process.env[k])
      delete process.env[k]
    }
    providers.getAPIProvider.mockReturnValue('firstParty')
    providers.isFirstPartyAnthropicBaseUrl.mockReturnValue(true)
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      const v = saved.get(k)
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('uses the API transport against a first-party endpoint', () => {
    expect(getToolSearchTransport()).toBe('api')
    expect(isLocalToolSearchTransport()).toBe(false)
  })

  // The regression this whole transport split exists for: an ANTHROPIC_BASE_URL
  // proxy used to disable tool search outright, so every deferrable tool was
  // sent inline on every request instead of being deferred.
  it('falls back to the local transport behind an ANTHROPIC_BASE_URL proxy', () => {
    providers.isFirstPartyAnthropicBaseUrl.mockReturnValue(false)
    expect(getToolSearchTransport()).toBe('local')
  })

  it('keeps the API transport for non-firstParty providers on their own endpoints', () => {
    // Vertex/Bedrock/Foundry have their own hosts, so a non-first-party base
    // URL says nothing about beta support for them.
    providers.getAPIProvider.mockReturnValue('bedrock')
    providers.isFirstPartyAnthropicBaseUrl.mockReturnValue(false)
    expect(getToolSearchTransport()).toBe('api')
  })

  it('honors the experimental-beta kill switch without giving up deferral', () => {
    process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = '1'
    expect(getToolSearchTransport()).toBe('local')
  })

  it('accepts ENABLE_TOOL_SEARCH=local as an explicit opt-in', () => {
    process.env.ENABLE_TOOL_SEARCH = 'local'
    expect(getToolSearchTransport()).toBe('local')
  })

  it('does not switch transports for the other ENABLE_TOOL_SEARCH values', () => {
    for (const value of ['true', 'false', 'auto', 'auto:25']) {
      process.env.ENABLE_TOOL_SEARCH = value
      expect(getToolSearchTransport()).toBe('api')
    }
  })
})
