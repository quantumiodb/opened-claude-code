/**
 * Stub: types/message.ts — missing from source map extraction.
 * These types are used throughout the codebase for message passing.
 */

export type MessageOrigin = string;
export type SystemMessageLevel = 'info' | 'warning' | 'error';
export type PartialCompactDirection = 'forward' | 'backward';

export interface CompactMetadata {
  [key: string]: unknown;
}

interface BaseMessage {
  type: string;
  [key: string]: unknown;
}

export interface UserMessage extends BaseMessage {
  type: 'user';
  content: unknown;
}

export interface AssistantMessage extends BaseMessage {
  type: 'assistant';
  content: unknown;
}

export interface SystemMessage extends BaseMessage {
  type: 'system';
  content: unknown;
}

export interface ProgressMessage extends BaseMessage {
  type: 'progress';
}

export interface HookResultMessage extends BaseMessage {
  type: 'hook_result';
}

export interface AttachmentMessage extends BaseMessage {
  type: 'attachment';
}

export interface SystemAPIErrorMessage extends BaseMessage {
  type: 'system_api_error';
}

export interface SystemCompactBoundaryMessage extends BaseMessage {
  type: 'system_compact_boundary';
  metadata?: CompactMetadata;
}

export interface SystemLocalCommandMessage extends BaseMessage {
  type: 'system_local_command';
}

export interface SystemBridgeStatusMessage extends BaseMessage {
  type: 'system_bridge_status';
}

export interface SystemTurnDurationMessage extends BaseMessage {
  type: 'system_turn_duration';
}

export interface SystemThinkingMessage extends BaseMessage {
  type: 'system_thinking';
}

export interface SystemMemorySavedMessage extends BaseMessage {
  type: 'system_memory_saved';
}

export interface SystemInformationalMessage extends BaseMessage {
  type: 'system_informational';
  level?: SystemMessageLevel;
}

export interface SystemApiMetricsMessage extends BaseMessage {
  type: 'system_api_metrics';
}

export interface SystemAwaySummaryMessage extends BaseMessage {
  type: 'system_away_summary';
}

export interface SystemMicrocompactBoundaryMessage extends BaseMessage {
  type: 'system_microcompact_boundary';
}

export interface SystemPermissionRetryMessage extends BaseMessage {
  type: 'system_permission_retry';
}

export interface SystemScheduledTaskFireMessage extends BaseMessage {
  type: 'system_scheduled_task_fire';
}

export interface SystemStopHookSummaryMessage extends BaseMessage {
  type: 'system_stop_hook_summary';
}

export interface SystemFileSnapshotMessage extends BaseMessage {
  type: 'system_file_snapshot';
}

export interface ToolUseSummaryMessage extends BaseMessage {
  type: 'tool_use_summary';
}

export interface GroupedToolUseMessage extends BaseMessage {
  type: 'grouped_tool_use';
}

export interface CollapsedReadSearchGroup extends BaseMessage {
  type: 'collapsed_read_search';
}

export interface StopHookInfo {
  [key: string]: unknown;
}

export interface StreamEvent {
  [key: string]: unknown;
}

export interface RequestStartEvent {
  [key: string]: unknown;
}

export type CollapsibleMessage = GroupedToolUseMessage | CollapsedReadSearchGroup;

export type NormalizedUserMessage = UserMessage & { normalized: true };
export type NormalizedAssistantMessage = AssistantMessage & { normalized: true };
export type NormalizedMessage = NormalizedUserMessage | NormalizedAssistantMessage;

export type RenderableMessage =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | ProgressMessage
  | HookResultMessage
  | AttachmentMessage
  | ToolUseSummaryMessage
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup;

export type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | ProgressMessage
  | HookResultMessage
  | AttachmentMessage
  | SystemAPIErrorMessage
  | SystemCompactBoundaryMessage
  | SystemLocalCommandMessage
  | SystemBridgeStatusMessage
  | SystemTurnDurationMessage
  | SystemThinkingMessage
  | SystemMemorySavedMessage
  | SystemInformationalMessage
  | SystemApiMetricsMessage
  | SystemAwaySummaryMessage
  | SystemMicrocompactBoundaryMessage
  | SystemPermissionRetryMessage
  | SystemScheduledTaskFireMessage
  | SystemStopHookSummaryMessage
  | SystemFileSnapshotMessage
  | ToolUseSummaryMessage;
