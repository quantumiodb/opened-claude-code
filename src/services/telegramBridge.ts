/**
 * Connects TelegramBot to sessionBridge (for interactive messages).
 */

import { TelegramBot, type TelegramVoice, type TelegramPhotoSize, maskSensitive } from './telegramBot.js'
import { sessionBridge } from '../utils/sessionBridge.js'
import { transcribeAudio } from './groqWhisper.js'
import { synthesizeSpeech, shouldUseTTS, stripMarkdown } from './groqTTS.js'
import { logError } from '../utils/log.js'
import { getCommands, getCommand, hasCommand } from '../commands.js'
import { getCwd } from '../utils/cwd.js'

let botInstance: TelegramBot | null = null
let cleanupFn: (() => void) | null = null

/** Pending two-step command waiting for user to provide argument. */
let pendingCommand: { skill: string } | null = null

type QueuedMessage =
  | { text: string }
  | { voice: TelegramVoice }
  | { photo: TelegramPhotoSize[]; caption: string | undefined }

/** Wire bot to sessionBridge. Returns cleanup function. */
export function startTelegramBridge(bot: TelegramBot): () => void {
  const queue: QueuedMessage[] = []
  let draining = false

  async function drainQueue(): Promise<void> {
    if (draining) return
    draining = true
    while (queue.length > 0 && !sessionBridge.isBusy()) {
      const msg = queue.shift()!
      if ('voice' in msg) {
        await processVoiceMessage(bot, msg.voice)
      } else if ('photo' in msg) {
        await processPhotoMessage(bot, msg.photo, msg.caption)
      } else {
        await processMessage(bot, msg.text)
      }
    }
    draining = false
  }

  bot.onMessage(async (text) => {
    if (sessionBridge.isBusy()) {
      queue.push({ text })
      await bot.sendMessage(`⏳ Queued (position ${queue.length})`).catch(() => {})
      return
    }
    await processMessage(bot, text)
    if (queue.length > 0) drainQueue()
  })

  bot.onVoice(async (voice) => {
    if (sessionBridge.isBusy()) {
      queue.push({ voice })
      await bot.sendMessage(`⏳ Queued voice message (position ${queue.length})`).catch(() => {})
      return
    }
    await processVoiceMessage(bot, voice)
    if (queue.length > 0) drainQueue()
  })

  bot.onPhoto(async (photo, caption) => {
    if (sessionBridge.isBusy()) {
      queue.push({ photo, caption })
      await bot.sendMessage(`⏳ Queued photo (position ${queue.length})`).catch(() => {})
      return
    }
    await processPhotoMessage(bot, photo, caption)
    if (queue.length > 0) drainQueue()
  })

  return () => {
    bot.stop()
  }
}

async function processPhotoMessage(
  bot: TelegramBot,
  photo: TelegramPhotoSize[],
  caption: string | undefined
): Promise<void> {
  try {
    await bot.sendChatAction('typing')

    const largest = photo[photo.length - 1]!
    const fileUrl = await bot.getFileUrl(largest.file_id)
    const buffer = await bot.downloadFile(fileUrl)
    const mediaType = fileUrl.endsWith('.png') ? 'image/png' : 'image/jpeg'
    const base64 = buffer.toString('base64')
    const prompt = caption || 'Describe this image.'

    await sessionBridge.submit(prompt, { base64, mediaType })
    const messages = sessionBridge.getMessages()
    const last = getLastAssistantText(messages)
    if (last) await bot.sendMarkdown(maskSensitive(last))
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await bot.sendMessage(`Error processing photo: ${errMsg}`).catch(() => {})
  }
}

async function processVoiceMessage(bot: TelegramBot, voice: TelegramVoice): Promise<void> {
  try {
    await bot.sendChatAction('typing')

    const fileUrl = await bot.getFileUrl(voice.file_id)
    const buffer = await bot.downloadFile(fileUrl)
    const text = await transcribeAudio(buffer, 'voice.ogg')

    await bot.sendMessage(`🎙 ${text}`)

    await sessionBridge.submit(text)
    const messages = sessionBridge.getMessages()
    const safe = maskSensitive(getLastAssistantText(messages) ?? '')

    if (safe && shouldUseTTS(safe)) {
      try {
        await bot.sendChatAction('record_voice')
        const audio = await synthesizeSpeech(stripMarkdown(safe))
        await bot.sendVoice(audio)
      } catch (ttsErr) {
        const msg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr)
        await bot.sendMessage(`⚠️ TTS failed: ${msg}`).catch(() => {})
      }
    }
    if (safe) await bot.sendMarkdown(safe)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await bot.sendMessage(`Error processing voice: ${errMsg}`).catch(() => {})
  }
}

