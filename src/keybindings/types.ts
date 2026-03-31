/**
 * Stub: keybindings/types.ts — missing from source map extraction.
 */

export type KeybindingAction = string;
export type KeybindingContextName = string;

export interface ParsedKeystroke {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  [key: string]: unknown;
}
