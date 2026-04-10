import { describe, expect, it, vi } from 'vitest'
import { getLatestVersionIfEnabled } from '../autoUpdaterGate.js'

describe('getLatestVersionIfEnabled', () => {
  it('does not fetch latest version when auto-updater is disabled', async () => {
    const fetchLatestVersion = vi.fn(async () => '9.9.9')

    const result = await getLatestVersionIfEnabled('latest', {
      isDisabled: true,
      fetchLatestVersion,
    })

    expect(result).toBeNull()
    expect(fetchLatestVersion).not.toHaveBeenCalled()
  })

  it('fetches latest version when auto-updater is enabled', async () => {
    const fetchLatestVersion = vi.fn(async () => '9.9.9')

    const result = await getLatestVersionIfEnabled('latest', {
      isDisabled: false,
      fetchLatestVersion,
    })

    expect(result).toBe('9.9.9')
    expect(fetchLatestVersion).toHaveBeenCalledTimes(1)
    expect(fetchLatestVersion).toHaveBeenCalledWith('latest')
  })
})
