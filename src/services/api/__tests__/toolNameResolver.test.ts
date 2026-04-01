import { describe, it, expect } from 'vitest'
import {
  ToolNameResolver,
  StreamToolState,
  AnthropicToolDef,
  appendUniquePrefix,
  sanitizeToolNameAndSpill,
  updateToolNameState,
} from '../openaiShim.js'

function makeTool(name: string): AnthropicToolDef {
  return { name, description: `desc for ${name}` }
}

function makeState(overrides?: Partial<StreamToolState>): StreamToolState {
  return {
    id: '',
    name: '',
    nameLocked: false,
    argsBuffer: '',
    blockIndex: -1,
    started: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// ToolNameResolver construction
// ---------------------------------------------------------------------------

describe('ToolNameResolver', () => {
  describe('constructor', () => {
    it('builds from a tools list', () => {
      const resolver = new ToolNameResolver([makeTool('Bash'), makeTool('Read')])
      expect(resolver.isEmpty).toBe(false)
      expect(resolver.findCanonical('Bash')).toBe('Bash')
      expect(resolver.findCanonical('Read')).toBe('Read')
    })

    it('falls back to FALLBACK_COMMON_TOOL_NAMES when tools is undefined', () => {
      const resolver = new ToolNameResolver(undefined)
      expect(resolver.isEmpty).toBe(false)
      expect(resolver.findCanonical('Bash')).toBe('Bash')
      expect(resolver.findCanonical('Edit')).toBe('Edit')
    })

    it('falls back to FALLBACK_COMMON_TOOL_NAMES when tools is empty', () => {
      const resolver = new ToolNameResolver([])
      expect(resolver.isEmpty).toBe(false)
      expect(resolver.findCanonical('Grep')).toBe('Grep')
    })

    it('trims tool names', () => {
      const resolver = new ToolNameResolver([makeTool('  MyTool  ')])
      expect(resolver.findCanonical('MyTool')).toBe('MyTool')
    })

    it('skips tools with empty names', () => {
      const resolver = new ToolNameResolver([makeTool(''), makeTool('Good')])
      expect(resolver.findCanonical('Good')).toBe('Good')
    })
  })

  // ---------------------------------------------------------------------------
  // findCanonical
  // ---------------------------------------------------------------------------

  describe('findCanonical', () => {
    const resolver = new ToolNameResolver([makeTool('Bash'), makeTool('ReadFile')])

    it('returns exact match', () => {
      expect(resolver.findCanonical('Bash')).toBe('Bash')
    })

    it('returns case-insensitive match', () => {
      expect(resolver.findCanonical('bash')).toBe('Bash')
      expect(resolver.findCanonical('READFILE')).toBe('ReadFile')
    })

    it('returns null for unknown name', () => {
      expect(resolver.findCanonical('Unknown')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(resolver.findCanonical('')).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // findLongestPrefix
  // ---------------------------------------------------------------------------

  describe('findLongestPrefix', () => {
    const resolver = new ToolNameResolver([
      makeTool('Read'),
      makeTool('ReadFile'),
      makeTool('Write'),
    ])

    it('returns the longest matching prefix', () => {
      expect(resolver.findLongestPrefix('ReadFile{"path":"x"}')).toBe('ReadFile')
    })

    it('returns shorter match when longer does not match', () => {
      expect(resolver.findLongestPrefix('Read{"path":"x"}')).toBe('Read')
    })

    it('returns null when no prefix matches', () => {
      expect(resolver.findLongestPrefix('Unknown')).toBeNull()
    })

    it('is case-insensitive', () => {
      expect(resolver.findLongestPrefix('readfile{"x":1}')).toBe('ReadFile')
    })
  })

  // ---------------------------------------------------------------------------
  // hasNameWithPrefix
  // ---------------------------------------------------------------------------

  describe('hasNameWithPrefix', () => {
    const resolver = new ToolNameResolver([makeTool('Bash'), makeTool('BashExec')])

    it('returns true when a tool name starts with the prefix', () => {
      expect(resolver.hasNameWithPrefix('Bas')).toBe(true)
    })

    it('returns true for full name', () => {
      expect(resolver.hasNameWithPrefix('Bash')).toBe(true)
    })

    it('returns false for non-matching prefix', () => {
      expect(resolver.hasNameWithPrefix('Xyz')).toBe(false)
    })

    it('is case-insensitive', () => {
      expect(resolver.hasNameWithPrefix('bas')).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // isReadyToStart
  // ---------------------------------------------------------------------------

  describe('isReadyToStart', () => {
    it('returns false when name is empty', () => {
      const resolver = new ToolNameResolver([makeTool('Bash')])
      const state = makeState({ name: '' })
      expect(resolver.isReadyToStart(state)).toBe(false)
    })

    it('returns true when nameLocked is true and resolver has tools', () => {
      const resolver = new ToolNameResolver([makeTool('Bash')])
      const state = makeState({ name: 'Bash', nameLocked: true })
      expect(resolver.isReadyToStart(state)).toBe(true)
    })

    it('returns false when nameLocked is false and resolver has tools', () => {
      const resolver = new ToolNameResolver([makeTool('Bash')])
      const state = makeState({ name: 'Ba', nameLocked: false })
      expect(resolver.isReadyToStart(state)).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// appendUniquePrefix
// ---------------------------------------------------------------------------

describe('appendUniquePrefix', () => {
  it('returns incoming when existing is empty', () => {
    expect(appendUniquePrefix('', 'abc')).toBe('abc')
  })

  it('returns existing when incoming is empty', () => {
    expect(appendUniquePrefix('abc', '')).toBe('abc')
  })

  it('returns incoming when it starts with existing', () => {
    expect(appendUniquePrefix('Ba', 'Bash')).toBe('Bash')
  })

  it('returns existing when it ends with incoming', () => {
    expect(appendUniquePrefix('Bash', 'sh')).toBe('Bash')
  })

  it('concatenates when no overlap', () => {
    expect(appendUniquePrefix('Ba', 'sh')).toBe('Bash')
  })
})

// ---------------------------------------------------------------------------
// sanitizeToolNameAndSpill
// ---------------------------------------------------------------------------

describe('sanitizeToolNameAndSpill', () => {
  it('does nothing when resolver is null', () => {
    const state = makeState({ name: 'foo' })
    sanitizeToolNameAndSpill(state, null)
    expect(state.name).toBe('foo')
    expect(state.nameLocked).toBe(false)
  })

  it('does nothing when name is empty', () => {
    const resolver = new ToolNameResolver([makeTool('Bash')])
    const state = makeState({ name: '' })
    sanitizeToolNameAndSpill(state, resolver)
    expect(state.name).toBe('')
  })

  it('corrects to canonical on exact match', () => {
    const resolver = new ToolNameResolver([makeTool('Bash')])
    const state = makeState({ name: 'bash' })
    sanitizeToolNameAndSpill(state, resolver)
    expect(state.name).toBe('Bash')
    expect(state.nameLocked).toBe(true)
  })

  it('splits on prefix match and spills remainder to argsBuffer', () => {
    const resolver = new ToolNameResolver([makeTool('Bash')])
    const state = makeState({ name: 'Bash{"cmd":"ls"}', argsBuffer: '' })
    sanitizeToolNameAndSpill(state, resolver)
    expect(state.name).toBe('Bash')
    expect(state.nameLocked).toBe(true)
    expect(state.argsBuffer).toBe('{"cmd":"ls"}')
  })

  it('prepends spill to existing argsBuffer', () => {
    const resolver = new ToolNameResolver([makeTool('Bash')])
    const state = makeState({ name: 'BashExtra', argsBuffer: 'existing' })
    sanitizeToolNameAndSpill(state, resolver)
    expect(state.name).toBe('Bash')
    expect(state.argsBuffer).toBe('Extraexisting')
  })

  it('does nothing when no match at all', () => {
    const resolver = new ToolNameResolver([makeTool('Bash')])
    const state = makeState({ name: 'Unknown' })
    sanitizeToolNameAndSpill(state, resolver)
    expect(state.name).toBe('Unknown')
    expect(state.nameLocked).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// updateToolNameState
// ---------------------------------------------------------------------------

describe('updateToolNameState', () => {
  it('does nothing for empty incoming chunk', () => {
    const state = makeState({ name: 'X' })
    updateToolNameState(state, '', null)
    expect(state.name).toBe('X')
  })

  describe('without resolver', () => {
    it('concatenates and locks immediately', () => {
      const state = makeState()
      updateToolNameState(state, 'Bash', null)
      expect(state.name).toBe('Bash')
      expect(state.nameLocked).toBe(true)
    })
  })

  describe('with resolver', () => {
    const tools = [makeTool('Bash'), makeTool('Read'), makeTool('ReadFile')]

    it('exact match locks the name', () => {
      const resolver = new ToolNameResolver(tools)
      const state = makeState()
      updateToolNameState(state, 'Bash', resolver)
      expect(state.name).toBe('Bash')
      expect(state.nameLocked).toBe(true)
    })

    it('incremental streaming leads to match', () => {
      const resolver = new ToolNameResolver(tools)
      const state = makeState()
      updateToolNameState(state, 'Ba', resolver)
      expect(state.name).toBe('Ba')
      expect(state.nameLocked).toBe(false) // still accumulating

      updateToolNameState(state, 'sh', resolver)
      expect(state.name).toBe('Bash')
      expect(state.nameLocked).toBe(true)
    })

    it('prefix match spills to argsBuffer', () => {
      const resolver = new ToolNameResolver(tools)
      const state = makeState()
      updateToolNameState(state, 'Read{"path":"x"}', resolver)
      // Longest prefix is "Read" (or "ReadFile" if it matches — but "Read{" doesn't start with "ReadFile")
      // Actually "Read{..." starts with "Read" — longest match
      // But we also need to check: does it start with "ReadFile"? No, because 'read{"path":"x"}' does not start with 'readfile'
      expect(state.name).toBe('Read')
      expect(state.nameLocked).toBe(true)
      expect(state.argsBuffer).toBe('{"path":"x"}')
    })

    it('locked name receiving duplicate chunk spills excess', () => {
      const resolver = new ToolNameResolver(tools)
      const state = makeState({ name: 'Bash', nameLocked: true })
      updateToolNameState(state, 'Bash', resolver)
      // incoming starts with state.name (case-insensitive) → spill is empty
      expect(state.name).toBe('Bash')
      expect(state.argsBuffer).toBe('')
    })

    it('locked name receiving extra data spills to argsBuffer', () => {
      const resolver = new ToolNameResolver(tools)
      const state = makeState({ name: 'Bash', nameLocked: true })
      updateToolNameState(state, '{"cmd":"ls"}', resolver)
      expect(state.name).toBe('Bash')
      expect(state.argsBuffer).toBe('{"cmd":"ls"}')
    })

    it('unknown name stays unlocked', () => {
      const resolver = new ToolNameResolver(tools)
      const state = makeState()
      updateToolNameState(state, 'Xyz', resolver)
      expect(state.name).toBe('Xyz')
      expect(state.nameLocked).toBe(false)
    })

    it('partial prefix that could still match stays unlocked', () => {
      const resolver = new ToolNameResolver(tools)
      const state = makeState()
      updateToolNameState(state, 'Re', resolver)
      expect(state.name).toBe('Re')
      expect(state.nameLocked).toBe(false) // could be Read or ReadFile
    })

    it('longest prefix wins when multiple tools share prefix', () => {
      const resolver = new ToolNameResolver(tools)
      const state = makeState()
      updateToolNameState(state, 'ReadFile', resolver)
      expect(state.name).toBe('ReadFile')
      expect(state.nameLocked).toBe(true)
    })
  })
})
