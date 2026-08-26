/**
 * Packages the standalone binary at dist/claude into an installable npm tarball.
 *
 * Produces dist-npm/ (staging dir) and dist-npm/*.tgz. Does NOT publish —
 * run `npm publish` against your own registry yourself.
 *
 *   bun run pack:npm
 *   npm install -g ./dist-npm/<name>-<version>.tgz
 */

import { execSync } from 'child_process'
import { copyFileSync, mkdirSync, rmSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')
const BINARY = join(ROOT, 'dist', 'claude')
const STAGE = join(ROOT, 'dist-npm')

// Package identity. Deliberately NOT @anthropic-ai/claude-code — that name
// belongs to the official upstream package. Must match PACKAGE_URL in
// scripts/build.ts, which is what the binary's auto-updater calls `npm view` on.
const NAME = process.env.NPM_PACKAGE_NAME ?? 'opened-claude-code'
const VERSION = process.env.NPM_PACKAGE_VERSION ?? '2.1.87'
const REPO_URL = 'https://github.com/quantumiodb/opened-claude-code'

try {
  statSync(BINARY)
} catch {
  console.error(`Missing ${BINARY} — run \`bun run build:binary\` first.`)
  process.exit(1)
}

rmSync(STAGE, { recursive: true, force: true })
mkdirSync(join(STAGE, 'bin'), { recursive: true })

copyFileSync(BINARY, join(STAGE, 'bin', 'claude'))
execSync(`chmod +x ${join(STAGE, 'bin', 'claude')}`)

writeFileSync(
  join(STAGE, 'package.json'),
  JSON.stringify(
    {
      name: NAME,
      version: VERSION,
      description:
        'Standalone build of the opened-claude-code source snapshot (Linux x64).',
      bin: { claude: 'bin/claude' },
      files: ['bin/claude', 'README.md'],
      homepage: REPO_URL,
      repository: { type: 'git', url: `git+${REPO_URL}.git` },
      bugs: { url: `${REPO_URL}/issues` },
      os: ['linux'],
      cpu: ['x64'],
      // Scoped/restricted by default so a stray `npm publish` cannot go public.
      publishConfig: { access: 'restricted' },
    },
    null,
    2,
  ) + '\n',
)

writeFileSync(
  join(STAGE, 'README.md'),
  `# ${NAME}

Standalone Bun-compiled build of the \`opened-claude-code\` source snapshot.

- Platform: Linux x86-64 only.
- Entry point: \`claude\`.

\`\`\`bash
npm install -g ${NAME}
claude --version
\`\`\`

This is a reconstruction of Anthropic's Claude Code CLI from an exposed source
map. It is not an official Anthropic release and is not affiliated with or
supported by Anthropic. Do not redistribute publicly.
`,
)

execSync(`npm pack --pack-destination .`, { cwd: STAGE, stdio: 'inherit' })

const tarball = join(STAGE, `${NAME}-${VERSION}.tgz`)
const mb = (statSync(tarball).size / 1024 / 1024).toFixed(1)
console.log(`\nTarball: ${tarball} (${mb} MB compressed)`)
console.log(`Install locally: npm install -g ${tarball}`)
