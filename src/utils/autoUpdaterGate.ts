import type { ReleaseChannel } from './config.js'

export async function getLatestVersionIfEnabled(
  channel: ReleaseChannel,
  options: {
    isDisabled: boolean
    fetchLatestVersion: (channel: ReleaseChannel) => Promise<string | null>
  },
): Promise<string | null> {
  if (options.isDisabled) {
    return null
  }
  return options.fetchLatestVersion(channel)
}

