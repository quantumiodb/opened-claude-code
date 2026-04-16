import { spawn, ChildProcess } from 'child_process'
import type { Command, LocalCommandCall } from '../types/command.js'
import { sessionBridge } from '../utils/sessionBridge.js'
import { getLocalIPAddress, getLocalIPv6Address, startHTTPServer } from '../utils/httpServer.js'

const TUNNEL_URL = process.env['TUNNEL_URL'] || ''
let tunnelProcess: ChildProcess | null = null
let stopHTTPServer: (() => Promise<void>) | null = null

function startCloudflaredTunnel(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'cloudflared',
      ['tunnel', '--config', `${process.env.HOME}/.cloudflared/config.yml`, 'run'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` },
      }
    )
    tunnelProcess = proc

    let resolved = false
    let stderrBuf = ''
    const onReady = (data: Buffer) => {
      const line = data.toString()
      stderrBuf += line
      if (
        !resolved &&
        (line.includes('Registered tunnel connection') ||
          line.includes('Connection') ||
          line.includes('INF'))
      ) {
        resolved = true
        resolve()
      }
    }

    proc.stdout?.on('data', onReady)
    proc.stderr?.on('data', onReady)

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true
        reject(new Error(`cloudflared error: ${err.message}\nstderr: ${stderrBuf}`))
      }
    })

    proc.on('exit', (code) => {
      tunnelProcess = null
      if (!resolved) {
        resolved = true
        reject(new Error(`cloudflared exited with code ${code}\nstderr: ${stderrBuf}`))
      }
    })

    // Resolve after 3s even if no ready signal
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve()
      }
    }, 3000)
  })
}

const call: LocalCommandCall = async (args) => {
  if (args.trim() === 'stop') {
    if (tunnelProcess) {
      tunnelProcess.kill()
      tunnelProcess = null
    }
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
    if (tunnelProcess) lines.push(`Tunnel: ${TUNNEL_URL}`)
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
    try {
      await startCloudflaredTunnel()
      lines.push(`Public: ${TUNNEL_URL}`)
    } catch (e) {
      lines.push(`Tunnel failed: ${(e as Error).message} (local access still works)`)
    }
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
