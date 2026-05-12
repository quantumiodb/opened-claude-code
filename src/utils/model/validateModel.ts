// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { MODEL_ALIASES } from './aliases.js'
import { isModelAllowed } from './modelAllowlist.js'

const KNOWN_DEEPSEEK_MODELS = new Set(['deepseek-v4-pro', 'deepseek-v4-flash'])

/**
 * Validates a model name. DeepSeek's API silently remaps unknown model names
 * to deepseek-v4-flash instead of returning 404, so API-based validation is
 * not reliable — we use a known-models allowlist.
 */
export async function validateModel(
  model: string,
): Promise<{ valid: boolean; error?: string; warning?: string }> {
  const normalizedModel = model.trim()

  if (!normalizedModel) {
    return { valid: false, error: 'Model name cannot be empty' }
  }

  if (!isModelAllowed(normalizedModel)) {
    return {
      valid: false,
      error: `Model '${normalizedModel}' is not in the list of available models`,
    }
  }

  const lowerModel = normalizedModel.toLowerCase()
  if ((MODEL_ALIASES as readonly string[]).includes(lowerModel)) {
    return { valid: true }
  }

  if (KNOWN_DEEPSEEK_MODELS.has(lowerModel)) {
    return { valid: true }
  }

  return {
    valid: false,
    error: `模型 '${normalizedModel}' 不是已知的 DeepSeek 模型（会被服务端静默映射为 deepseek-v4-flash）。可用模型：deepseek-v4-pro, deepseek-v4-flash`,
  }
}
