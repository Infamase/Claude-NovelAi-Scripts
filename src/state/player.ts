// The player character: who "you" are in the story. Kept in the story, one storage key per field,
// like the party and the inventory.

import { text } from './store.ts'

export type Player = {
  share: boolean
  name: string
  pronouns: string
  /** Who they are: race, class, age, role. */
  role: string
  appearance: string
  status: string
  abilities: string
  notes: string
}

type PlayerField = Exclude<keyof Player, 'share'>

export const PLAYER = {
  share: 'tap.player.share',
  /** What the AI sees, for the tab's preview. */
  preview: 'tap.player.preview',
  field: (field: PlayerField) => `tap.player.${field}`,
} as const

export const PRONOUN_PRESETS = ['he/him', 'she/her', 'they/them']

const FIELDS: PlayerField[] = ['name', 'pronouns', 'role', 'appearance', 'status', 'abilities', 'notes']

export async function initPlayer(): Promise<void> {
  const s = api.v1.storyStorage
  await s.setIfAbsent(PLAYER.share, true)
  for (const field of FIELDS) await s.setIfAbsent(PLAYER.field(field), field === 'status' ? 'Healthy' : '')
}

export async function readPlayer(): Promise<Player> {
  const s = api.v1.storyStorage
  const player = { share: (await s.get(PLAYER.share)) !== false } as Player
  for (const field of FIELDS) player[field] = text(await s.get(PLAYER.field(field))).trim()
  return player
}

/**
 * The player character as one line for the AI, or none if it isn't shared or nothing that
 * describes them is filled in (a status on its own isn't worth sending).
 */
export function playerLines(player: Player): string[] {
  if (!player.share) return []
  const { name, pronouns, role, appearance, status, abilities, notes } = player
  if (![name, role, appearance, abilities, notes].some((value) => value !== '')) return []

  const who = name ? (pronouns ? `${name} (${pronouns})` : name) : pronouns ? `pronouns ${pronouns}` : ''
  const head = [who, role].filter(Boolean).join(', ')
  const parts = [head ? `The protagonist ("you"): ${head}.` : 'The protagonist ("you").']
  if (appearance) parts.push(`Appearance: ${sentences(appearance)}`)
  if (status) parts.push(`Status: ${sentences(status)}`)
  if (abilities) parts.push(`Skills and abilities: ${sentences(abilities)}`)
  if (notes) parts.push(`Notes: ${sentences(notes)}`)
  return [parts.join(' ')]
}

/** Text as sentences: each line trimmed and ending in punctuation, joined with spaces. */
function sentences(value: string): string {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => (/[.!?…]$/.test(line) ? line : `${line}.`))
    .join(' ')
}
