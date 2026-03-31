/**
 * Stub type declarations for Anthropic-internal packages.
 *
 * These packages are only loaded behind feature flags
 * (CHICAGO_MCP, BRIDGE_MODE, etc.) or USER_TYPE === 'ant'.
 * We declare them as `any` so the code compiles without them.
 */

declare module '@ant/claude-for-chrome-mcp' {
  export const BROWSER_TOOLS: any;
  export function createChromeExtensionMcpServer(...args: any[]): any;
  export function registerBrowserTools(...args: any[]): any;
}

declare module '@ant/computer-use-mcp' {
  export function buildComputerUseTools(...args: any[]): any;
  export function bindSessionContext(...args: any[]): any;
  export const API_RESIZE_PARAMS: any;
  export function targetImageSize(...args: any[]): any;
  export const DEFAULT_GRANT_FLAGS: any;
  export type ComputerUseSessionContext = any;
  export type CuCallToolResult = any;
  export type CuPermissionRequest = any;
  export type CuPermissionResponse = any;
  export type ScreenshotDims = any;
}

declare module '@ant/computer-use-mcp/sentinelApps' {
  export function getSentinelCategory(...args: any[]): any;
}

declare module '@ant/computer-use-mcp/types' {
  export type CuPermissionRequest = any;
  export type CuPermissionResponse = any;
  export type CoordinateMode = any;
  export type CuSubGates = any;
  export const DEFAULT_GRANT_FLAGS: any;
}

declare module '@ant/computer-use-swift' {
  export type ComputerUseAPI = any;
}

declare module '@ant/computer-use-input' {
  export function createInputController(...args: any[]): any;
  export type InputController = any;
}

declare module '@anthropic-ai/claude-agent-sdk' {
  export type PermissionMode = string;
  export const PermissionMode: Record<string, string>;
}

declare module '@anthropic-ai/sandbox-runtime' {
  export function createSandbox(...args: any[]): any;
  export function startSandbox(...args: any[]): any;
  export type SandboxConfig = any;
  export type SandboxInstance = any;
  export type SandboxProcess = any;
  export type SandboxProcessResult = any;
}

declare module '@anthropic-ai/mcpb' {
  export type McpbManifest = any;
  export function parseMcpbManifest(...args: any[]): any;
  export function resolveMcpbPackage(...args: any[]): any;
}

/* Native modules that are optional and platform-specific */
declare module 'color-diff-napi' {
  export function colorDiff(...args: any[]): any;
  export type ColorDiffResult = any;
}

declare module 'audio-capture.node' {
  const mod: any;
  export default mod;
}

declare module '@anthropic-ai/bedrock-sdk' {
  export class AnthropicBedrock {
    constructor(options?: any);
    messages: any;
    beta: any;
  }
}

declare module '@anthropic-ai/vertex-sdk' {
  export class AnthropicVertex {
    constructor(options?: any);
    messages: any;
    beta: any;
  }
}

declare module '@anthropic-ai/foundry-sdk' {
  export class AnthropicFoundry {
    constructor(options?: any);
    messages: any;
    beta: any;
  }
}

/* Markdown file imports used by skills */
declare module '*.md' {
  const content: string;
  export default content;
}
