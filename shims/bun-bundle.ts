/**
 * Runtime implementation of `bun:bundle` for development.
 *
 * In production, the Bun bundler resolves `feature()` calls at compile
 * time. This shim allows the code to run without the bundler by
 * reading an optional FEATURES env-var (comma-separated flag names)
 * or defaulting every flag to false.
 *
 * Usage:
 *   FEATURES=BRIDGE_MODE,VOICE_MODE bun run src/entrypoints/cli.tsx
 */

const enabledFeatures = new Set(
  (process.env.FEATURES ?? '').split(',').filter(Boolean),
);

export function feature(name: string): boolean {
  return enabledFeatures.has(name);
}
