/**
 * Stub: sdk/controlTypes.ts — missing from source map extraction.
 * Types inferred from controlSchemas.ts.
 */

import { z } from 'zod/v4';

type InferSchema<T> = T extends (...args: any[]) => infer R
  ? R extends z.ZodType<infer O> ? O : never
  : T extends z.ZodType<infer O> ? O : never;

export type SDKControlRequest = InferSchema<ReturnType<typeof import('./controlSchemas.js').SDKControlRequestSchema>>;
export type SDKControlResponse = any;
export type SDKControlPermissionRequest = any;
export type SDKControlCancelRequest = any;
export type SDKControlRequestInner = any;
export type StdoutMessage = any;
export type StdinMessage = any;
export type SDKControlInitializeRequest = InferSchema<ReturnType<typeof import('./controlSchemas.js').SDKControlInitializeRequestSchema>>;
export type SDKControlInitializeResponse = any;
export type SDKControlMcpSetServersResponse = any;
export type SDKControlReloadPluginsResponse = any;
export type SDKPartialAssistantMessage = any;
