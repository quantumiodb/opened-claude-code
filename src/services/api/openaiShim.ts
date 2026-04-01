/**
 * OpenAI-compatible API shim for Claude Code.
 *
 * It translates Anthropic-style calls into OpenAI chat.completions calls,
 * then re-emits Anthropic-style streaming events expected by claude.ts.
 */

import OpenAI from 'openai'
import { appendFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

interface AnthropicUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

interface AnthropicStreamEvent {
  type: string
  message?: Record<string, unknown>
  index?: number
  content_block?: Record<string, unknown>
  delta?: Record<string, unknown>
  usage?: Partial<AnthropicUsage>
}

type OpenAIMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam

interface ShimCreateParams {
  model: string
  messages: Array<Record<string, unknown>>
  system?: unknown
  tools?: Array<Record<string, unknown>>
  max_tokens: number
  stream?: boolean
  temperature?: number
  top_p?: number
  tool_choice?: unknown
  [key: string]: unknown
}

interface StreamToolState {
  id: string
  name: string
  nameLocked: boolean
  argsBuffer: string
  blockIndex: number
  started: boolean
}

interface KnownToolNames {
  canonicalNames: Set<string>
  lowerToCanonical: Map<string, string>
}

const FALLBACK_COMMON_TOOL_NAMES = [
  'Bash',
  'Read',
  'Grep',
  'Glob',
  'LS',
  'Edit',
  'Write',
  'Search',
]

function makeMessageId(): string {
  return `msg_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function isDebugEnabled(): boolean {
  return (
    process.env.CLAUDE_OPENAI_TOOL_DEBUG === '1' ||
    process.env.OPENAI_SHIM_DEBUG === '1'
  )
}

function shouldIncludeReasoningContent(): boolean {
  return process.env.OPENAI_SHIM_INCLUDE_REASONING === '1'
}

let debugLogFilePath: string | null = null

function getDebugLogFilePath(): string {
  if (debugLogFilePath) return debugLogFilePath

  const baseDir = resolve(process.env.OPENAI_SHIM_DEBUG_DIR ?? process.cwd())
  mkdirSync(baseDir, { recursive: true })

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `openai-shim-debug-${ts}-${process.pid}.log`
  debugLogFilePath = join(baseDir, fileName)
  return debugLogFilePath
}

function appendDebugLogLine(line: string): void {
  try {
    appendFileSync(getDebugLogFilePath(), `${line}\n`, 'utf8')
  } catch {
    // Never let debug logging break request flow.
  }
}

function debugLog(event: string, payload: Record<string, unknown>): void {
  if (!isDebugEnabled()) return
  const safe = JSON.stringify(payload, (_k, v) =>
    typeof v === 'string' && v.length > 400 ? `${v.slice(0, 400)}...` : v,
  )
  const line = `[openai-shim-debug] ${new Date().toISOString()} ${event} ${safe}`
  // eslint-disable-next-line no-console
  console.error(line)
  appendDebugLogLine(line)
}

function convertSystemPrompt(system: unknown): string {
  if (!system) return ''
  if (typeof system === 'string') return system
  if (!Array.isArray(system)) return String(system)

  return system
    .map((block: { type?: string; text?: string }) =>
      block.type === 'text' ? (block.text ?? '') : '',
    )
    .join('\n\n')
}

function convertContentBlocks(
  content: unknown,
): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content ?? '')

  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []

  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push({ type: 'text', text: block.text ?? '' })
        break
      case 'image': {
        const src = block.source
        if (src?.type === 'base64') {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${src.media_type};base64,${src.data}` },
          })
        } else if (src?.type === 'url') {
          parts.push({ type: 'image_url', image_url: { url: src.url } })
        }
        break
      }
      case 'thinking':
        if (block.thinking) {
          parts.push({
            type: 'text',
            text: `<thinking>${block.thinking}</thinking>`,
          })
        }
        break
      case 'tool_use':
      case 'tool_result':
        // handled elsewhere
        break
      default:
        if (block.text) {
          parts.push({ type: 'text', text: block.text })
        }
    }
  }

  if (parts.length === 0) return ''
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text
  return parts
}

