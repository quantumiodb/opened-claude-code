/**
 * How tool-search deferral is carried out on the wire.
 *
 * Kept in its own module because both utils/toolSearch.ts and
 * tools/ToolSearchTool/prompt.ts need it, and toolSearch.ts already imports
 * from prompt.ts — putting it in either would close a cycle.
 */

import { isEnvTruthy } from './envUtils.js'
import { getAPIProvider, isFirstPartyAnthropicBaseUrl } from './model/providers.js'

/**
 *   'api'   — the API does the deferring: deferred tools are sent with
 *             defer_loading:true and expanded when a tool_reference block
 *             references them. Needs the tool-search beta header and an
 *             endpoint that accepts both beta shapes.
 *   'local' — we do it: undiscovered tools are simply omitted from the request
 *             and discovered ones are sent as ordinary tool definitions.
 *             tool_reference blocks stay in the local transcript (that's how
 *             discovery is tracked) but are stripped before the request goes
 *             out. Emits zero beta shapes, so it works against any endpoint.
 *
 * Both transports save the same context; only 'api' needs beta support.
 */
export type ToolSearchTransport = 'api' | 'local'

/**
 * Pick the transport. 'local' whenever beta shapes can't be trusted to survive
 * to the API:
 *
 *   - ENABLE_TOOL_SEARCH=local — explicit opt-in.
 *   - CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS — the beta kill switch. Local mode
 *     emits no beta fields at all, so it honors the switch while still saving
 *     the context. github.com/anthropics/claude-code/issues/20031
 *   - firstParty provider on a non-first-party base URL — an ANTHROPIC_BASE_URL
 *     proxy. Some forward tool_reference, most don't; guessing wrong costs a
 *     400, and guessing 'local' costs nothing.
 *     github.com/anthropics/claude-code/issues/30912
 */
export function getToolSearchTransport(): ToolSearchTransport {
  if (process.env.ENABLE_TOOL_SEARCH === 'local') return 'local'
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)) {
    return 'local'
  }
  if (getAPIProvider() === 'firstParty' && !isFirstPartyAnthropicBaseUrl()) {
    return 'local'
  }
  return 'api'
}

export function isLocalToolSearchTransport(): boolean {
  return getToolSearchTransport() === 'local'
}
