/**
 * Stub: sdk/runtimeTypes.ts — missing from source map extraction.
 * Runtime types for the SDK layer.
 */

export type EffortLevel = 'low' | 'medium' | 'high' | 'auto';
export type AnyZodRawShape = Record<string, any>;
export type InferShape<T> = T;

export interface Options {
  [key: string]: unknown;
}

export interface InternalOptions extends Options {
  [key: string]: unknown;
}

export interface Query {
  [key: string]: unknown;
}

export interface InternalQuery extends Query {
  [key: string]: unknown;
}

export interface SDKSession {
  [key: string]: unknown;
}

export interface SDKSessionOptions {
  [key: string]: unknown;
}

export interface SessionMessage {
  [key: string]: unknown;
}

export interface SessionMutationOptions {
  [key: string]: unknown;
}

export interface ForkSessionOptions {
  [key: string]: unknown;
}

export interface ForkSessionResult {
  [key: string]: unknown;
}

export interface GetSessionInfoOptions {
  [key: string]: unknown;
}

export interface GetSessionMessagesOptions {
  [key: string]: unknown;
}

export interface ListSessionsOptions {
  [key: string]: unknown;
}

export interface McpSdkServerConfigWithInstance {
  [key: string]: unknown;
}

export interface SdkMcpToolDefinition {
  [key: string]: unknown;
}
