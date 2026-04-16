/**
 * Pure Telegram Bot API client using fetch().
 * No npm dependencies — talks directly to api.telegram.org.
 */

const TELEGRAM_API = 'https://api.telegram.org'
const MAX_MESSAGE_LENGTH = 4096
const POLL_TIMEOUT_SECS = 30

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
}

export type TelegramVoice = {
  file_id: string
  file_unique_id: string
  duration: number
  mime_type?: string
  file_size?: number
}

export type TelegramPhotoSize = {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

export type TelegramMessage = {
  message_id: number
  from?: { id: number; first_name: string; username?: string }
  chat: { id: number; type: string }
  date: number
  text?: string
  voice?: TelegramVoice
  photo?: TelegramPhotoSize[]
  caption?: string
}

type MessageHandler = (text: string, chatId: number) => void
type VoiceHandler = (voice: TelegramVoice, chatId: number) => void
type PhotoHandler = (
  photo: TelegramPhotoSize[],
  caption: string | undefined,
  chatId: number
) => void

export class TelegramBot {
  private token: string
  private ownerChatId: number
  private running = false
  private offset = 0
  private messageHandler: MessageHandler | null = null
  private voiceHandler: VoiceHandler | null = null
  private photoHandler: PhotoHandler | null = null
  private messageCount = 0
  private abortController: AbortController | null = null

  constructor(token: string, ownerChatId: number) {
    this.token = token
    this.ownerChatId = ownerChatId
  }

  /** Start long-polling loop for incoming messages. */
  start(): void {
    if (this.running) return
    this.running = true
    this.poll()
  }

  /** Stop polling. */
  stop(): void {
    this.running = false
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  isRunning(): boolean {
    return this.running
  }

  getOwnerChatId(): number {
    return this.ownerChatId
  }

  getMessageCount(): number {
    return this.messageCount
  }

  /** Register a handler for incoming messages (owner-only). */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler
  }

  /** Register a handler for incoming voice messages (owner-only). */
  onVoice(handler: VoiceHandler): void {
    this.voiceHandler = handler
  }

  /** Register a handler for incoming photo messages (owner-only). */
  onPhoto(handler: PhotoHandler): void {
    this.photoHandler = handler
  }

  /** Get a file download URL from a Telegram file_id. */
  async getFileUrl(fileId: string): Promise<string> {
    const file = await this.apiCall<{ file_path: string }>('getFile', { file_id: fileId })
    return `${TELEGRAM_API}/file/bot${this.token}/${file.file_path}`
  }

  /** Download a file from a Telegram file URL. */
  async downloadFile(url: string): Promise<Buffer> {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Failed to download file: ${res.status}`)
    }
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  /** Send a text message, auto-splitting at 4096 chars. */
  async sendMessage(text: string, parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'): Promise<void> {
    const chunks = splitMessage(text)
    for (const chunk of chunks) {
      await this.apiCall('sendMessage', {
        chat_id: this.ownerChatId,
        text: chunk,
        ...(parseMode ? { parse_mode: parseMode } : {}),
      })
    }
  }

  /** Send a message with Telegram Markdown formatting, fallback to plain text on failure. */
  async sendMarkdown(text: string): Promise<void> {
    const formatted = toTelegramMarkdown(text)
    try {
      await this.sendMessage(formatted, 'Markdown')
    } catch {
      // Fallback to plain text if Markdown parsing fails
      await this.sendMessage(text)
    }
  }

  /** Send a photo from a Buffer. */
  async sendPhoto(photo: Buffer, caption?: string): Promise<void> {
    const url = `${TELEGRAM_API}/bot${this.token}/sendPhoto`
    const formData = new FormData()
    formData.append('chat_id', String(this.ownerChatId))
    formData.append('photo', new Blob([new Uint8Array(photo)]), 'photo.jpg')
    if (caption) {
      formData.append('caption', caption)
    }

    const res = await fetch(url, { method: 'POST', body: formData })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Telegram API sendPhoto failed: ${res.status} ${body}`)
    }
  }

  /** Send a voice message from a Buffer (MP3/OGG). */
  async sendVoice(audio: Buffer): Promise<void> {
    const url = `${TELEGRAM_API}/bot${this.token}/sendVoice`
    const formData = new FormData()
    formData.append('chat_id', String(this.ownerChatId))
    formData.append('voice', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'reply.wav')

    const res = await fetch(url, { method: 'POST', body: formData })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Telegram API sendVoice failed: ${res.status} ${body}`)
    }
  }

  /** Show typing indicator. */
  async sendChatAction(action: string = 'typing'): Promise<void> {
    await this.apiCall('sendChatAction', {
      chat_id: this.ownerChatId,
      action,
    })
  }

  /** Register bot commands shown in Telegram's menu. */
  async setMyCommands(commands: Array<{ command: string; description: string }>): Promise<void> {
    await this.apiCall('setMyCommands', { commands })
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        this.abortController = new AbortController()
        const updates = await this.apiCall<TelegramUpdate[]>(
          'getUpdates',
          {
            offset: this.offset,
            timeout: POLL_TIMEOUT_SECS,
          },
          this.abortController.signal
        )

        if (!this.running) break

        for (const update of updates) {
          this.offset = update.update_id + 1
          const msg = update.message
          if (!msg) continue
          const chatId = msg.chat.id
          // Owner-only: silently ignore messages from non-owner
          if (chatId !== this.ownerChatId) continue

          if (msg.text) {
            this.messageCount++
            if (this.messageHandler) {
              this.messageHandler(msg.text, chatId)
            }
          } else if (msg.voice) {
            this.messageCount++
            if (this.voiceHandler) {
              this.voiceHandler(msg.voice, chatId)
            }
          } else if (msg.photo && msg.photo.length > 0) {
            this.messageCount++
            if (this.photoHandler) {
              this.photoHandler(msg.photo, msg.caption, chatId)
            }
          }
        }
      } catch (err) {
        if (!this.running) break
        await sleep(3000)
      }
    }
  }

  private async apiCall<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T> {
    const url = `${TELEGRAM_API}/bot${this.token}/${method}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Telegram API ${method} failed: ${res.status} ${body}`)
    }

    const json = (await res.json()) as { ok: boolean; result: T }
    if (!json.ok) {
      throw new Error(`Telegram API ${method} returned ok=false`)
    }
    return json.result
  }
}

/** Split text at last newline before MAX_MESSAGE_LENGTH. */
function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining)
      break
    }

    let splitIdx = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH)
    if (splitIdx <= 0) {
      splitIdx = MAX_MESSAGE_LENGTH
    }

    chunks.push(remaining.slice(0, splitIdx))
    remaining = remaining.slice(splitIdx).replace(/^\n/, '')
  }

  return chunks
}

/**
 * Convert standard Markdown to Telegram legacy Markdown.
 * Telegram legacy: *bold* _italic_ `code` ```pre``` [text](url)
 */
export function toTelegramMarkdown(text: string): string {
  // Protect fenced code blocks
  const codeBlocks: string[] = []
  let result = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match)
    return `\x00CB${codeBlocks.length - 1}\x00`
  })

  // Protect inline code
  const inlineCodes: string[] = []
  result = result.replace(/`[^`]+`/g, (match) => {
    inlineCodes.push(match)
    return `\x00IC${inlineCodes.length - 1}\x00`
  })

  // **bold** → *bold*
  const bolds: string[] = []
  result = result.replace(/\*\*(.+?)\*\*/g, (_, content) => {
    bolds.push(`*${content}*`)
    return `\x00BD${bolds.length - 1}\x00`
  })

  // *italic* → _italic_
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '_$1_')

  // Restore bold
  result = result.replace(/\x00BD(\d+)\x00/g, (_, i) => bolds[+i]!)

  // # Heading → *Heading*
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*')

  // Restore inline code
  result = result.replace(/\x00IC(\d+)\x00/g, (_, i) => inlineCodes[+i]!)

  // Restore code blocks
  result = result.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[+i]!)

  return result
}

/** Mask sensitive tokens in text (API keys, etc.) */
export function maskSensitive(text: string): string {
  return text
    .replace(/sk-ant-[a-zA-Z0-9_-]{10,}/g, 'sk-ant-***')
    .replace(/token=[a-zA-Z0-9_-]{10,}/gi, 'token=***')
    .replace(/Bearer [a-zA-Z0-9_.-]{10,}/g, 'Bearer ***')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// Re-export for testing
export { splitMessage }
