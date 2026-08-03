import { describe, expect, test } from 'vitest'
import { filterToolProgressMessages } from '../Tool.js'

describe('filterToolProgressMessages', () => {
  test('filters out messages with null/undefined data', () => {
    // Regression: a progress message whose data is null used to pass through
    // (null?.type === undefined !== 'hook_progress') and reach tool progress
    // renderers, which then crashed on data.taskId / data.output field access
    // (claude-code-best/claude-code#1330).
    const messages = [
      { data: null },
      { data: undefined },
      { data: { type: 'tool_progress', toolName: 'Bash' } },
    ] as any[]
    const result = filterToolProgressMessages(messages)
    expect(result).toHaveLength(1)
    expect((result[0]!.data as any).type).toBe('tool_progress')
  })
})
