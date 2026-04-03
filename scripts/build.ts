/**
 * Build script that enables feature flags at compile time.
 *
 * Bun's compiler resolves `feature()` from `bun:bundle` at build time.
 * There is no public API to set feature flags externally, so we
 * pre-process the source to replace selected feature gates with `true`
 * before bundling, then restore the originals afterward.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

// Features to enable at build time
const ENABLED_FEATURES = [
  'TRANSCRIPT_CLASSIFIER',
  'AGENT_TRIGGERS',
  'BUDDY',
  'MCP_RICH_OUTPUT',
  'MCP_SKILLS',
  'HISTORY_PICKER',
  'TREE_SITTER_BASH',
]

const SRC_DIR = join(import.meta.dir, '..', 'src')
const modified: Array<{ path: string; original: string }> = []

function walkDir(dir: string, cb: (path: string) => void) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(full, cb)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      cb(full)
    }
  }
}

// Build regex to match feature('FLAG') for each enabled feature
const featurePattern = new RegExp(
  ENABLED_FEATURES.map(f => `feature\\(['"]${f}['"]\\)`).join('|'),
  'g',
)

// Phase 1: Replace feature gates with true
walkDir(SRC_DIR, (filePath) => {
  const content = readFileSync(filePath, 'utf-8')
  if (!featurePattern.test(content)) return
  featurePattern.lastIndex = 0
  const replaced = content.replace(featurePattern, 'true')
  if (replaced !== content) {
    modified.push({ path: filePath, original: content })
    writeFileSync(filePath, replaced)
  }
})

console.log(`Enabled features: ${ENABLED_FEATURES.join(', ')} (patched ${modified.length} files)`)

// Phase 2: Run bun build
try {
  execSync(
    `bun build src/entrypoints/cli.tsx --outdir=dist --target=bun --sourcemap=external ` +
    `--define 'MACRO.VERSION="2.1.87"' ` +
    `--define 'MACRO.BUILD_TIME="2026-03-10"' ` +
    `--define 'MACRO.PACKAGE_URL="@anthropic-ai/claude-code"' ` +
    `--define 'MACRO.NATIVE_PACKAGE_URL=""' ` +
    `--define 'MACRO.FEEDBACK_CHANNEL=""' ` +
    `--define 'MACRO.ISSUES_EXPLAINER=""' ` +
    `--define 'MACRO.VERSION_CHANGELOG=""'`,
    { stdio: 'inherit', cwd: join(import.meta.dir, '..') },
  )
} finally {
  // Phase 3: Restore originals (always, even on build failure)
  for (const { path, original } of modified) {
    writeFileSync(path, original)
  }
  console.log(`Restored ${modified.length} patched files`)
}
