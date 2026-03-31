/**
 * Build-time macro constants.
 *
 * In the Anthropic build pipeline these are inlined by the Bun bundler
 * via `--define` flags. We declare them as ambient globals so TypeScript
 * is satisfied.
 */
declare const MACRO: {
  readonly VERSION: string;
  readonly VERSION_CHANGELOG: string;
  readonly BUILD_TIME: string;
  readonly PACKAGE_URL: string;
  readonly NATIVE_PACKAGE_URL: string;
  readonly FEEDBACK_CHANNEL: string;
  readonly ISSUES_EXPLAINER: string;
};