async function processMessage(bot: TelegramBot, text: string): Promise<void> {
  try {
    // Step 2: user replied with argument for a pending command
    if (pendingCommand !== null && !text.startsWith('/')) {
      const fullCmd = `${pendingCommand.skill} ${text.trim()}`
      pendingCommand = null
      await bot.sendChatAction('typing')
      await dispatchCommand(bot, fullCmd)
      return
    }

    if (text.startsWith('/')) pendingCommand = null

    const normalized = normalizeBotCommand(text)

    // Step 1: command requires args — ask user
    if (normalized === null) {
      const skillCmd = toSkillCommand(text)
      const prompt = MENU_COMMANDS[skillCmd]?.prompt ?? '请输入参数：'
      pendingCommand = { skill: skillCmd }
      await bot.sendMessage(prompt)
      return
    }

    await bot.sendChatAction('typing')
    await dispatchCommand(bot, normalized)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await bot.sendMessage(`Error: ${errMsg}`).catch(() => {})
  }
}

/** Dispatch: local commands run directly, others go through LLM. */
async function dispatchCommand(bot: TelegramBot, normalized: string): Promise<void> {
  if (normalized.startsWith('/')) {
    const [cmdName, ...cmdArgs] = normalized.slice(1).split(/\s+/)
    const commands = await getCommands(getCwd())
    if (cmdName && hasCommand(cmdName, commands)) {
      const command = getCommand(cmdName, commands)
      if (command.type === 'local') {
        const module = await command.load()
        const result = await module.call(cmdArgs.join(' '), {
          abortController: new AbortController(),
        } as any)
        const value = result.type === 'text' ? result.value : ''
        // Strip ANSI escape codes from local command results
        // eslint-disable-next-line no-control-regex
        const clean = value.replace(/\x1b\[[0-9;]*m/g, '')
        await bot.sendMarkdown(maskSensitive(clean))
        return
      }
    }
  }
  await sessionBridge.submit(normalized)
  const messages = sessionBridge.getMessages()
  const response = getLastAssistantText(messages) ?? ''
  await bot.sendMarkdown(maskSensitive(response))
}

/**
 * Menu commands that require a user-supplied argument.
 */
const MENU_COMMANDS: Record<string, { prompt: string }> = {
  '/gemini': { prompt: '请输入要问 Gemini 的问题：' },
  '/deep-research': { prompt: '请输入股票代码（如 AAPL）：' },
  '/browser': { prompt: '请输入子命令（start / stop / status）：' },
}

/**
 * Normalize Telegram bot commands.
 * /deep_research AAPL  →  /deep-research AAPL
 * Returns null if command needs args (triggers two-step flow).
 */
function normalizeBotCommand(text: string): string | null {
  if (!text.startsWith('/')) return text
  const normalized = toSkillCommand(text)
  const [cmd, ...argParts] = normalized.split(/\s+/)
  if (MENU_COMMANDS[cmd!] && argParts.length === 0) return null
  return normalized
}

function toSkillCommand(text: string): string {
  const stripped = text.replace(/^(\/[a-zA-Z0-9_]+)@\S+/, '$1')
  return stripped.replace(/^\/([a-zA-Z0-9_]+)/, (_, cmd) => `/${cmd.replace(/_/g, '-')}`)
}

/** Extract the last assistant text from messages array. */
function getLastAssistantText(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.type !== 'assistant') continue
    const content = m?.message?.content
    if (!Array.isArray(content)) continue
    const texts = content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text as string)
      .join('')
    if (texts.trim()) return texts
  }
  return null
}

/** Auto-start if env vars are set. Call from cli.tsx. */
export function autoStartTelegram(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID

  if (!token || !chatId) return

  const ownerChatId = parseInt(chatId, 10)
  if (isNaN(ownerChatId)) {
    console.error('TELEGRAM_OWNER_CHAT_ID must be a number')
    return
  }

  const bot = new TelegramBot(token, ownerChatId)
  bot.start()
  botInstance = bot
  cleanupFn = startTelegramBridge(bot)

  console.error(`Telegram bot started (owner: ${ownerChatId})`)
}

/** Stop the running Telegram bot. */
export function stopTelegram(): void {
  if (cleanupFn) {
    cleanupFn()
    cleanupFn = null
  }
  if (botInstance) {
    botInstance.stop()
    botInstance = null
  }
}

/** Get the singleton bot instance (for /telegram command). */
export function getTelegramBot(): TelegramBot | null {
  return botInstance
}

/** Start bot manually (from /telegram start command). */
export function manualStartTelegram(token: string, ownerChatId: number): string {
  if (botInstance?.isRunning()) {
    return 'Telegram bot is already running.'
  }

  const bot = new TelegramBot(token, ownerChatId)
  bot.start()
  botInstance = bot
  cleanupFn = startTelegramBridge(bot)

  return `Telegram bot started (owner: ${ownerChatId})`
}
