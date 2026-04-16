import type { Command, LocalCommandCall } from '../types/command.js'
import { sessionBridge } from '../utils/sessionBridge.js'
import { getLocalIPAddress, getLocalIPv6Address, startHTTPServer } from '../utils/httpServer.js'

const TUNNEL_URL = process.env['TUNNEL_URL'] || ''
let stopHTTPServer: (() => Promise<void>) | null = null

const call: LocalCommandCall = async (args) => {
  if (args.trim() === 'stop') {
    if (stopHTTPServer) {
      await stopHTTPServer()
      stopHTTPServer = null
    }
    sessionBridge.setPort(0)
    return { type: 'text', value: 'Remote control stopped' }
  }

  if (sessionBridge.getPort() !== null && sessionBridge.getPort()! > 0) {
    const ip = getLocalIPAddress()
    const ipv6 = getLocalIPv6Address()
    const token = process.env.REMOTE_TOKEN
    const tokenSuffix = token ? `?token=${encodeURIComponent(token)}` : ''
    const port = sessionBridge.getPort()
    const lines = [`Remote control already running at http://${ip}:${port}/${tokenSuffix}`]
    if (ipv6) lines.push(`                               http://[${ipv6}]:${port}/${tokenSuffix}`)
    if (TUNNEL_URL) lines.push(`Tunnel: ${TUNNEL_URL}`)
    if (!process.env.REMOTE_TOKEN)
      lines.push(`⚠ No REMOTE_TOKEN set — public URL is open to anyone`)
    return { type: 'text', value: lines.join('\n') }
  }

  const port = parseInt(args.trim()) || 3001

  try {
    stopHTTPServer = await startHTTPServer(port)
  } catch (e) {
    return { type: 'text', value: `Failed to start server on port ${port}: ${(e as Error).message}` }
  }

  sessionBridge.setPort(port)
  const ip = getLocalIPAddress()
  const ipv6 = getLocalIPv6Address()
  const token = process.env.REMOTE_TOKEN
  const tokenSuffix = token ? `?token=${encodeURIComponent(token)}` : ''

  const lines = [
    `HTTP server started on port ${port}`,
    `Local:  http://${ip}:${port}/${tokenSuffix}`,
  ]
  if (ipv6) lines.push(`Local:  http://[${ipv6}]:${port}/${tokenSuffix}`)

  if (TUNNEL_URL) {
    lines.push(`Public: ${TUNNEL_URL}`)
  }

  if (!process.env.REMOTE_TOKEN) {
    lines.push(``)
    lines.push(`⚠ WARNING: No REMOTE_TOKEN set — public URL is open to anyone.`)
    lines.push(`  Set REMOTE_TOKEN=<secret> before starting to require authentication.`)
  }

  lines.push(`Stop with: /remote-control stop`)

  return { type: 'text', value: lines.join('\n') }
}

const remoteControl = {
  type: 'local',
  name: 'remote-control',
  description: 'Start HTTP server + Cloudflare tunnel for remote access via browser',
  isEnabled: () => true,
  isHidden: false,
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default remoteControl
