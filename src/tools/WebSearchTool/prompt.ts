import { getLocalMonthYear } from 'src/constants/common.js'

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'

export function getWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  return `## WebSearch — Web search tool (powered by Tavily)

Searches the web via Tavily and returns structured results including extracted content.

### When to use
- Find URLs when you don't know them
- Get current information beyond your knowledge cutoff
- Discover relevant sources, then use WebFetch for full page content if needed

### Input
- \`query\`: Natural language search query
- \`numResults\` (optional): Number of results (1-10, default 5)
- \`searchDepth\` (optional): basic (fast) or advanced (deep crawl). Default: basic
- \`includeAnswer\` (optional): Include an AI-generated answer summary. Default: false
- \`allowedDomains\` (optional): Restrict results to these domains
- \`blockedDomains\` (optional): Exclude results from these domains

### Notes
- Requires TAVILY_API_KEY to be set
- Always include a Sources section in your response when using search results

IMPORTANT - Use the correct year in search queries:
  - The current month is ${currentMonthYear}. You MUST use this year when searching for recent information, documentation, or current events.
`
}
