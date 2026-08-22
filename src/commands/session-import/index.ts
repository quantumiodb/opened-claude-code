import type { Command } from '../../commands.js'

const sessionImport = {
  type: 'local-jsx',
  name: 'session-import',
  description:
    'Import a conversation transcript (.jsonl) as a new session and continue it',
  argumentHint: '<path-to-jsonl>',
  load: () => import('./sessionImport.js'),
} satisfies Command

export default sessionImport
