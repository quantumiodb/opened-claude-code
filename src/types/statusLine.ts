/**
 * Input passed to the custom status line command (`settings.statusLine.command`)
 * via stdin. Shape matches the output of `buildStatusLineCommandInput`.
 */
export type StatusLineCommandInput = {
  session_id: string // session id
  transcript_path: string // transcript path
  cwd: string // current working directory
  permission_mode?: string // tool permission mode snapshot
  agent_id?: string // subagent id (if any)
  agent_type?: string // subagent type or main thread type
  session_name?: string // user-visible session title (if any)
  model: {
    id: string // current main loop model id
    display_name: string // localized display name
  }
  workspace: {
    current_dir: string // process cwd
    project_dir: string // project root (original cwd)
    added_dirs: string[] // additional workspace directories
  }
  version: string // CLI version (MACRO.VERSION)
  output_style: {
    name: string // current output style name
  }
  cost: {
    total_cost_usd: number // cumulative cost estimate in USD
    total_duration_ms: number // session wall-clock duration
    total_api_duration_ms: number // cumulative API round-trip time
    total_lines_added: number // attributed lines added
    total_lines_removed: number // attributed lines removed
  }
  context_window: {
    total_input_tokens: number | null // cumulative input tokens (null if unknown)
    total_output_tokens: number | null // cumulative output tokens
    context_window_size: number // current model context limit
    current_usage: {
      input_tokens: number // latest usage snapshot: input
      output_tokens: number // latest usage snapshot: output
      cache_creation_input_tokens: number // cache write tokens
      cache_read_input_tokens: number // cache hit read tokens
    } | null // null when no valid usage yet
    used_percentage: number | null // used context percentage
    remaining_percentage: number | null // remaining percentage
  }
  exceeds_200k_tokens: boolean // whether input exceeds the 200k warning threshold
  effort?: {
    level: string // current reasoning effort (low/medium/high/xhigh/max); absent when the model doesn't support it
  }
  thinking?: {
    enabled: boolean // whether extended thinking is enabled
  }
  rate_limits?: {
    five_hour?: { used_percentage: number; resets_at: number } // 5-hour window usage and reset timestamp
    seven_day?: { used_percentage: number; resets_at: number } // 7-day window
  }
  vim?: {
    mode: string // current vim mode label (e.g. INSERT)
  }
  agent?: {
    name: string // `--agent` or subagent type name
  }
  remote?: {
    session_id: string // remote/bridged session id
  }
  worktree?: {
    name: string // worktree display name
    path: string // worktree root path
    branch?: string // current branch (optional)
    original_cwd: string // cwd before entering the worktree
    original_branch?: string // branch before entering (optional)
  }
}
