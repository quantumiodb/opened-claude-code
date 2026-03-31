/**
 * Stub: types/tools.ts — missing from source map extraction.
 */

export interface BashProgress {
  [key: string]: unknown;
}

export interface ShellProgress {
  [key: string]: unknown;
}

export interface PowerShellProgress {
  [key: string]: unknown;
}

export interface MCPProgress {
  [key: string]: unknown;
}

export interface AgentToolProgress {
  [key: string]: unknown;
}

export interface SkillToolProgress {
  [key: string]: unknown;
}

export interface REPLToolProgress {
  [key: string]: unknown;
}

export interface TaskOutputProgress {
  [key: string]: unknown;
}

export interface WebSearchProgress {
  [key: string]: unknown;
}

export interface SdkWorkflowProgress {
  [key: string]: unknown;
}

export type ToolProgressData =
  | BashProgress
  | ShellProgress
  | PowerShellProgress
  | MCPProgress
  | AgentToolProgress
  | SkillToolProgress
  | REPLToolProgress
  | TaskOutputProgress
  | WebSearchProgress
  | SdkWorkflowProgress;