function convertMessages(
  messages: Array<{
    role: string
    message?: { role?: string; content?: unknown }
    content?: unknown
  }>,
  system: unknown,
): OpenAIMessageParam[] {
  const result: OpenAIMessageParam[] = []

  const sys = convertSystemPrompt(system)
  if (sys) result.push({ role: 'system', content: sys })

  for (const outer of messages) {
    const inner = outer.message ?? outer
    const role = (inner as { role?: string }).role ?? outer.role
    const content = (inner as { content?: unknown }).content

    if (role === 'user') {
      if (Array.isArray(content)) {
        const toolResults = content.filter(
          (b: { type?: string }) => b.type === 'tool_result',
        )
        const nonToolResults = content.filter(
          (b: { type?: string }) => b.type !== 'tool_result',
        )

        for (const tr of toolResults) {
          const text = Array.isArray(tr.content)
            ? tr.content.map((c: { text?: string }) => c.text ?? '').join('\n')
            : typeof tr.content === 'string'
              ? tr.content
              : JSON.stringify(tr.content ?? '')
          result.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id ?? 'unknown',
            content: tr.is_error ? `Error: ${text}` : text,
          })
        }

        if (nonToolResults.length > 0) {
          result.push({
            role: 'user',
            content: convertContentBlocks(nonToolResults) as string,
          })
        }
      } else {
        result.push({
          role: 'user',
          content: convertContentBlocks(content) as string,
        })
      }
      continue
    }

    if (role === 'assistant') {
      if (Array.isArray(content)) {
        const toolUses = content.filter(
          (b: { type?: string }) => b.type === 'tool_use',
        )
        const nonToolUses = content.filter(
          (b: { type?: string }) =>
            b.type !== 'tool_use' && b.type !== 'thinking',
        )

        const assistant: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam =
          {
            role: 'assistant',
            content: convertContentBlocks(nonToolUses) as string,
          }

        if (toolUses.length > 0) {
          assistant.tool_calls = toolUses.map(
            (tu: { id?: string; name?: string; input?: unknown }) => ({
              id: tu.id ?? `call_${Math.random().toString(36).slice(2)}`,
              type: 'function' as const,
              function: {
                name: tu.name ?? 'unknown',
                arguments:
                  typeof tu.input === 'string'
                    ? tu.input
                    : JSON.stringify(tu.input ?? {}),
              },
            }),
          )
        }

        result.push(assistant)
      } else {
        result.push({
          role: 'assistant',
          content: convertContentBlocks(content) as string,
        })
      }
    }
  }

  return result
}

function convertTools(
  tools: Array<{
    name: string
    description?: string
    input_schema?: Record<string, unknown>
  }>,
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools
    .filter(tool => tool.name !== 'ToolSearchTool')
    .map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description ?? '',
        parameters: tool.input_schema ?? { type: 'object', properties: {} },
      },
    }))
}

function appendUniquePrefix(existing: string, incoming: string): string {
  if (!incoming) return existing
  if (!existing) return incoming
  if (incoming.startsWith(existing)) return incoming
  if (existing.endsWith(incoming)) return existing
  return existing + incoming
}

function buildKnownToolNames(
  tools: Array<Record<string, unknown>> | undefined,
): KnownToolNames | null {
  const canonicalNames = new Set<string>()
  const lowerToCanonical = new Map<string, string>()

  if (tools && tools.length > 0) {
    for (const tool of tools) {
      const n = typeof tool.name === 'string' ? tool.name.trim() : ''
      if (!n) continue
      canonicalNames.add(n)
      const lower = n.toLowerCase()
      if (!lowerToCanonical.has(lower)) {
        lowerToCanonical.set(lower, n)
      }
    }
  }

  if (canonicalNames.size === 0) {
    for (const n of FALLBACK_COMMON_TOOL_NAMES) {
      canonicalNames.add(n)
      const lower = n.toLowerCase()
      if (!lowerToCanonical.has(lower)) {
        lowerToCanonical.set(lower, n)
      }
    }
  }

  if (canonicalNames.size === 0) return null
  return { canonicalNames, lowerToCanonical }
}

