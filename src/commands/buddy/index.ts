import type { Command } from '../../commands.js'

const buddy = {
  type: 'local',
  name: 'buddy',
  description: 'Meet your companion',
  supportsNonInteractive: false,
  argumentHint: '[pet|mute|unmute|reset]',
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
