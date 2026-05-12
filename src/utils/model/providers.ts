import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { isEnvTruthy } from '../envUtils.js'

export type APIProvider =
  | 'firstParty'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'glm'
  | 'deepseek'

export function getAPIProvider(): APIProvider {
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
    ? 'bedrock'
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
      ? 'vertex'
      : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
        ? 'foundry'
        : isEnvTruthy(process.env.CLAUDE_USE_GLM)
          ? 'glm'
          : isEnvTruthy(process.env.CLAUDE_CODE_USE_DEEPSEEK)
            ? 'deepseek'
            : 'firstParty'
}

/**
 * True when the active provider is GLM (zhipu).
 * GLM rides the firstParty SDK path (Anthropic-compatible endpoint via
 * ANTHROPIC_BASE_URL) but needs model-aware gating for output limits, betas,
 * and auto-permission mode.
 */
export function isGLMProvider(): boolean {
  return getAPIProvider() === 'glm'
}

/**
 * True when the active provider is DeepSeek.
 * DeepSeek rides the firstParty SDK path but needs provider-aware gating for
 * thinking simplification, [ERROR] tool_result prefixing, 429 retry policy,
 * and model validation (DeepSeek silently remaps unknown model names).
 */
export function isDeepSeekProvider(): boolean {
  return getAPIProvider() === 'deepseek'
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
