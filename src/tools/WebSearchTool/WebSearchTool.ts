import { tavily } from '@tavily/core'
import type { PermissionResult } from 'src/utils/permissions/PermissionResult.js'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logError } from '../../utils/log.js'
import { getWebSearchPrompt, WEB_SEARCH_TOOL_NAME } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
} from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(2).describe('The search query to use'),
    numResults: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .describe('Number of results to return (1-10, default 5)'),
    searchDepth: z
      .enum(['basic', 'advanced'])
      .optional()
      .describe('basic (fast, 1 credit) or advanced (deep crawl, 2 credits). Default: basic'),
    includeAnswer: z
      .boolean()
      .optional()
      .describe('Include an AI-generated answer summary. Default: false'),
    allowed_domains: z
      .array(z.string())
      .optional()
      .describe('Only include results from these domains'),
    blocked_domains: z
      .array(z.string())
      .optional()
      .describe('Never include results from these domains'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

type Input = z.infer<InputSchema>

export type SearchResult = {
  title: string
  url: string
  snippet: string
}

export type Output = {
  query: string
  results: SearchResult[]
  answer?: string
  durationSeconds: number
}

// Re-export WebSearchProgress from centralized types to break import cycles
export type { WebSearchProgress } from '../../types/tools.js'

const SNIPPET_MAX_LENGTH = 200

function cleanSnippet(raw: string): string {
  return raw
    // Remove markdown images: ![alt](url)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Remove markdown links but keep text: [text](url) -> text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Remove bare image URLs
    .replace(/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)\S*/gi, '')
    // Remove ### headings markers
    .replace(/#{1,6}\s*/g, '')
    // Collapse multiple spaces/newlines
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateSnippet(text: string, max: number = SNIPPET_MAX_LENGTH): string {
  if (text.length <= max) return text
  return text.slice(0, max).replace(/\s+\S*$/, '') + '...'
}

function getClient() {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return null
  return tavily({ apiKey })
}

export const WebSearchTool = buildTool({
  name: WEB_SEARCH_TOOL_NAME,
  searchHint: 'search the web for current information',
  maxResultSizeChars: 100_000,
  shouldDefer: false,
  async description(input) {
    return `Claude wants to search the web for: ${input.query}`
  },
  userFacingName() {
    return 'Web Search'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `Searching for ${summary}` : 'Searching the web'
  },
  isEnabled() {
    return Boolean(process.env.TAVILY_API_KEY)
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.query
  },
  async checkPermissions(_input): Promise<PermissionResult> {
    return {
      behavior: 'passthrough',
      message: 'WebSearchTool requires permission.',
      suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: WEB_SEARCH_TOOL_NAME }],
          behavior: 'allow',
          destination: 'localSettings',
        },
      ],
    }
  },
  async prompt() {
    return getWebSearchPrompt()
  },
  renderToolUseMessage,
  renderToolResultMessage,
  extractSearchText() {
    return ''
  },
  async validateInput(input) {
    const { query, allowed_domains, blocked_domains } = input
    if (!query.length) {
      return {
        result: false,
        message: 'Error: Missing query',
        errorCode: 1,
      }
    }
    if (allowed_domains?.length && blocked_domains?.length) {
      return {
        result: false,
        message:
          'Error: Cannot specify both allowed_domains and blocked_domains in the same request',
        errorCode: 2,
      }
    }
    return { result: true }
  },
  async call(input, _context) {
    const startTime = performance.now()
    const {
      query,
      numResults = 5,
      searchDepth = 'basic',
      includeAnswer = false,
      allowed_domains,
      blocked_domains,
    } = input

    const client = getClient()
    if (!client) {
      const durationSeconds = (performance.now() - startTime) / 1000
      return {
        data: { query, results: [], durationSeconds } as Output,
      }
    }

    try {
      const response = await client.search(query, {
        maxResults: numResults,
        searchDepth,
        includeAnswer: includeAnswer ? 'basic' : false,
        includeDomains: allowed_domains,
        excludeDomains: blocked_domains,
      })
      const results: SearchResult[] = (response.results ?? []).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: truncateSnippet(cleanSnippet(r.content ?? '')),
      }))

      const durationSeconds = (performance.now() - startTime) / 1000

      const data: Output = {
        query,
        results,
        answer: typeof response.answer === 'string' ? response.answer : undefined,
        durationSeconds,
      }

      return { data }
    } catch (error) {
      logError(error)
      const durationSeconds = (performance.now() - startTime) / 1000
      return {
        data: { query, results: [], durationSeconds } as Output,
      }
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const { query, results, answer } = output

    const parts: string[] = [`Web search results for query: "${query}"\n`]
    if (answer) {
      parts.push(`**Answer:** ${answer}\n`)
    }
    if (results.length > 0) {
      parts.push(
        results
          .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`)
          .join('\n\n'),
      )
      parts.push(
        `\nSources:\n` + results.map((r) => `- [${r.title}](${r.url})`).join('\n'),
      )
    } else {
      parts.push('No results found.')
    }

    parts.push(
      '\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.',
    )

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: parts.join('\n').trim(),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
