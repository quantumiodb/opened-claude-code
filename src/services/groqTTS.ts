/**
 * Groq TTS API client for text-to-speech synthesis.
 * Compatible with OpenAI audio/speech endpoint.
 */

const GROQ_TTS_URL = 'https://api.groq.com/openai/v1/audio/speech'
const TTS_MODEL = 'canopylabs/orpheus-v1-english'
const TTS_VOICE = 'hannah'
const TTS_MAX_CHARS = 800

export class GroqTTSError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GroqTTSError'
  }
}

/**
 * Returns true if the text is suitable for TTS:
 * - No code blocks
 * - Not too long
 */
export function shouldUseTTS(text: string): boolean {
  if (text.includes('```')) return false
  if (text.length > TTS_MAX_CHARS) return false
  return true
}

/**
 * Strip Markdown syntax to produce clean plain text for TTS.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
      .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/^[-*_]{3,}\s*$/gm, '')
      .replace(/^>\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/**
 * Synthesize text to speech using Groq TTS API.
 * @param text - Text to synthesize (should pass shouldUseTTS check first)
 * @returns WAV audio buffer
 */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new GroqTTSError('GROQ_API_KEY environment variable is not set')
  }

  const res = await fetch(GROQ_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: text,
      response_format: 'wav',
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new GroqTTSError(`Groq TTS API failed: ${res.status} ${body}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
