/**
 * Stub: @anthropic-ai/sandbox-runtime
 */
const noop = () => {};
const noopAsync = async () => {};
const returnEmpty = () => ({});
const returnNull = () => null;
const returnFalse = () => false;

export class SandboxManager {
  constructor() {}
  async start() {}
  async stop() {}

  // Static methods used by sandbox-adapter.ts
  static isSupportedPlatform() { return false; }
  static checkDependencies() { return { satisfied: false, missing: ['sandbox-runtime-stub'] }; }
  static wrapWithSandbox(cmd, args, opts) { return { cmd, args, opts }; }
  static async initialize() {}
  static updateConfig() {}
  static async reset() {}
  static getFsReadConfig = returnEmpty;
  static getFsWriteConfig = returnEmpty;
  static getNetworkRestrictionConfig = returnEmpty;
  static getIgnoreViolations = returnEmpty;
  static getAllowUnixSockets = returnFalse;
  static getAllowLocalBinding = returnFalse;
  static getEnableWeakerNestedSandbox = returnFalse;
  static getProxyPort = returnNull;
  static getSocksProxyPort = returnNull;
  static getLinuxHttpSocketPath = returnNull;
  static getLinuxSocksSocketPath = returnNull;
  static waitForNetworkInitialization = noopAsync;
  static getSandboxViolationStore() { return new SandboxViolationStore(); }
  static annotateStderrWithSandboxFailures = noop;
  static cleanupAfterCommand = noopAsync;
}

export const SandboxRuntimeConfigSchema = {};

export class SandboxViolationStore {
  constructor() {
    this.violations = [];
  }
  add() {}
  getAll() { return []; }
}

export function createSandbox() { return new SandboxManager(); }
export function startSandbox() { return new SandboxManager(); }
