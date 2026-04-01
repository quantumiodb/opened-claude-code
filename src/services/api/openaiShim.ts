/**
 * OpenAI-compatible API shim for Claude Code.
 *
 * It translates Anthropic-style calls into OpenAI chat.completions calls,
 * then re-emits Anthropic-style streaming events expected by claude.ts.
 */

import OpenAI from 'openai'

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface AnthropicContentBlock {
  type: string
  text?: string
  thinking?: string
  source?: { type: string; media_type?: string; data?: string; url?: string }
  // tool_use fields
  id?: string
  name?: string
  input?: unknown
  // tool_result fields
  tool_use_id?: string
  content?: AnthropicContentBlock[] | string | unknown
  is_error?: boolean
}

interface AnthropicMessage {
  role: string
  message?: { role?: string; content?: AnthropicContentBlock[] | string | unknown }
  content?: AnthropicContentBlock[] | string | unknown
}

export interface AnthropicToolDef {
  name: string
  description?: string
  input_schema?: Record<string, unknown>
}

type StopReason = 'tool_use' | 'max_tokens' | 'end_turn'

interface AnthropicUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

type AnthropicStreamEvent =
  | { type: 'message_start'; message: Record<string, unknown> }
  | { type: 'content_block_start'; index: number; content_block: Record<string, unknown> }
  | { type: 'content_block_delta'; index: number; delta: Record<string, unknown> }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: Record<string, unknown>; usage: Partial<AnthropicUsage> }
  | { type: 'message_stop' }

type OpenAIMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam

interface ShimCreateParams {
  model: string
  messages: AnthropicMessage[]
  system?: unknown
  tools?: AnthropicToolDef[]
  max_tokens: number
  stream?: boolean
  temperature?: number
  top_p?: number
  tool_choice?: { type?: string; name?: string }
}

