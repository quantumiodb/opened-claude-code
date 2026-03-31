// Re-export from the pure TypeScript port in src/native-ts/color-diff/
// This replaces the Rust NAPI module with a fully working JS implementation.
export { ColorDiff, ColorFile, getSyntaxTheme } from '../../src/native-ts/color-diff/index.ts'
