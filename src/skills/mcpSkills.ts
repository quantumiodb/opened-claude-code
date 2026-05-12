/**
 * Stub replacement: src/skills/mcpSkills.ts
 *
 * The upstream implementation walks an MCP server's `prompts` and
 * `resources` capabilities and converts them into Claude Code "skills"
 * (custom slash commands). The full source isn't in our extraction.
 *
 * For the deepseek branch we want the rest of the MCP integration to keep
 * working when a server advertises hasPrompts/hasResources — without this
 * fallback the call site (client.ts:2175) crashes with
 * "fetchMcpSkillsForClient is not a function", aborting tool registration
 * for that server. Returning [] silently disables the prompts-as-skills
 * feature while preserving regular tool access.
 *
 * Shape must match the memoizeWithLRU pattern used by the call sites:
 *   - callable: (client) => Promise<unknown[]>
 *   - .cache.delete(name): no-op so client.ts:1393 and
 *     useManageMCPConnections.ts:723 stay safe.
 */

import type { MCPServerConnection } from '../services/mcp/client.js'

type SkillEntry = unknown

interface CacheLike {
  delete: (name: string) => void
  clear: () => void
}

interface SkillsFetcher {
  (client: MCPServerConnection): Promise<SkillEntry[]>
  cache: CacheLike
}

const noopCache: CacheLike = {
  delete: () => {},
  clear: () => {},
}

export const fetchMcpSkillsForClient: SkillsFetcher = Object.assign(
  async (_client: MCPServerConnection): Promise<SkillEntry[]> => [],
  { cache: noopCache },
)
