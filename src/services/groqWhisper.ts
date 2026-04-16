/**
 * Groq Whisper API client for audio transcription.
 * Pure fetch + FormData — zero dependencies.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const GROQ_MODEL = 'whisper-large-v3'

export class GroqWhisperError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GroqWhisperError'
  }
}

/**
 * Transcribe audio buffer using Groq Whisper API.
 * @param buffer - Audio file contents (e.g. .ogg from Telegram)
 * @param filename - Filename with extension (e.g. "voice.ogg")
 */
export async function transcribeAudio(buffer: Buffer, filename: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new GroqWhisperError('GROQ_API_KEY environment variable is not set')
  }

  const formData = new FormData()
  formData.append('file', new Blob([new Uint8Array(buffer)]), filename)
  formData.append('model', GROQ_MODEL)
  formData.append('language', 'zh')
  formData.append('prompt', '以下是普通话的转写，请使用简体中文。')

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new GroqWhisperError(`Groq API failed: ${res.status} ${body}`)
  }

  const json = (await res.json()) as { text?: string }
  const text = json.text?.trim()
  if (!text) throw new GroqWhisperError('Groq API returned empty transcription')
  return text
}
