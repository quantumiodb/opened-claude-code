import { useEffect } from 'react'
import { formatTotalCost, saveCurrentSessionCosts } from './cost-tracker.js'
import type { FpsMetrics } from './utils/fpsTracker.js'

export function useCostSummary(
  getFpsMetrics?: () => FpsMetrics | undefined,
): void {
  useEffect(() => {
    const f = () => {
      // DeepSeek: there's no Anthropic console billing tier; always print.
      process.stdout.write('\n' + formatTotalCost() + '\n')
      saveCurrentSessionCosts(getFpsMetrics?.())
    }
    process.on('exit', f)
    return () => {
      process.off('exit', f)
    }
  }, [])
}