export interface StreamToolState {
  id: string
  name: string
  nameLocked: boolean
  argsBuffer: string
  blockIndex: number
  started: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessageId(): string {
  return `msg_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function shouldIncludeReasoningContent(): boolean {
  return process.env.OPENAI_SHIM_INCLUDE_REASONING === '1'
}

// ---------------------------------------------------------------------------
// ToolNameResolver — encapsulates known-tool-name lookup
// ---------------------------------------------------------------------------

export class ToolNameResolver {
  private canonical: Set<string>
  private lowerMap: Map<string, string>

  constructor(tools: AnthropicToolDef[] | undefined) {
    this.canonical = new Set<string>()
    this.lowerMap = new Map<string, string>()

    if (tools && tools.length > 0) {
      for (const tool of tools) {
        const n = typeof tool.name === 'string' ? tool.name.trim() : ''
        if (!n) continue
        this.canonical.add(n)
        const lower = n.toLowerCase()
        if (!this.lowerMap.has(lower)) {
          this.lowerMap.set(lower, n)
        }
      }
    }

    if (this.canonical.size === 0) {
      for (const n of FALLBACK_COMMON_TOOL_NAMES) {
        this.canonical.add(n)
        const lower = n.toLowerCase()
        if (!this.lowerMap.has(lower)) {
          this.lowerMap.set(lower, n)
        }
      }
    }
  }

  get isEmpty(): boolean {
    return this.canonical.size === 0
  }

  /** Exact match or case-insensitive match → return canonical name */
  findCanonical(name: string): string | null {
    if (!name) return null
    if (this.canonical.has(name)) return name
    return this.lowerMap.get(name.toLowerCase()) ?? null
  }

  /** Does `text` start with a known tool name? Return the longest match. */
  findLongestPrefix(text: string): string | null {
    let best: string | null = null
    const lowerText = text.toLowerCase()
    this.canonical.forEach(candidate => {
      if (!lowerText.startsWith(candidate.toLowerCase())) return
      if (best === null || candidate.length > best.length) {
        best = candidate
      }
    })
    return best
  }

  /** Is there any known tool name that starts with `prefix`? */
  hasNameWithPrefix(prefix: string): boolean {
    const lowerPrefix = prefix.toLowerCase()
    let found = false
    this.canonical.forEach(name => {
      if (name.toLowerCase().startsWith(lowerPrefix)) found = true
    })
    return found
  }

  /** Is the tool state ready to emit a content_block_start? */
  isReadyToStart(state: StreamToolState): boolean {
    if (!state.name) return false
    if (!this.isEmpty) return state.nameLocked
    return true
  }
}

// ---------------------------------------------------------------------------
// Tool name mutation helpers (free functions operating on StreamToolState)
// ---------------------------------------------------------------------------

export function appendUniquePrefix(existing: string, incoming: string): string {
  if (!incoming) return existing
  if (!existing) return incoming
  if (incoming.startsWith(existing)) return incoming
  if (existing.endsWith(incoming)) return existing
  return existing + incoming
}

export function sanitizeToolNameAndSpill(
  state: StreamToolState,
  resolver: ToolNameResolver | null,
): void {
  if (!resolver || !state.name) return

  const canonical = resolver.findCanonical(state.name)
  if (canonical) {
    state.name = canonical
    state.nameLocked = true
    return
  }

  const matchedPrefix = resolver.findLongestPrefix(state.name)
  if (!matchedPrefix) return

  const spill = state.name.slice(matchedPrefix.length)
  state.name = matchedPrefix
  state.nameLocked = true
  if (spill) {
    state.argsBuffer = spill + state.argsBuffer
  }
}

export function updateToolNameState(
  state: StreamToolState,
  incomingNameChunk: string,
  resolver: ToolNameResolver | null,
): void {
  if (!incomingNameChunk) return

  if (resolver === null || resolver.isEmpty) {
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
  const canonicalCombined = resolver.findCanonical(combined)

  if (canonicalCombined) {
    state.name = canonicalCombined
    state.nameLocked = true
    return
  }

  const matchedPrefix = resolver.findLongestPrefix(combined)
  if (matchedPrefix) {
    state.name = matchedPrefix
    state.nameLocked = true
    const spill = combined.slice(matchedPrefix.length)
    if (spill) state.argsBuffer += spill
    return
  }

  if (resolver.hasNameWithPrefix(combined)) {
    state.name = combined
    state.nameLocked = false
    return
  }

  if (resolver.findCanonical(state.name)) {
    state.name = resolver.findCanonical(state.name) ?? state.name
    state.nameLocked = true
    state.argsBuffer += incomingNameChunk
    return
  }

  state.name = combined
  state.nameLocked = false
}

// ---------------------------------------------------------------------------
// StreamState — manages all mutable state for the streaming generator
// ---------------------------------------------------------------------------

class StreamState {
  nextBlockIndex = 0
  hasOpenTextBlock = false
  sawFinishReason = false
  textSuppressed = false
  readonly toolStates = new Map<number, StreamToolState>()

  /** Close current text block if one is open */
  closeTextBlock(): AnthropicStreamEvent[] {
    if (!this.hasOpenTextBlock) return []
    const events: AnthropicStreamEvent[] = [
      { type: 'content_block_stop', index: this.nextBlockIndex },
    ]
    this.hasOpenTextBlock = false
    this.nextBlockIndex++
    return events
  }

  /** If tool state is ready, emit content_block_start and flush argsBuffer */
  startToolBlock(state: StreamToolState, resolver: ToolNameResolver | null): AnthropicStreamEvent[] {
    sanitizeToolNameAndSpill(state, resolver)
    if (state.started) return []

    const ready = resolver ? resolver.isReadyToStart(state) : !!state.name
    if (!ready) return []

    if (!state.id && state.name) {
      state.id = `call_${Math.random().toString(36).slice(2)}`
    }
    if (!state.id) return []

    const events: AnthropicStreamEvent[] = [...this.closeTextBlock()]

    state.blockIndex = this.nextBlockIndex
    state.started = true

    events.push({
      type: 'content_block_start',
      index: state.blockIndex,
      content_block: {
        type: 'tool_use',
        id: state.id,
        name: state.name,
        input: {},
      },
    })
    this.nextBlockIndex++

    events.push(...this.flushToolArgs(state))
    return events
  }

  /** Flush a tool state's argsBuffer as input_json_delta */
  flushToolArgs(state: StreamToolState): AnthropicStreamEvent[] {
    if (!state.argsBuffer) return []
    const events: AnthropicStreamEvent[] = [{
      type: 'content_block_delta',
      index: state.blockIndex,
      delta: { type: 'input_json_delta', partial_json: state.argsBuffer },
    }]
    state.argsBuffer = ''
    return events
  }

  /** Get or create tool state for a given index */
  getOrCreateTool(index: number): StreamToolState {
    const existing = this.toolStates.get(index)
    if (existing) return existing

    const created: StreamToolState = {
      id: '',
      name: '',
      nameLocked: false,
      argsBuffer: '',
      blockIndex: -1,
      started: false,
    }
    this.toolStates.set(index, created)
    return created
  }

  /** Whether any tool call exists (started or has pending name/args) */
  get hasAnyToolCall(): boolean {
    for (const [, state] of this.toolStates) {
      if (state.started || state.name || state.argsBuffer) return true
    }
    return false
  }

  /**
   * Unified finalization — serves both finish_reason path and fallback path.
   * flushPending=true: try to start un-started tool blocks and flush buffers.
   * flushPending=false: only close already-started blocks.
   */
  finalize(resolver: ToolNameResolver | null, opts: {
    flushPending: boolean
    finishReason: string | null
    outputTokens: number
  }): AnthropicStreamEvent[] {
    const events: AnthropicStreamEvent[] = [...this.closeTextBlock()]

    if (opts.flushPending) {
      for (const [, state] of this.toolStates) {
        events.push(...this.startToolBlock(state, resolver))
        if (state.started) {
          events.push(...this.flushToolArgs(state))
        }
      }
    }

    for (const [, state] of this.toolStates) {
      if (!state.started || state.blockIndex < 0) continue
      events.push({ type: 'content_block_stop', index: state.blockIndex })
    }

    const stopReason: StopReason = opts.finishReason
      ? normalizeFinishReasonToStopReason(opts.finishReason, this.hasAnyToolCall)
      : (this.hasAnyToolCall ? 'tool_use' : 'end_turn')

    events.push({
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: opts.outputTokens },
    })
    return events
  }
}

// ---------------------------------------------------------------------------
// Message conversion helpers
// ---------------------------------------------------------------------------

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

function convertToolUseToToolCall(
  block: AnthropicContentBlock,
): OpenAI.Chat.Completions.ChatCompletionMessageToolCall {
  return {
    id: block.id ?? `call_${Math.random().toString(36).slice(2)}`,
    type: 'function' as const,
    function: {
      name: block.name ?? 'unknown',
      arguments:
        typeof block.input === 'string'
          ? block.input
          : JSON.stringify(block.input ?? {}),
    },
  }
}

function convertToolResultToToolMessage(
  block: AnthropicContentBlock,
): OpenAI.Chat.Completions.ChatCompletionToolMessageParam {
  const text = Array.isArray(block.content)
    ? (block.content as AnthropicContentBlock[]).map(c => c.text ?? '').join('\n')
    : typeof block.content === 'string'
      ? block.content
      : JSON.stringify(block.content ?? '')
  return {
    role: 'tool',
    tool_call_id: block.tool_use_id ?? 'unknown',
    content: block.is_error ? `Error: ${text}` : text,
  }
}

function convertMessages(
  messages: AnthropicMessage[],
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
          (b: AnthropicContentBlock) => b.type === 'tool_result',
        )
        const nonToolResults = content.filter(
          (b: AnthropicContentBlock) => b.type !== 'tool_result',
        )

        for (const tr of toolResults) {
          result.push(convertToolResultToToolMessage(tr))
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
          (b: AnthropicContentBlock) => b.type === 'tool_use',
        )
        const nonToolUses = content.filter(
          (b: AnthropicContentBlock) =>
            b.type !== 'tool_use' && b.type !== 'thinking',
        )

        const assistant: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam =
          {
            role: 'assistant',
            content: convertContentBlocks(nonToolUses) as string,
          }

        if (toolUses.length > 0) {
          assistant.tool_calls = toolUses.map(convertToolUseToToolCall)
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

// ---------------------------------------------------------------------------
// Tool definition conversion
// ---------------------------------------------------------------------------

function convertTools(
  tools: AnthropicToolDef[],
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

// ---------------------------------------------------------------------------
// Finish reason normalization
// ---------------------------------------------------------------------------

function normalizeFinishReasonToStopReason(
  finishReason: string,
  hasAnyToolCall: boolean,
): StopReason {
  if (finishReason === 'tool_calls' || hasAnyToolCall) return 'tool_use'
  if (finishReason === 'length') return 'max_tokens'
  return 'end_turn'
}

// ---------------------------------------------------------------------------
// Non-streaming response conversion (top-level, no `this` dependency)
// ---------------------------------------------------------------------------

function convertNonStreamingResponse(
  response: OpenAI.Chat.Completions.ChatCompletion,
  model: string,
) {
  const choice = response.choices?.[0]
  const content: AnthropicContentBlock[] = []

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

// ---------------------------------------------------------------------------
// Streaming: OpenAI → Anthropic event translation
// ---------------------------------------------------------------------------

async function* openaiStreamToAnthropic(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  model: string,
  resolver: ToolNameResolver | null,
): AsyncGenerator<AnthropicStreamEvent> {
  const state = new StreamState()

  yield {
    type: 'message_start',
    message: {
      id: makeMessageId(),
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

  for await (const chunk of stream) {
    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta ?? {}
      const deltaRecord = delta as Record<string, unknown>

      // -- Text handling --
      const contentChunk =
        typeof delta.content === 'string' ? delta.content : ''
      const reasoningChunk =
        typeof deltaRecord.reasoning_content === 'string'
          ? deltaRecord.reasoning_content
          : ''
      const textChunk =
        contentChunk ||
        (shouldIncludeReasoningContent() ? reasoningChunk : '')

      if (delta.tool_calls && delta.tool_calls.length > 0 && !state.textSuppressed) {
        state.textSuppressed = true
        yield* state.closeTextBlock()
      }

      if (textChunk && !state.textSuppressed) {
        if (!state.hasOpenTextBlock) {
          yield {
            type: 'content_block_start',
            index: state.nextBlockIndex,
            content_block: { type: 'text', text: '' },
          }
          state.hasOpenTextBlock = true
        }
        yield {
          type: 'content_block_delta',
          index: state.nextBlockIndex,
          delta: { type: 'text_delta', text: textChunk },
        }
      }

      // -- Tool calls handling --
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const toolIndex = tc.index ?? 0
          const toolState = state.getOrCreateTool(toolIndex)

          const functionPayload =
            tc.function && typeof tc.function === 'object'
              ? (tc.function as { name?: string; arguments?: string })
              : null

          if (tc.id) toolState.id = tc.id

          if (typeof functionPayload?.name === 'string') {
            updateToolNameState(toolState, functionPayload.name, resolver)
          }
          if (typeof functionPayload?.arguments === 'string') {
            toolState.argsBuffer += functionPayload.arguments
          }

          yield* state.startToolBlock(toolState, resolver)

          if (toolState.started) {
            yield* state.flushToolArgs(toolState)
          }
        }
      }

      // -- Finish reason --
      if (choice.finish_reason && !state.sawFinishReason) {
        state.sawFinishReason = true
        yield* state.finalize(resolver, {
          flushPending: true,
          finishReason: choice.finish_reason,
          outputTokens:
            (chunk.usage as { completion_tokens?: number } | null)
              ?.completion_tokens ?? 0,
        })
      }
    }
  }

  if (!state.sawFinishReason) {
    yield* state.finalize(resolver, {
      flushPending: false,
      finishReason: null,
      outputTokens: 0,
    })
  }

  yield { type: 'message_stop' }
}

// ---------------------------------------------------------------------------
// Shim stream wrapper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Shim messages class
// ---------------------------------------------------------------------------

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
      const openaiMessages = convertMessages(params.messages, params.system)

      const body: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: params.model,
        messages: openaiMessages,
        max_tokens: params.max_tokens,
        stream: params.stream ?? false,
      }

      if (params.temperature !== undefined) body.temperature = params.temperature
      if (params.top_p !== undefined) body.top_p = params.top_p

      if (params.tools && params.tools.length > 0) {
        const converted = convertTools(params.tools)

        if (converted.length > 0) {
          body.tools = converted

          if (params.tool_choice?.type === 'auto') {
            body.tool_choice = 'auto'
          } else if (params.tool_choice?.type === 'tool' && params.tool_choice.name) {
            body.tool_choice = { type: 'function', function: { name: params.tool_choice.name } }
          } else if (params.tool_choice?.type === 'any') {
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

        const resolver = params.tools && params.tools.length > 0
          ? new ToolNameResolver(params.tools)
          : new ToolNameResolver(undefined)

        return new OpenAIShimStream(
          openaiStreamToAnthropic(
            streamResponse as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
            params.model,
            resolver,
          ),
        )
      }

      const response = await this.client.chat.completions.create(
        { ...body, stream: false },
        requestOptions,
      )
      return convertNonStreamingResponse(
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
}

// ---------------------------------------------------------------------------
// Shim beta wrapper
// ---------------------------------------------------------------------------

class OpenAIShimBeta {
  messages: OpenAIShimMessages

  constructor(client: OpenAI) {
    this.messages = new OpenAIShimMessages(client)
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

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
