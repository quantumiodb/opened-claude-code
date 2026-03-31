/**
 * Shim for the build-time `bun:bundle` module.
 *
 * In the real Anthropic build, `feature()` is resolved at compile time
 * by the Bun bundler (dead-code elimination). Here we declare the type
 * so the code compiles, and provide a runtime implementation in
 * `bun-bundle.ts` that defaults every flag to `false`.
 */
declare module 'bun:bundle' {
  /**
   * Build-time feature gate.  Returns `true` when the named feature
   * is enabled, `false` otherwise.  The Bun bundler inlines the
   * boolean literal and tree-shakes the dead branch.
   */
  export function feature(name: string): boolean;
}