function findLongestKnownNamePrefix(
  text: string,
  knownToolNames: KnownToolNames,
): string | null {
  let best: string | null = null
  const lowerText = text.toLowerCase()
  knownToolNames.canonicalNames.forEach(candidate => {
    if (!lowerText.startsWith(candidate.toLowerCase())) return
    if (best === null || candidate.length > best.length) {
      best = candidate
    }
  })
  return best
}

function hasKnownNameWithPrefix(
  prefix: string,
  knownToolNames: KnownToolNames,
): boolean {
  let found = false
  const lowerPrefix = prefix.toLowerCase()
  knownToolNames.canonicalNames.forEach(name => {
    if (name.toLowerCase().startsWith(lowerPrefix)) found = true
  })
  return found
}

function findCanonicalKnownName(
  name: string,
  knownToolNames: KnownToolNames,
): string | null {
  if (!name) return null
  if (knownToolNames.canonicalNames.has(name)) return name
  return knownToolNames.lowerToCanonical.get(name.toLowerCase()) ?? null
}

function sanitizeToolNameAndSpill(
  state: StreamToolState,
  knownToolNames: KnownToolNames | null,
): void {
  if (!knownToolNames || !state.name) return

  const canonical = findCanonicalKnownName(state.name, knownToolNames)
  if (canonical) {
    state.name = canonical
    state.nameLocked = true
    return
  }

  const matchedPrefix = findLongestKnownNamePrefix(state.name, knownToolNames)
  if (!matchedPrefix) return

  const spill = state.name.slice(matchedPrefix.length)
  state.name = matchedPrefix
  state.nameLocked = true
  if (spill) {
    state.argsBuffer = spill + state.argsBuffer
  }
}

function updateToolNameState(
  state: StreamToolState,
  incomingNameChunk: string,
  knownToolNames: KnownToolNames | null,
): void {
  if (!incomingNameChunk) return

  if (knownToolNames === null || knownToolNames.canonicalNames.size === 0) {
    state.name = appendUniquePrefix(state.name, incomingNameChunk)
    state.nameLocked = state.name.length > 0
    return
  }

  if (state.nameLocked && state.name) {
    const lowerIncoming = incomingNameChunk.toLowerCase()
    const lowerName = state.name.toLowerCase()
    if (lowerIncoming.startsWith(lowerName)) {
      const spill = incomingNameChunk.slice(state.name.length)
      if (spill) state.argsBuffer += spill
      return
    }
    state.argsBuffer += incomingNameChunk
    return
  }

  const combined = appendUniquePrefix(state.name, incomingNameChunk)
  const canonicalCombined = findCanonicalKnownName(combined, knownToolNames)

  if (canonicalCombined) {
    state.name = canonicalCombined
    state.nameLocked = true
    return
  }

  const matchedPrefix = findLongestKnownNamePrefix(combined, knownToolNames)
  if (matchedPrefix) {
    state.name = matchedPrefix
    state.nameLocked = true
    const spill = combined.slice(matchedPrefix.length)
    if (spill) state.argsBuffer += spill
    return
  }

  if (hasKnownNameWithPrefix(combined, knownToolNames)) {
    state.name = combined
    state.nameLocked = false
    return
  }

  if (findCanonicalKnownName(state.name, knownToolNames)) {
    state.name = findCanonicalKnownName(state.name, knownToolNames) ?? state.name
    state.nameLocked = true
    state.argsBuffer += incomingNameChunk
    return
  }

  state.name = combined
  state.nameLocked = false
}

