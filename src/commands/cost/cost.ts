import { formatTotalCost } from '../../cost-tracker.js'
import type { LocalCommandCall } from '../../types/command.js'

// DeepSeek: no Claude.ai subscription; always show the formatted cost.
export const call: LocalCommandCall = async () => {
  return { type: 'text', value: formatTotalCost() }
}
