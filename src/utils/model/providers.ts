import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { isEnvTruthy } from '../envUtils.js'

export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry'

export function getAPIProvider(): APIProvider {
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
    ? 'bedrock'
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
      ? 'vertex'
      : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
        ? 'foundry'
        : 'firstParty'
}

/**
 * True when the active backend is GLM (zhipu), routed via an
 * Anthropic-compatible firstParty endpoint (ANTHROPIC_BASE_URL). GLM stays on
 * the firstParty APIProvider — this flag only gates model-aware behavior
 * (output token limits, auto-mode, betas) that the generic firstParty path
 * doesn't know about.
 */
export function isGLMProvider(): boolean {
  return isEnvTruthy(process.env.CLAUDE_USE_GLM)
}

/**
 * True when the active backend is DeepSeek, routed via an
 * Anthropic-compatible firstParty endpoint. DeepSeek stays on the firstParty
 * APIProvider — this flag gates DeepSeek-specific adaptations (thinking
 * simplification, [ERROR] tool_result prefixing, 429 retry policy, model
 * validation allowlist).
 */
export function isDeepSeekProvider(): boolean {
  return isEnvTruthy(process.env.CLAUDE_USE_DEEPSEEK)
}

export function isDeepSeekBaseUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false
  try {
    return new URL(baseUrl).host.endsWith('deepseek.com')
  } catch {
    return false
  }
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}