function getOrCreateToolState(
  states: Map<number, StreamToolState>,
  toolIndex: number,
): StreamToolState {
  const existing = states.get(toolIndex)
  if (existing) return existing

  const created: StreamToolState = {
    id: '',
    name: '',
    nameLocked: false,
    argsBuffer: '',
    blockIndex: -1,
    started: false,
  }
  states.set(toolIndex, created)
  return created
}

function isToolStateReadyToStart(
  state: StreamToolState,
  knownToolNames: KnownToolNames | null,
): boolean {
  if (!state.name) return false
  if (knownToolNames && knownToolNames.canonicalNames.size > 0) {
    return state.nameLocked
  }
  return true
}

function normalizeFinishReasonToStopReason(
  finishReason: string,
  hasAnyToolCall: boolean,
): 'tool_use' | 'max_tokens' | 'end_turn' {
  if (finishReason === 'tool_calls' || hasAnyToolCall) return 'tool_use'
  if (finishReason === 'length') return 'max_tokens'
  return 'end_turn'
}

async function* openaiStreamToAnthropic(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  model: string,
  knownToolNames: KnownToolNames | null,
): AsyncGenerator<AnthropicStreamEvent> {
  const messageId = makeMessageId()

  let nextContentBlockIndex = 0
  let hasOpenTextBlock = false
  let sawFinishReason = false

  const toolStates = new Map<number, StreamToolState>()

  yield {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  }

  const closeTextBlockIfOpen = async function* (): AsyncGenerator<AnthropicStreamEvent> {
    if (!hasOpenTextBlock) return
    yield { type: 'content_block_stop', index: nextContentBlockIndex }
    hasOpenTextBlock = false
    nextContentBlockIndex++
  }

  const startToolBlockIfReady = async function* (
    state: StreamToolState,
  ): AsyncGenerator<AnthropicStreamEvent> {
    sanitizeToolNameAndSpill(state, knownToolNames)
    if (state.started) return
    if (!isToolStateReadyToStart(state, knownToolNames)) return

    if (!state.id && state.name) {
      state.id = `call_${Math.random().toString(36).slice(2)}`
    }
    if (!state.id) return

    yield* closeTextBlockIfOpen()

    state.blockIndex = nextContentBlockIndex
    state.started = true

    yield {
      type: 'content_block_start',
      index: state.blockIndex,
      content_block: {
        type: 'tool_use',
        id: state.id,
        name: state.name,
        input: {},
      },
    }
    nextContentBlockIndex++

    if (state.argsBuffer) {
      yield {
        type: 'content_block_delta',
        index: state.blockIndex,
        delta: { type: 'input_json_delta', partial_json: state.argsBuffer },
      }
      state.argsBuffer = ''
    }
  }

  for await (const chunk of stream) {
    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta ?? {}

      const deltaRecord = delta as Record<string, unknown>
      const contentChunk =
        typeof delta.content === 'string' ? delta.content : ''
      const reasoningChunk =
        typeof deltaRecord.reasoning_content === 'string'
          ? deltaRecord.reasoning_content
          : ''
      const textChunk =
        contentChunk ||
        (shouldIncludeReasoningContent() ? reasoningChunk : '')

      if (
        !contentChunk &&
        reasoningChunk &&
        !shouldIncludeReasoningContent() &&
        isDebugEnabled()
      ) {
        debugLog('reasoning_content_dropped', {
          preview: reasoningChunk.slice(0, 240),
        })
      }

      if (textChunk) {
        if (!hasOpenTextBlock) {
          yield {
            type: 'content_block_start',
            index: nextContentBlockIndex,
            content_block: { type: 'text', text: '' },
          }
          hasOpenTextBlock = true
        }
        yield {
          type: 'content_block_delta',
          index: nextContentBlockIndex,
          delta: { type: 'text_delta', text: textChunk },
        }
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const toolIndex = tc.index ?? 0
          const state = getOrCreateToolState(toolStates, toolIndex)

          const functionPayload =
            tc.function && typeof tc.function === 'object'
              ? (tc.function as { name?: string; arguments?: string })
              : null

          debugLog('tool_delta_raw', {
            toolIndex,
            id: tc.id ?? null,
            nameChunk: functionPayload?.name ?? null,
            argsChunk: functionPayload?.arguments ?? null,
          })

          if (tc.id) state.id = tc.id

          if (typeof functionPayload?.name === 'string') {
            updateToolNameState(state, functionPayload.name, knownToolNames)
          }
          if (typeof functionPayload?.arguments === 'string') {
            state.argsBuffer += functionPayload.arguments
          }

          yield* startToolBlockIfReady(state)

          if (state.started && state.argsBuffer) {
            yield {
              type: 'content_block_delta',
              index: state.blockIndex,
              delta: { type: 'input_json_delta', partial_json: state.argsBuffer },
            }
            state.argsBuffer = ''
          }

          debugLog('tool_state', {
            toolIndex,
            id: state.id,
            name: state.name,
            nameLocked: state.nameLocked,
            started: state.started,
            blockIndex: state.blockIndex,
            argsBufferedLength: state.argsBuffer.length,
          })
        }
      }

      if (choice.finish_reason && !sawFinishReason) {
        sawFinishReason = true

        yield* closeTextBlockIfOpen()

        for (const [, state] of toolStates) {
          yield* startToolBlockIfReady(state)
          if (state.started && state.argsBuffer) {
            yield {
              type: 'content_block_delta',
              index: state.blockIndex,
              delta: { type: 'input_json_delta', partial_json: state.argsBuffer },
            }
            state.argsBuffer = ''
          }
        }

        for (const [, state] of toolStates) {
          if (!state.started || state.blockIndex < 0) continue
          yield { type: 'content_block_stop', index: state.blockIndex }
        }

        let hasAnyToolCall = false
        for (const [, state] of toolStates) {
          if (state.started || state.name || state.argsBuffer) {
            hasAnyToolCall = true
            break
          }
        }

        const stopReason = normalizeFinishReasonToStopReason(
          choice.finish_reason,
          hasAnyToolCall,
        )

        debugLog('finish_reason', {
          providerFinishReason: choice.finish_reason,
          mappedStopReason: stopReason,
          hasAnyToolCall,
        })

        yield {
          type: 'message_delta',
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: {
            output_tokens:
              (chunk.usage as { completion_tokens?: number } | null)
                ?.completion_tokens ?? 0,
          },
        }
      }
    }
  }

  if (!sawFinishReason) {
    if (hasOpenTextBlock) {
      yield { type: 'content_block_stop', index: nextContentBlockIndex }
      hasOpenTextBlock = false
      nextContentBlockIndex++
    }

    for (const [, state] of toolStates) {
      if (!state.started || state.blockIndex < 0) continue
      yield { type: 'content_block_stop', index: state.blockIndex }
    }

    let hasAnyToolCall = false
    for (const [, state] of toolStates) {
      if (state.started || state.name || state.argsBuffer) {
        hasAnyToolCall = true
        break
      }
    }

    yield {
      type: 'message_delta',
      delta: {
        stop_reason: hasAnyToolCall ? 'tool_use' : 'end_turn',
        stop_sequence: null,
      },
      usage: { output_tokens: 0 },
    }
  }

  yield { type: 'message_stop' }
}

