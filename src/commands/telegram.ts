import type { Command, LocalCommandCall } from '../types/command.js'
import { getTelegramBot, manualStartTelegram, stopTelegram } from '../services/telegramBridge.js'

function parseArgs(args: string): { subcommand: string; rest: string } {
  const trimmed = args.trim()
  if (!trimmed) return { subcommand: 'help', rest: '' }
  const tokens = trimmed.split(/\s+/)
  const sub = tokens[0]!.toLowerCase()
  const rest = tokens.slice(1).join(' ')
  return { subcommand: sub, rest }
}

const call: LocalCommandCall = async (args) => {
  const { subcommand, rest } = parseArgs(args)

  switch (subcommand) {
    case 'start': {
      const token = process.env.TELEGRAM_BOT_TOKEN
      const chatId = process.env.TELEGRAM_OWNER_CHAT_ID

      if (!token || !chatId) {
        return {
          type: 'text',
          value: [
            'Missing environment variables. Set in .env:',
            '  TELEGRAM_BOT_TOKEN=123456:ABC-DEF...',
            '  TELEGRAM_OWNER_CHAT_ID=12345678',
          ].join('\n'),
        }
      }

      const ownerChatId = parseInt(chatId, 10)
      if (isNaN(ownerChatId)) {
        return { type: 'text', value: 'TELEGRAM_OWNER_CHAT_ID must be a number.' }
      }

      return { type: 'text', value: manualStartTelegram(token, ownerChatId) }
    }

    case 'stop': {
      const bot = getTelegramBot()
      if (!bot?.isRunning()) {
        return { type: 'text', value: 'Telegram bot is not running.' }
      }
      stopTelegram()
      return { type: 'text', value: 'Telegram bot stopped.' }
    }

    case 'status': {
      const bot = getTelegramBot()
      if (!bot?.isRunning()) {
        return { type: 'text', value: 'Telegram bot: stopped' }
      }
      return {
        type: 'text',
        value: [
          'Telegram bot: running',
          `  Owner chat ID: ${bot.getOwnerChatId()}`,
          `  Messages received: ${bot.getMessageCount()}`,
        ].join('\n'),
      }
    }

    case 'send': {
      if (!rest) return { type: 'text', value: 'Usage: /telegram send <message>' }
      const bot = getTelegramBot()
      if (!bot?.isRunning()) {
        return { type: 'text', value: 'Telegram bot is not running. Use /telegram start first.' }
      }
      try {
        await bot.sendMessage(rest)
        return { type: 'text', value: 'Message sent.' }
      } catch (err: any) {
        return { type: 'text', value: `Failed to send: ${err.message}` }
      }
    }

    case 'set-menu': {
      const bot = getTelegramBot()
      if (!bot?.isRunning()) {
        return { type: 'text', value: 'Telegram bot is not running. Use /telegram start first.' }
      }
      const commands = [
        { command: 'gemini', description: '问 Gemini (Google Search)' },
        { command: 'deep_research', description: '深度研究个股' },
        { command: 'weekly_trade_strategy', description: '本周美股交易策略' },
        { command: 'remote_control', description: '启动远程控制' },
        { command: 'browser', description: '浏览器扩展中继 (start/stop/status)' },
      ]
      try {
        await bot.setMyCommands(commands)
        return {
          type: 'text',
          value: [
            'Bot menu updated:',
            ...commands.map((c) => `  /${c.command} — ${c.description}`),
          ].join('\n'),
        }
      } catch (err: any) {
        return { type: 'text', value: `Failed to set menu: ${err.message}` }
      }
    }

    default:
      return {
        type: 'text',
        value: [
          'Usage: /telegram <subcommand>',
          '',
          'Subcommands:',
          '  start      — Start the Telegram bot (reads env vars)',
          '  stop       — Stop the Telegram bot',
          '  status     — Show bot status and stats',
          '  send       — Send a message to Telegram',
          '  set-menu   — Register bot command menu',
          '  help       — Show this help',
        ].join('\n'),
      }
  }
}

const telegram = {
  type: 'local',
  name: 'telegram',
  description: 'Manage Telegram bot integration (start/stop/status/send)',
  isHidden: false,
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default telegram
