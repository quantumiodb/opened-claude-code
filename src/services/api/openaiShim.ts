/**
 * OpenAI-compatible API shim for Claude Code.
 *
 * Translates Anthropic SDK calls (anthropic.beta.messages.create) into
 * OpenAI chat completion requests and streams back events in the Anthropic
 * streaming format so the rest of the codebase is unaware.
 *
 * Uses the official `openai` npm SDK instead of raw fetch, so authentication,
 * retries, and streaming are all handled by the SDK.
 *
 * Supports: OpenAI, Azure OpenAI, Ollama, LM Studio, OpenRouter,
 * Together, Groq, Fireworks, DeepSeek, Mistral, and any OpenAI-compatible API.
 *
 * Environment variables:
 *   CLAUDE_CODE_USE_OPENAI=1          — enable this provider
 *   OPENAI_API_KEY=sk-...             — API key (optional for local models)
 *   OPENAI_BASE_URL=http://...        — base URL (default: https://api.openai.com/v1)
 *   OPENAI_MODEL=gpt-4o              — default model override
 */

import OpenAI from 'openai'

// ---------------------------------------------------------------------------
// Types — minimal subset of Anthropic SDK types we need to produce
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Message format conversion: Anthropic → OpenAI
// ---------------------------------------------------------------------------

type OpenAIMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam

function convertSystemPrompt(system: unknown): string {
  if (!system) return ''
  if (typeof system === 'string') return system
  if (Array.isArray(system)) {
    return system
      .map((block: { type?: string; text?: string }) =>
        block.type === 'text' ? (block.text ?? '') : '',
      )
      .join('\n\n')
  }
  return String(system)
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
            image_url: {
              url: `data:${src.media_type};base64,${src.data}`,
            },
          })
        } else if (src?.type === 'url') {
          parts.push({ type: 'image_url', image_url: { url: src.url } })
        }
        break
      }
      case 'tool_use':
        // handled separately in convertMessages
        break
      case 'tool_result':
        // handled separately in convertMessages
        break
      case 'thinking':
        // Append thinking as text for models that support reasoning
        if (block.thinking) {
          parts.push({ type: 'text', text: `<thinking>${block.thinking}</thinking>` })
        }
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
  messages: Array<{ role: string; message?: { role?: string; content?: unknown }; content?: unknown }>,
  system: unknown,
): OpenAIMessageParam[] {
  const result: OpenAIMessageParam[] = []

  const sysText = convertSystemPrompt(system)
  if (sysText) {
    result.push({ role: 'system', content: sysText })
  }

  for (const msg of messages) {
    // Claude Code may wrap messages in { role, message: { role, content } }
    const inner = msg.message ?? msg
    const role = (inner as { role?: string }).role ?? msg.role
    const content = (inner as { content?: unknown }).content

    if (role === 'user') {
      if (Array.isArray(content)) {
        const toolResults = content.filter((b: { type?: string }) => b.type === 'tool_result')
        const otherContent = content.filter((b: { type?: string }) => b.type !== 'tool_result')

        for (const tr of toolResults) {
          const trContent = Array.isArray(tr.content)
            ? tr.content.map((c: { text?: string }) => c.text ?? '').join('\n')
            : typeof tr.content === 'string'
              ? tr.content
              : JSON.stringify(tr.content ?? '')
          result.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id ?? 'unknown',
            content: tr.is_error ? `Error: ${trContent}` : trContent,
          })
        }

        if (otherContent.length > 0) {
          result.push({
            role: 'user',
            content: convertContentBlocks(otherContent) as string,
          })
        }
      } else {
        result.push({
          role: 'user',
          content: convertContentBlocks(content) as string,
        })
      }
    } else if (role === 'assistant') {
      if (Array.isArray(content)) {
        const toolUses = content.filter((b: { type?: string }) => b.type === 'tool_use')
        const textContent = content.filter(
          (b: { type?: string }) => b.type !== 'tool_use' && b.type !== 'thinking',
        )

        const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: convertContentBlocks(textContent) as string,
        }

        if (toolUses.length > 0) {
          assistantMsg.tool_calls = toolUses.map(
            (tu: { id?: string; name?: string; input?: unknown }) => ({
              id: tu.id ?? `call_${Math.random().toString(36).slice(2)}`,
              type: 'function' as const,
              function: {
                name: tu.name ?? 'unknown',
                arguments:
                  typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input ?? {}),
              },
            }),
          )
        }

        result.push(assistantMsg)
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
  tools: Array<{ name: string; description?: string; input_schema?: Record<string, unknown> }>,
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools
    .filter(t => t.name !== 'ToolSearchTool')
    .map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: t.input_schema ?? { type: 'object', properties: {} },
      },
    }))
}

// ---------------------------------------------------------------------------
// Streaming: OpenAI SDK chunks → Anthropic stream events
// ---------------------------------------------------------------------------