class OpenAIShimStream {
  private generator: AsyncGenerator<AnthropicStreamEvent>

  // claude.ts checks this field to identify stream instances.
  controller = new AbortController()

  constructor(generator: AsyncGenerator<AnthropicStreamEvent>) {
    this.generator = generator
  }

  async *[Symbol.asyncIterator]() {
    yield* this.generator
  }
}

class OpenAIShimMessages {
  private client: OpenAI

  constructor(client: OpenAI) {
    this.client = client
  }

  create(
    params: ShimCreateParams,
    options?: { signal?: AbortSignal; headers?: Record<string, string> },
  ) {
    const promise = (async () => {
      const openaiMessages = convertMessages(
        params.messages as Array<{
          role: string
          message?: { role?: string; content?: unknown }
          content?: unknown
        }>,
        params.system,
      )

      const body: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: params.model,
        messages: openaiMessages,
        max_tokens: params.max_tokens,
        stream: params.stream ?? false,
      }

      if (params.temperature !== undefined) body.temperature = params.temperature
      if (params.top_p !== undefined) body.top_p = params.top_p

      if (params.tools && params.tools.length > 0) {
        const converted = convertTools(
          params.tools as Array<{
            name: string
            description?: string
            input_schema?: Record<string, unknown>
          }>,
        )

        if (converted.length > 0) {
          body.tools = converted
          const tc = params.tool_choice as
            | { type?: string; name?: string }
            | undefined

          if (tc?.type === 'auto') {
            body.tool_choice = 'auto'
          } else if (tc?.type === 'tool' && tc.name) {
            body.tool_choice = { type: 'function', function: { name: tc.name } }
          } else if (tc?.type === 'any') {
            body.tool_choice = 'required'
          }
        }
      }

      const requestOptions: OpenAI.RequestOptions = {}
      if (options?.signal) requestOptions.signal = options.signal
      if (options?.headers) requestOptions.headers = options.headers

      if (params.stream) {
        const streamResponse =
          await this.client.chat.completions.create(
            {
              ...body,
              stream: true,
              stream_options: { include_usage: true },
            },
            requestOptions,
          )

        return new OpenAIShimStream(
          openaiStreamToAnthropic(
            streamResponse as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
            params.model,
            buildKnownToolNames(params.tools),
          ),
        )
      }

      const response = await this.client.chat.completions.create(
        { ...body, stream: false },
        requestOptions,
      )
      return this.convertNonStreamingResponse(
        response as OpenAI.Chat.Completions.ChatCompletion,
        params.model,
      )
    })()

