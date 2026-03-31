/**
 * Stub for react/compiler-runtime.
 * The React Compiler uses this for memoization caches.
 */
export function c(size) {
  return new Array(size).fill(undefined);
}
