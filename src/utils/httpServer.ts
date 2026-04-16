import * as http from 'http'
import * as os from 'os'
import { sessionBridge } from './sessionBridge.js'
import type { Message } from '../types/message.js'

export function getLocalIPAddress(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name]!
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address
      }
    }
  }
  return 'localhost'
}

export function getLocalIPv6Address(): string | null {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name]!
    for (const alias of iface) {
      if (alias.family === 'IPv6' && !alias.internal && !alias.address.startsWith('fe80')) {
        return alias.address
      }
    }
  }
  return null
}

function serializeMessages(messages: Message[]) {
  const result: { role: string; content: string }[] = []
  for (const m of messages) {
    if (m.type === 'user') {
      const content = (m as any).message?.content
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text as string)
                .join('')
            : ''
      if (text.trim()) result.push({ role: 'user', content: text })
    } else if (m.type === 'assistant') {
      const content = (m as any).message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            const text = block.text as string
            if (text.trim()) result.push({ role: 'assistant', content: text })
          } else if (block.type === 'thinking') {
            const thinking = block.thinking as string
            if (thinking.trim()) result.push({ role: 'thinking', content: thinking })
          } else if (block.type === 'tool_use') {
            const { name, input } = block as {
              type: 'tool_use'
              name: string
              input: Record<string, unknown>
            }
            let desc = name
            if (input) {
              if (input.file_path) desc += `: ${input.file_path}`
              else if (input.command) desc += `: ${input.command}`
              else if (input.pattern) desc += ` "${input.pattern}"`
            }
            result.push({ role: 'tool', content: desc })
          }
        }
      }
    }
  }
  return result
}

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Claude Remote</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f7;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #header {
      background: #1c1c1e;
      color: #f5f5f7;
      padding: 14px 16px;
      font-size: 17px;
      font-weight: 600;
      text-align: center;
      flex-shrink: 0;
    }
    #header span { color: #ff9f0a; }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      -webkit-overflow-scrolling: touch;
    }
    .bubble {
      max-width: 86%;
      padding: 10px 14px;
      border-radius: 18px;
      font-size: 15px;
      line-height: 1.45;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .bubble.user {
      background: #0a84ff;
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 5px;
    }
    .bubble.assistant {
      background: white;
      color: #1c1c1e;
      align-self: flex-start;
      border-bottom-left-radius: 5px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .bubble.status {
      background: #e5e5ea;
      color: #6e6e73;
      align-self: flex-start;
      font-style: italic;
      font-size: 14px;
      border-bottom-left-radius: 5px;
    }
    /* Tool use pill */
    .tool-pill {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #f2f2f7;
      border: 1px solid #d1d1d6;
      color: #3c3c43;
      border-radius: 12px;
      padding: 5px 11px;
      font-size: 13px;
      font-family: 'SF Mono', Menlo, monospace;
    }
    .tool-pill .icon { font-style: normal; }
    /* Thinking block — collapsible */
    .thinking-block {
      align-self: flex-start;
      max-width: 86%;
      background: #f9f4ff;
      border: 1px solid #ddd6fe;
      border-radius: 14px;
      overflow: hidden;
      font-size: 13px;
    }
    .thinking-block summary {
      padding: 8px 12px;
      cursor: pointer;
      color: #7c3aed;
      font-weight: 500;
      user-select: none;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .thinking-block summary::-webkit-details-marker { display: none; }
    .thinking-block summary::before { content: '▶'; font-size: 10px; transition: transform 0.15s; }
    .thinking-block[open] summary::before { transform: rotate(90deg); }
    .thinking-content {
      padding: 0 12px 10px;
      color: #4c1d95;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
      max-height: 300px;
      overflow-y: auto;
    }
    #input-area {
      background: white;
      padding: 10px 12px;
      border-top: 1px solid #d1d1d6;
      display: flex;
      gap: 8px;
      align-items: flex-end;
      flex-shrink: 0;
      padding-bottom: max(10px, env(safe-area-inset-bottom));
    }
    #input {
      flex: 1;
      border: 1.5px solid #d1d1d6;
      border-radius: 20px;
      padding: 9px 14px;
      font-size: 15px;
      outline: none;
      resize: none;
      max-height: 120px;
      line-height: 1.4;
      font-family: inherit;
      background: #f5f5f7;
    }
    #input:focus { border-color: #0a84ff; background: white; }
    #send {
      background: #0a84ff;
      color: white;
      border: none;
      border-radius: 50%;
      width: 38px;
      height: 38px;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    #send:disabled { background: #c7c7cc; cursor: default; }
    #send:active:not(:disabled) { background: #0070d4; }
    /* Permission modal */
    #perm-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 100;
      align-items: flex-end;
      justify-content: center;
      padding: 16px;
      padding-bottom: max(16px, env(safe-area-inset-bottom));
    }
    #perm-overlay.visible { display: flex; }
    #perm-card {
      background: white;
      border-radius: 16px;
      padding: 20px;
      width: 100%;
      max-width: 480px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    #perm-title {
      font-size: 16px;
      font-weight: 600;
      color: #1c1c1e;
      margin-bottom: 6px;
    }
    #perm-desc {
      font-size: 14px;
      color: #6e6e73;
      margin-bottom: 10px;
      line-height: 1.4;
    }
    #perm-input-preview {
      background: #f5f5f7;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      font-family: 'SF Mono', Menlo, monospace;
      color: #3c3c43;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 80px;
      overflow-y: auto;
      margin-bottom: 14px;
    }
    .perm-buttons { display: flex; gap: 8px; }
    .perm-btn {
      flex: 1;
      padding: 12px 4px;
      border: none;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
    }
    .perm-btn.allow { background: #34c759; color: white; }
    .perm-btn.allow-perm { background: #0a84ff; color: white; }
    .perm-btn.reject { background: #ff3b30; color: white; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    /* Markdown content styles */
    .bubble.assistant p { margin: 0 0 8px; }
    .bubble.assistant p:last-child { margin-bottom: 0; }
    .bubble.assistant pre { background: #f2f2f7; border-radius: 8px; padding: 10px; overflow-x: auto; font-size: 13px; }
    .bubble.assistant code { background: #f2f2f7; border-radius: 4px; padding: 1px 4px; font-size: 13px; font-family: 'SF Mono', Menlo, monospace; }
    .bubble.assistant pre code { background: none; padding: 0; }
    .bubble.assistant ul, .bubble.assistant ol { padding-left: 20px; margin: 4px 0; }
    .bubble.assistant li { margin: 2px 0; }
    .bubble.assistant h1, .bubble.assistant h2, .bubble.assistant h3 { margin: 8px 0 4px; font-size: 15px; }
    .bubble.assistant a { color: #0a84ff; }
    .bubble.assistant blockquote { border-left: 3px solid #d1d1d6; margin: 4px 0; padding-left: 10px; color: #6e6e73; }
    .bubble.assistant strong { font-weight: 600; }
  </style>
</head>
<body>
  <div id="header">Claude <span>Remote</span></div>
  <div id="messages"></div>
  <div id="perm-overlay">
    <div id="perm-card">
      <h3 id="perm-title">Permission Request</h3>
      <div id="perm-desc"></div>
      <div id="perm-input-preview"></div>
      <div class="perm-buttons">
        <button class="perm-btn allow" onclick="respond('allow')">Allow</button>
        <button class="perm-btn allow-perm" onclick="respond('allow-permanent')">Always Allow</button>
        <button class="perm-btn reject" onclick="respond('reject')">Deny</button>
      </div>
    </div>
  </div>
  <div id="input-area">
    <textarea id="input" placeholder="Message..." rows="1"></textarea>
    <button id="send" aria-label="Send">&#9650;</button>
  </div>
  <script>
    const messagesEl = document.getElementById('messages')
    const inputEl = document.getElementById('input')
    const sendBtn = document.getElementById('send')
    const permOverlay = document.getElementById('perm-overlay')
    let currentPermReqId = null

    // Read token from URL (?token=xxx) and store for this session
    const urlToken = new URLSearchParams(location.search).get('token')
    if (urlToken) sessionStorage.setItem('api_token', urlToken)
    const AUTH_TOKEN = sessionStorage.getItem('api_token')
    const authHeaders = AUTH_TOKEN ? { 'Authorization': 'Bearer ' + AUTH_TOKEN } : {}
    function authedUrl(path) {
      return AUTH_TOKEN ? path + '?token=' + encodeURIComponent(AUTH_TOKEN) : path
    }

    function showPermModal(p) {
      currentPermReqId = p.requestId
      document.getElementById('perm-title').textContent = p.toolName + ' — Permission Request'
      document.getElementById('perm-desc').textContent = p.description || ''
      const preview = document.getElementById('perm-input-preview')
      const inputStr = Object.entries(p.input || {})
        .map(([k, v]) => k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v)))
        .join('\\n')
      preview.textContent = inputStr || ''
      preview.style.display = inputStr ? 'block' : 'none'
      permOverlay.classList.add('visible')
    }

    function hidePermModal() {
      currentPermReqId = null
      permOverlay.classList.remove('visible')
    }

    async function respond(decision) {
      const id = currentPermReqId
      if (!id) return
      hidePermModal()
      try {
        await fetch('/permission/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ requestId: id, decision }),
        })
      } catch (e) {}
    }

    function addBubble(role, text) {
      const div = document.createElement('div')
      div.className = 'bubble ' + role
      if (role === 'assistant' && typeof marked !== 'undefined') {
        div.innerHTML = marked.parse(text)
      } else {
        div.textContent = text
      }
      messagesEl.appendChild(div)
      scrollToBottom()
      return div
    }

    function updateBubble(div, role, text) {
      if (role === 'assistant' && typeof marked !== 'undefined') {
        div.innerHTML = marked.parse(text)
      } else {
        div.textContent = text
      }
      scrollToBottom()
    }

    function addToolPill(toolName) {
      const div = document.createElement('div')
      div.className = 'tool-pill'
      div.innerHTML = '<span class="icon">&#9881;</span>' + escapeHtml(toolName)
      messagesEl.appendChild(div)
      scrollToBottom()
      return div
    }

    function addThinkingBlock(text) {
      const details = document.createElement('details')
      details.className = 'thinking-block'
      const summary = document.createElement('summary')
      summary.textContent = 'Thinking'
      const content = document.createElement('div')
      content.className = 'thinking-content'
      content.textContent = text
      details.appendChild(summary)
      details.appendChild(content)
      messagesEl.appendChild(details)
      scrollToBottom()
      return { details, content }
    }

    function escapeHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    }

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight
    }

    // Render full message list from server data
    function renderMessages(msgs) {
      messagesEl.innerHTML = ''
      for (const m of msgs) {
        if (m.role === 'thinking') addThinkingBlock(m.content)
        else if (m.role === 'tool') addToolPill(m.content)
        else addBubble(m.role, m.content)
      }
    }

    // --- SSE live sync for terminal-initiated messages ---
    let isSending = false
    let lastRenderedJSON = ''

    function connectLiveMessages() {
      const evtSource = new EventSource(authedUrl('/messages/live'))
      evtSource.onmessage = (e) => {
        let event
        try { event = JSON.parse(e.data) } catch { return }
        if (event.type === 'messages') {
          const json = JSON.stringify(event.messages)
          if (json === lastRenderedJSON) return
          lastRenderedJSON = json
          renderMessages(event.messages)
        } else if (event.type === 'permission_request') {
          showPermModal(event)
        } else if (event.type === 'permission_resolved') {
          if (currentPermReqId === event.requestId) hidePermModal()
        }
      }
      evtSource.onerror = () => {
        // EventSource auto-reconnects, no action needed
      }
    }

    // Load initial history then connect live stream
    async function loadHistory() {
      try {
        const r = await fetch('/messages', { headers: authHeaders })
        if (!r.ok) return
        const msgs = await r.json()
        lastRenderedJSON = JSON.stringify(msgs)
        renderMessages(msgs)
      } catch (e) {}
    }

    async function sendMessage() {
      const prompt = inputEl.value.trim()
      if (!prompt) return

      inputEl.value = ''
      inputEl.style.height = 'auto'
      sendBtn.disabled = true
      inputEl.disabled = true

      isSending = true
      addBubble('user', prompt)
      const statusEl = addBubble('status', 'Thinking...')

      try {
        // POST to /chat — server waits for REPL to finish before responding.
        // Live streaming is handled by the SSE /messages/live connection.
        const response = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ prompt }),
        })

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: response.statusText }))
          statusEl.textContent = 'Error: ' + (err.error || response.statusText)
          return
        }

        // Response is complete — statusEl will be removed on next SSE messages update
        if (statusEl.parentNode) statusEl.remove()

      } catch (e) {
        if (statusEl.parentNode) {
          statusEl.textContent = 'Connection error: ' + (e.message || String(e))
        } else {
          addBubble('status', 'Connection error: ' + (e.message || String(e)))
        }
      } finally {
        isSending = false
        sendBtn.disabled = false
        inputEl.disabled = false
        inputEl.focus()
      }
    }

    sendBtn.addEventListener('click', sendMessage)
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    })
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto'
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'
    })

    loadHistory().then(() => connectLiveMessages())
  </script>