    ;(promise as unknown as Record<string, unknown>).withResponse = async () => {
      const data = await promise
      return {
        data,
        response: new Response(),
        request_id: makeMessageId(),
      }
    }

    return promise
  }

  private convertNonStreamingResponse(
    response: OpenAI.Chat.Completions.ChatCompletion,
    model: string,
  ) {
    const choice = response.choices?.[0]
    const content: Array<Record<string, unknown>> = []

    if (choice?.message?.content) {
      content.push({ type: 'text', text: choice.message.content })
    }

    if (choice?.message?.tool_calls) {
      for (const rawToolCall of choice.message.tool_calls) {
        const tc = rawToolCall as {
          id?: string
          function?: { name?: string; arguments?: string }
        }

        const toolName = tc.function?.name
        const args = tc.function?.arguments
        if (!toolName || typeof args !== 'string') continue

        let input: unknown
        try {
          input = JSON.parse(args)
        } catch {
          input = { raw: args }
        }

        content.push({
          type: 'tool_use',
          id: tc.id ?? `call_${Math.random().toString(36).slice(2)}`,
          name: toolName,
          input,
        })
      }
    }

    const stopReason = normalizeFinishReasonToStopReason(
      choice?.finish_reason ?? 'stop',
      !!choice?.message?.tool_calls?.length,
    )

    return {
      id: response.id ?? makeMessageId(),
      type: 'message',
      role: 'assistant',
      content,
      model: response.model ?? model,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    }
  }
}

class OpenAIShimBeta {
  messages: OpenAIShimMessages

  constructor(client: OpenAI) {
    this.messages = new OpenAIShimMessages(client)
  }
}

export function createOpenAIShimClient(options: {
  defaultHeaders?: Record<string, string>
  maxRetries?: number
  timeout?: number
}): unknown {
  const baseURL = (
    process.env.OPENAI_BASE_URL ??
    process.env.OPENAI_API_BASE ??
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '')

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? 'dummy-key',
    baseURL,
    defaultHeaders: options.defaultHeaders,
    maxRetries: options.maxRetries,
    timeout: options.timeout,
  })

  const beta = new OpenAIShimBeta(client)

  return {
    beta,
    messages: beta.messages,
  }
}
