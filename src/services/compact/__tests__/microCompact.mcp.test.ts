import { describe, expect, it } from 'vitest'

// Mirror the predicate from microCompact.ts to test the logic in isolation.
// The actual module can't be imported in vitest due to bun:bundle dependency.
const COMPACTABLE_TOOLS = new Set([
  'Read',
  'Bash',
  'Grep',
  'Glob',
  'WebSearch',
  'WebFetch',
  'FileEdit',
  'FileWrite',
])

const MCP_TOOL_PREFIX = 'mcp__'

function isCompactableTool(name: string): boolean {
  return COMPACTABLE_TOOLS.has(name) || name.startsWith(MCP_TOOL_PREFIX)
}

describe('isCompactableTool', () => {
  it('matches built-in tools', () => {
    expect(isCompactableTool('Read')).toBe(true)
    expect(isCompactableTool('Bash')).toBe(true)
    expect(isCompactableTool('Grep')).toBe(true)
    expect(isCompactableTool('Glob')).toBe(true)
    expect(isCompactableTool('WebSearch')).toBe(true)
    expect(isCompactableTool('WebFetch')).toBe(true)
    expect(isCompactableTool('FileEdit')).toBe(true)
    expect(isCompactableTool('FileWrite')).toBe(true)
  })

  it('matches MCP tools by prefix', () => {
    expect(isCompactableTool('mcp__github__get_file_contents')).toBe(true)
    expect(isCompactableTool('mcp__slack__send_message')).toBe(true)
    expect(isCompactableTool('mcp__playwright__screenshot')).toBe(true)
    expect(isCompactableTool('mcp__anything')).toBe(true)
  })

  it('does not match unknown non-MCP tools', () => {
    expect(isCompactableTool('UnknownTool')).toBe(false)
    expect(isCompactableTool('CustomTool')).toBe(false)
    expect(isCompactableTool('')).toBe(false)
  })

  it('does not match tools with mcp__ in the middle', () => {
    expect(isCompactableTool('my_mcp__tool')).toBe(false)
    expect(isCompactableTool('something_mcp__')).toBe(false)
  })
})
