import React from 'react'
import { MessageResponse } from '../../components/MessageResponse.js'
import { TOOL_SUMMARY_MAX_LENGTH } from '../../constants/toolLimits.js'
import { Box, Text } from '../../ink.js'
import { truncate } from '../../utils/format.js'
import type { Output } from './WebSearchTool.js'

export function renderToolUseMessage(
  {
    query,
    allowed_domains,
    blocked_domains,
  }: Partial<{
    query: string
    allowed_domains?: string[]
    blocked_domains?: string[]
  }>,
  { verbose }: { verbose: boolean },
): React.ReactNode {
  if (!query) {
    return null
  }

  let message = `"${query}"`

  if (verbose) {
    if (allowed_domains && allowed_domains.length > 0) {
      message += `, only allowing domains: ${allowed_domains.join(', ')}`
    }
    if (blocked_domains && blocked_domains.length > 0) {
      message += `, blocking domains: ${blocked_domains.join(', ')}`
    }
  }

  return message
}

export function renderToolResultMessage(output: Output): React.ReactNode {
  const results = output.results ?? []
  const timeDisplay =
    output.durationSeconds >= 1
      ? `${Math.round(output.durationSeconds)}s`
      : `${Math.round(output.durationSeconds * 1000)}ms`

  if (!results.length) {
    return (
      <MessageResponse height={1}>
        <Text dimColor>No results found ({timeDisplay})</Text>
      </MessageResponse>
    )
  }

  return (
    <Box flexDirection="column">
      {output.answer && (
        <Box marginBottom={1}>
          <Text bold>Answer: </Text>
          <Text>{output.answer}</Text>
        </Box>
      )}
      {results.map((r, i) => (
        <Box key={i} flexDirection="column">
          <Text>  <Text bold>{i + 1}. {r.title}</Text></Text>
          <Text dimColor>     {r.url}</Text>
          {r.snippet ? <Text>     {r.snippet}</Text> : null}
        </Box>
      ))}
      <Text dimColor>  ({results.length} result{results.length !== 1 ? 's' : ''} in {timeDisplay})</Text>
    </Box>
  )
}

export function getToolUseSummary(
  input: Partial<{ query: string }> | undefined,
): string | null {
  if (!input?.query) {
    return null
  }
  return truncate(input.query, TOOL_SUMMARY_MAX_LENGTH)
}