function makeMessageId(): string {
  return `msg_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/**
 * Async generator that consumes an OpenAI SDK streaming response and
 * emits Anthropic-format stream events.
 */
async function* openaiStreamToAnthropic(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  model: string,
): AsyncGenerator<AnthropicStreamEvent> {
  const messageId = makeMessageId()
  let contentBlockIndex = 0
  const activeToolCalls = new Map<number, { id: string; name: string; index: number }>()
  let hasEmittedContentStart = false
  let hasProcessedFinishReason = false

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

  for await (const chunk of stream) {
    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta

      // Text content — also handle reasoning_content (GLM-4 / DeepSeek-R1 style)
      const textContent =
        delta.content || (delta as unknown as Record<string, string>).reasoning_content || null
      if (textContent) {
        if (!hasEmittedContentStart) {
          yield {
            type: 'content_block_start',
            index: contentBlockIndex,
            content_block: { type: 'text', text: '' },
          }
          hasEmittedContentStart = true
        }
        yield {
          type: 'content_block_delta',
          index: contentBlockIndex,
          delta: { type: 'text_delta', text: textContent },
        }
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id && tc.function?.name) {
            // New tool call starting
            if (hasEmittedContentStart) {
              yield { type: 'content_block_stop', index: contentBlockIndex }
              contentBlockIndex++
              hasEmittedContentStart = false
            }

            const toolBlockIndex = contentBlockIndex
            activeToolCalls.set(tc.index, {
              id: tc.id,
              name: tc.function.name,
              index: toolBlockIndex,
            })

            yield {
              type: 'content_block_start',
              index: toolBlockIndex,
              content_block: {
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: {},
              },
            }
            contentBlockIndex++

            if (tc.function.arguments) {
              yield {
                type: 'content_block_delta',
                index: toolBlockIndex,
                delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
              }
            }
          } else if (tc.function?.arguments) {
            // Continuation of existing tool call
            const active = activeToolCalls.get(tc.index)
            if (active) {
              yield {
                type: 'content_block_delta',
                index: active.index,
                delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
              }
            }
          }
        }
      }

      // Finish
      if (choice.finish_reason && !hasProcessedFinishReason) {
        hasProcessedFinishReason = true
        if (hasEmittedContentStart) {
          yield { type: 'content_block_stop', index: contentBlockIndex }
        }
        for (const [, tc] of activeToolCalls) {
          yield { type: 'content_block_stop', index: tc.index }
        }

        // Some models (e.g. GLM-4) send finish_reason:"stop" even when tool
        // calls are present. Check activeToolCalls as a fallback so Claude
        // Code's tool execution loop fires correctly.
        const stopReason =
          choice.finish_reason === 'tool_calls' || activeToolCalls.size > 0
            ? 'tool_use'
            : choice.finish_reason === 'length'
              ? 'max_tokens'
              : 'end_turn'

        yield {
          type: 'message_delta',
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: {
            output_tokens: (chunk.usage as { completion_tokens?: number } | null)?.completion_tokens ?? 0,
          },
        }
      }
    }
  }

  // Cleanup: if the stream ended without a finish_reason (aborted/malformed),
  // close any open blocks so the consumer isn't left in a broken state.
  if (!hasProcessedFinishReason) {
    if (hasEmittedContentStart) {
      yield { type: 'content_block_stop', index: contentBlockIndex }
    }
    for (const [, tc] of activeToolCalls) {
      yield { type: 'content_block_stop', index: tc.index }
    }
    yield {
      type: 'message_delta',
      delta: {
        stop_reason: activeToolCalls.size > 0 ? 'tool_use' : 'end_turn',
        stop_sequence: null,
      },
      usage: { output_tokens: 0 },
    }
  }

  yield { type: 'message_stop' }
}

// ---------------------------------------------------------------------------
// The shim client — duck-types as Anthropic SDK
// ---------------------------------------------------------------------------

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

class OpenAIShimStream {
  private generator: AsyncGenerator<AnthropicStreamEvent>
  // The controller property is checked by claude.ts to distinguish streams from plain objects
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
    const self = this

    const promise = (async () => {
      const openaiMessages = convertMessages(
        params.messages as Array<{
          role: string
          message?: { role?: string; content?: unknown }
          content?: unknown
        }>,
        params.system,
      )

      const body: OpenAI.Chat.Completions.ChatCompletionCreateParamsBase = {
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
          const tc = params.tool_choice as { type?: string; name?: string } | undefined
          if (tc) {
            if (tc.type === 'auto') {
              body.tool_choice = 'auto'
            } else if (tc.type === 'tool' && tc.name) {
              body.tool_choice = { type: 'function', function: { name: tc.name } }
            } else if (tc.type === 'any') {
              body.tool_choice = 'required'
            }
          }
        }
      }

      const requestOptions: OpenAI.RequestOptions = {}
      if (options?.signal) requestOptions.signal = options.signal
      if (options?.headers) requestOptions.headers = options.headers

      if (params.stream) {
        const stream = await self.client.chat.completions.create(
          { ...body, stream: true, stream_options: { include_usage: true } },
          requestOptions,
        )
        return new OpenAIShimStream(openaiStreamToAnthropic(stream, params.model))
      }

      // Non-streaming
      const response = await self.client.chat.completions.create(
        { ...body, stream: false },
        requestOptions,
      )
      return self._convertNonStreamingResponse(response, params.model)
    })()

    // Add .withResponse() shim for the streaming code path in claude.ts
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

  private _convertNonStreamingResponse(
    response: OpenAI.Chat.Completions.ChatCompletion,
    model: string,
  ) {
    const choice = response.choices?.[0]
    const content: Array<Record<string, unknown>> = []

    if (choice?.message?.content) {
      content.push({ type: 'text', text: choice.message.content })
    }

    if (choice?.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let input: unknown
        try {
          input = JSON.parse(tc.function.arguments)
        } catch {
          input = { raw: tc.function.arguments }
        }
        content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input })
      }
    }

    const stopReason =
      choice?.finish_reason === 'tool_calls'
        ? 'tool_use'
        : choice?.finish_reason === 'length'
          ? 'max_tokens'
          : 'end_turn'

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

/**
 * Creates an Anthropic SDK-compatible client backed by an OpenAI-compatible API.
 *
 * Usage:
 *   CLAUDE_CODE_USE_OPENAI=1 OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o
 */
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
    // Some code paths access .messages directly (non-beta)
    messages: beta.messages,
  }
}
