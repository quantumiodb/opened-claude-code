/**
 * Shim for react/compiler-runtime.
 *
 * The React Compiler emits imports to this module for memoization.
 * Since the compiled output references it, we need a type stub.
 */
declare module 'react/compiler-runtime' {
  export function c(size: number): any[];
}
