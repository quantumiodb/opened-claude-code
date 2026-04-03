import {
  companionUserId,
  getCompanion,
  roll,
} from '../../buddy/companion.js'
import { renderFace, renderSprite } from '../../buddy/sprites.js'
import { RARITY_STARS, STAT_NAMES } from '../../buddy/types.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getSmallFastModel } from '../../utils/model/model.js'
import { sideQuery } from '../../utils/sideQuery.js'

async function hatchSoul(
  bones: ReturnType<typeof roll>['bones'],
  signal: AbortSignal,
): Promise<{ name: string; personality: string }> {
  const peakStat = STAT_NAMES.reduce((a, b) =>
    bones.stats[a] >= bones.stats[b] ? a : b,
  )
  const model = getSmallFastModel()
  try {
    const resp = await sideQuery({
      model,
      querySource: 'buddy_hatch',
      max_tokens: 120,
      signal,
      messages: [
        {
          role: 'user',
          content: `Name a ${bones.rarity} ${bones.species} companion whose defining trait is ${peakStat.toLowerCase()}. Reply ONLY with JSON: {"name":"...","personality":"one short sentence"}`,
        },
      ],
    })
    const text =
      resp.content.find((b): b is { type: 'text'; text: string } => b.type === 'text')
        ?.text ?? ''
    const match = text.match(/\{[\s\S]*?\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (
        typeof parsed.name === 'string' &&
        typeof parsed.personality === 'string'
      ) {
        return {
          name: parsed.name.trim(),
          personality: parsed.personality.trim(),
        }
      }
    }
  } catch {
    // fall through to default
  }
  // deterministic fallback
  const seed = Object.values(bones.stats).reduce((a, b) => a + b, 0)
  return {
    name: `${bones.species.charAt(0).toUpperCase()}${bones.species.slice(1)}-${seed % 9999}`,
    personality: `A curious little ${bones.species} with remarkable ${peakStat.toLowerCase()}.`,
  }
}

function buildCard(companion: ReturnType<typeof getCompanion>): string {
  if (!companion) return ''

  const sprite = renderSprite(companion)
  const face = renderFace(companion)
  const stars = RARITY_STARS[companion.rarity]
  const shinyMark = companion.shiny ? ' ✦' : ''
  const hatNote =
    companion.hat !== 'none' ? `  hat: ${companion.hat}` : ''

  const statLines = STAT_NAMES.map(name => {
    const val = companion.stats[name]
    const filled = Math.round(val / 10)
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)
    return `  ${name.padEnd(10)} ${bar} ${String(val).padStart(3)}`
  })

  const hatchDate = new Date(companion.hatchedAt).toLocaleDateString()

  return [
    ...sprite,
    '',
    `  ${face}  ${companion.name}  ${stars}${shinyMark} ${companion.rarity.toUpperCase()}`,
    `  "${companion.personality}"`,
    '',
    ...statLines,
    '',
    hatNote,
    `  hatched: ${hatchDate}`,
    '',
    'subcommands: /buddy pet · /buddy mute · /buddy unmute · /buddy reset',
  ]
    .filter(l => l !== undefined)
    .join('\n')
}

export const call: LocalCommandCall = async (args, context) => {
  const sub = args.trim().toLowerCase()

  // ── pet ──────────────────────────────────────────────────────────────────
  if (sub === 'pet') {
    const companion = getCompanion()
    if (!companion) {
      return { type: 'text', value: 'No companion yet — run /buddy to hatch one.' }
    }
    context.setAppState(prev => ({ ...prev, companionPetAt: Date.now() }))
    return {
      type: 'text',
      value: `You pet ${companion.name}! ♥`,
    }
  }

  // ── mute / unmute ─────────────────────────────────────────────────────────
  if (sub === 'mute') {
    saveGlobalConfig(c => ({ ...c, companionMuted: true }))
    return {
      type: 'text',
      value: 'Companion muted. Run /buddy unmute to re-enable.',
    }
  }
  if (sub === 'unmute') {
    saveGlobalConfig(c => ({ ...c, companionMuted: false }))
    return { type: 'text', value: 'Companion unmuted!' }
  }

  // ── reset ─────────────────────────────────────────────────────────────────
  if (sub === 'reset') {
    const name = getGlobalConfig().companion?.name
    saveGlobalConfig(({ companion: _drop, ...rest }) => rest as typeof rest)
    return {
      type: 'text',
      value: name
        ? `Farewell, ${name}. Run /buddy to hatch a new companion.`
        : 'No companion to reset.',
    }
  }

  // ── show / hatch ──────────────────────────────────────────────────────────
  if (!getGlobalConfig().companion) {
    const userId = companionUserId()
    const { bones } = roll(userId)
    const soul = await hatchSoul(bones, context.abortController.signal)
    saveGlobalConfig(c => ({
      ...c,
      companion: { ...soul, hatchedAt: Date.now() },
    }))
  }

  const companion = getCompanion()
  return { type: 'text', value: buildCard(companion) }
}
