/**
 * Telemetry is disabled in this OSS snapshot.
 * Keep this shim so call sites can compile without OpenTelemetry deps.
 */

export type Span = Record<string, never>
export type LLMRequestNewContext = Record<string, unknown>

export async function logOTelEvent(
  _name: string,
  _attributes?: Record<string, string | number | boolean | undefined>,
): Promise<void> {}

export function redactIfDisabled<T>(value: T): T {
  return value
}

export function isBetaTracingEnabled(): boolean {
  return false
}

export function isEnhancedTelemetryEnabled(): boolean {
  return false
}

export function startInteractionSpan(_prompt?: string): void {}
export function endInteractionSpan(): void {}

export function startLLMRequestSpan(
  _input?: unknown,
  _context?: LLMRequestNewContext,
): Span | undefined {
  return undefined
}
export function endLLMRequestSpan(_span?: Span, _result?: unknown): void {}

export function startHookSpan(_name?: string): Span | undefined {
  return undefined
}
export function endHookSpan(_span?: Span, _status?: string): void {}

export function startToolSpan(_name?: string): Span | undefined {
  return undefined
}
export function endToolSpan(_span?: Span, _status?: string): void {}

export function startToolExecutionSpan(_name?: string): Span | undefined {
  return undefined
}
export function endToolExecutionSpan(_span?: Span, _status?: string): void {}

export function startToolBlockedOnUserSpan(_name?: string): Span | undefined {
  return undefined
}
export function endToolBlockedOnUserSpan(
  _span?: Span,
  _status?: string,
): void {}

export function addToolContentEvent(
  _span?: Span,
  _content?: unknown,
  _metadata?: unknown,
): void {}

export function isPerfettoTracingEnabled(): boolean {
  return false
}
export function registerAgent(_agentId: string): void {}
export function unregisterAgent(_agentId: string): void {}

export function clearBetaTracingState(): void {}

export function buildPluginTelemetryFields(
  _name?: string,
  _marketplace?: string,
  _managedPluginNames?: string[],
): Record<string, string> {
  return {}
}

export function buildPluginCommandTelemetryFields(
  _pluginInfo?: unknown,
): Record<string, string> {
  return {}
}

export function classifyPluginCommandError(_error: unknown): string {
  return 'unknown'
}

export function logPluginLoadErrors(_errors?: unknown): void {}
export function logPluginsEnabledForSession(_plugins?: unknown): void {}
export function logSkillsLoaded(_skills?: unknown): void {}

export function bootstrapTelemetry(): void {}
export async function initializeTelemetry(): Promise<null> {
  return null
}
export async function flushTelemetry(): Promise<void> {}

