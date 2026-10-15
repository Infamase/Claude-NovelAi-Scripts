// The story's setting: the world, where the story is now, and when, plus how it differs from the
// world's canon and who is not in it. Kept in the story, one storage key per field, like the other
// tabs.

import { parseAbsent, type Absent } from './absent.ts'
import { text } from './store.ts'

export type Setting = {
  share: boolean
  /** The world or universe, such as an original world or one from a book, game or film. */
  world: string
  location: string
  /** The time period or point in the world's history. */
  time: string
  /** Keep to the world's established canon. */
  canon: boolean
  /** What is different from canon, and what happened instead. */
  changes: string
  /** Who is not in this story, one per line, as typed. */
  absent: string
  /** Cut replies that mention anyone on the absent list. */
  cutAbsent: boolean
  notes: string
}

type TextField = 'world' | 'location' | 'time' | 'changes' | 'absent' | 'notes'

export const SETTING = {
  share: 'tap.setting.share',
  canon: 'tap.setting.canon',
  cutAbsent: 'tap.setting.cutAbsent',
  /** What the AI sees, for the tab's preview. */
  preview: 'tap.setting.preview',
  field: (field: TextField) => `tap.setting.${field}`,
} as const

const TEXT_FIELDS: TextField[] = ['world', 'location', 'time', 'changes', 'absent', 'notes']

export async function initSetting(): Promise<void> {
  const s = api.v1.storyStorage
  await s.setIfAbsent(SETTING.share, true)
  await s.setIfAbsent(SETTING.canon, true)
  await s.setIfAbsent(SETTING.cutAbsent, true)
  for (const field of TEXT_FIELDS) await s.setIfAbsent(SETTING.field(field), '')
}

export async function readSetting(): Promise<Setting> {
  const s = api.v1.storyStorage
  const field = async (name: TextField) => text(await s.get(SETTING.field(name))).trim()
  return {
    share: (await s.get(SETTING.share)) !== false,
    world: await field('world'),
    location: await field('location'),
    time: await field('time'),
    canon: (await s.get(SETTING.canon)) !== false,
    changes: await field('changes'),
    absent: await field('absent'),
    cutAbsent: (await s.get(SETTING.cutAbsent)) !== false,
    notes: await field('notes'),
  }
}

/** Who is not in this story, or no one if the setting isn't shared. */
export function absentList(setting: Setting): Absent[] {
  return setting.share ? parseAbsent(setting.absent) : []
}

/**
 * The setting for the AI, or nothing if it isn't shared or nothing is filled in: one line for the
 * world, place and time, then the changes from canon and who is not in the story, each on its own
 * line so they stand out.
 */
export function settingLines(setting: Setting): string[] {
  if (!setting.share) return []
  const { world, location, time, canon, changes, notes } = setting
  const absent = absentList(setting)
  const lines: string[] = []

  const parts: string[] = []
  if (world) parts.push(`Setting: ${sentences(world)}`)
  if (location) parts.push(`Current location: ${sentences(location)}`)
  if (time) parts.push(`Time: ${sentences(time)}`)
  if (world && canon) {
    const except =
      changes || absent.length > 0
        ? ', except for the changes listed here, which override it'
        : notes
          ? ', except where the notes say otherwise'
          : ''
    parts.push(`Keep to the established canon of this world (its lore, history, technology and characters)${except}.`)
  }
  if (notes) parts.push(`Notes: ${sentences(notes)}`)
  if (parts.length > 0) lines.push(parts.join(' '))

  if (changes) {
    lines.push(
      `Changes from canon: ${sentences(changes)} Everything that follows from these changes is different too, and the characters know only the world as it is now.`,
    )
  }
  if (absent.length > 0) {
    lines.push(
      `Not in this story: ${absent.map((a) => a.name).join('; ')}. Leave ${absent.length === 1 ? 'them' : 'all of them'} out entirely: they never appear, speak or act, and no one mentions them.`,
    )
  }
  return lines
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
