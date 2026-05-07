/**
 * Attach an NDJSON framer to a net.Socket.
 *
 * Calls `onMessage` for each complete newline-delimited JSON frame received.
 * The `maxFrameBytes` option limits accumulated bytes before a newline; callers
 * may opt into error callbacks and socket destruction on oversized or invalid frames.
 *
 * @param parse - Optional custom JSON parser (defaults to JSON.parse).
 *                Useful when the caller uses a wrapped parser like jsonParse
 *                that handles edge-cases or adds logging.
 */
import type { Socket } from 'net'

export type NdjsonFramerOptions = {
  maxFrameBytes?: number
  onFrameError?: (error: Error) => void
  destroyOnFrameError?: boolean
  onInvalidFrame?: (error: Error) => void
  destroyOnInvalidFrame?: boolean
}

/**
 * Attach an NDJSON framer to a socket. Calls `onMessage` for each
 * complete JSON line received. Malformed lines are skipped by default;
 * callers may opt into error callbacks or socket destruction.
 *
 * @param parse - Optional custom JSON parser (defaults to JSON.parse).
 *                Useful when the caller uses a wrapped parser like jsonParse
 *                that handles edge-cases or adds logging.
 */
export function attachNdjsonFramer<T = unknown>(
  socket: Socket,
  onMessage: (msg: T) => void,
  parse: (text: string) => T = text => JSON.parse(text) as T,
  options: NdjsonFramerOptions = {},
): void {
  let buffer = ''
  let bufferBytes = 0
  const maxFrameBytes = options.maxFrameBytes ?? Number.POSITIVE_INFINITY

  const rejectOversizedFrame = (bytes: number): void => {
    const error = new Error(
      `NDJSON frame exceeded ${maxFrameBytes} bytes (${bytes})`,
    )
    options.onFrameError?.(error)
    if (options.destroyOnFrameError ?? true) {
      socket.destroy(error)
    }
  }

  const rejectInvalidFrame = (error: unknown): void => {
    const frameError =
      error instanceof Error ? error : new Error('Invalid NDJSON frame')
    options.onInvalidFrame?.(frameError)
    if (options.destroyOnInvalidFrame ?? false) {
      socket.destroy(frameError)
    }
  }

  const emitLine = (line: string): void => {
    if (!line.trim()) return
    try {
      onMessage(parse(line))
    } catch (error) {
      rejectInvalidFrame(error)
    }
  }

  socket.on('data', (chunk: Buffer) => {
    let start = 0
    for (let index = 0; index < chunk.length; index++) {
      if (chunk[index] !== 0x0a) continue

      const segmentBytes = index - start
      if (
        Number.isFinite(maxFrameBytes) &&
        bufferBytes + segmentBytes > maxFrameBytes
      ) {
        rejectOversizedFrame(bufferBytes + segmentBytes)
        return
      }

      buffer += chunk.subarray(start, index).toString('utf8')
      emitLine(buffer)
      buffer = ''
      bufferBytes = 0
      start = index + 1
    }

    const tailBytes = chunk.length - start
    if (
      Number.isFinite(maxFrameBytes) &&
      bufferBytes + tailBytes > maxFrameBytes
    ) {
      rejectOversizedFrame(bufferBytes + tailBytes)
      return
    }

    if (tailBytes > 0) {
      buffer += chunk.subarray(start).toString('utf8')
      bufferBytes += tailBytes
    }
  })
}