</body>
</html>`

export async function startHTTPServer(port: number): Promise<() => Promise<void>> {
  return new Promise((resolve, reject) => {
    // Track connected SSE clients for live message push
    const sseClients = new Set<http.ServerResponse>()

    const broadcastSSE = (data: object) => {
      const msg = `data: ${JSON.stringify(data)}\n\n`
      for (const client of sseClients) {
        try {
          client.write(msg)
        } catch {
          sseClients.delete(client)
        }
      }
    }

    sessionBridge.onPermissionRequest((p) => broadcastSSE({ type: 'permission_request', ...p }))
    sessionBridge.onPermissionResolved((id) =>
      broadcastSSE({ type: 'permission_resolved', requestId: id })
    )

    // Debounced broadcast to SSE clients when messages change
    let broadcastTimer: ReturnType<typeof setTimeout> | null = null
    sessionBridge.onMessagesChange(() => {
      if (sseClients.size === 0) return
      if (broadcastTimer) clearTimeout(broadcastTimer)
      broadcastTimer = setTimeout(() => {
        try {
          const messages = sessionBridge.getMessages()
          const serialized = serializeMessages(messages)
          broadcastSSE({ type: 'messages', messages: serialized })
        } catch {}
      }, 300)
    })

    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      const urlParsed = new URL(req.url ?? '/', `http://localhost`)
      const urlPath = urlParsed.pathname

      // Optional auth: skip for the HTML page itself (browser can't send headers on page load)
      const apiToken = process.env.REMOTE_TOKEN
      if (apiToken && !(req.method === 'GET' && urlPath === '/')) {
        const bearerHeader = req.headers.authorization
        const queryToken = urlParsed.searchParams.get('token')
        const provided = bearerHeader === `Bearer ${apiToken}` || queryToken === apiToken
        if (!provided) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Unauthorized' }))
          return
        }
      }

      if (req.method === 'GET' && urlPath === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store',
        })
        res.end(HTML)
        return
      }

      if (req.method === 'GET' && urlPath === '/messages') {
        const messages = sessionBridge.getMessages()
        const serialized = serializeMessages(messages)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(serialized))
        return
      }

      // SSE endpoint: push message changes in real-time
      if (req.method === 'GET' && urlPath === '/messages/live') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        res.write(': connected\n\n')
        sseClients.add(res)
        for (const p of sessionBridge.getPendingPermissions()) {
          res.write(`data: ${JSON.stringify({ type: 'permission_request', ...p })}\n\n`)
        }
        req.on('close', () => sseClients.delete(res))
        return
      }

      if (req.method === 'GET' && urlPath === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            status: 'ok',
            active: sessionBridge.isActive(),
            busy: sessionBridge.isBusy(),
          })
        )
        return
      }

      if (req.method === 'POST' && urlPath === '/chat') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          let prompt: string
          let image: { base64: string; mediaType: string } | undefined
          try {
            const parsed = JSON.parse(body)
            prompt = parsed.prompt
            if (!prompt || typeof prompt !== 'string') throw new Error('missing prompt')
            if (parsed.image && typeof parsed.image === 'string') {
              image = {
                base64: parsed.image,
                mediaType: parsed.image_media_type || 'image/jpeg',
              }
            }
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid request: prompt required' }))
            return
          }

          if (!sessionBridge.isActive()) {
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'No active REPL session' }))
            return
          }

          if (sessionBridge.isBusy()) {
            res.writeHead(409, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Session is busy, try again later' }))
            return
          }

          try {
            // submit() fires the query and awaits REPL idle (real isLoading → false)
            // Live messages are pushed to the browser via SSE /messages/live
            await sessionBridge.submit(prompt, image)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: (e as Error).message }))
          }
        })
        return
      }

      if (req.method === 'POST' && urlPath === '/permission/respond') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          let requestId: string, decision: string
          try {
            const parsed = JSON.parse(body)
            requestId = parsed.requestId
            decision = parsed.decision
            if (!requestId || !['allow', 'allow-permanent', 'reject'].includes(decision)) {
              throw new Error('invalid')
            }
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid request' }))
            return
          }
          await sessionBridge.resolvePermission(
            requestId,
            decision as 'allow' | 'allow-permanent' | 'reject'
          )
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        })
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
    })

    // Keepalive for SSE connections (every 30s)
    setInterval(() => {
      for (const client of sseClients) {
        try {
          client.write(': keepalive\n\n')
        } catch {
          sseClients.delete(client)
        }
      }
    }, 30000)

    const stopServer = () =>
      new Promise<void>((res) => {
        for (const client of sseClients) {
          try {
            client.end()
          } catch {}
        }
        sseClients.clear()
        server.close(() => res())
      })

    server.listen(port, '::', () => resolve(stopServer))
    server.on('error', reject)
  })
}
