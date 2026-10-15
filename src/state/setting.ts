// The story's setting: the world, where the story is now, and when. Kept in the story, one storage
// key per field, like the other tabs.

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
  notes: string
}

type TextField = 'world' | 'location' | 'time' | 'notes'

export const SETTING = {
  share: 'tap.setting.share',
  canon: 'tap.setting.canon',
  /** What the AI sees, for the tab's preview. */
  preview: 'tap.setting.preview',
  field: (field: TextField) => `tap.setting.${field}`,
} as const

const TEXT_FIELDS: TextField[] = ['world', 'location', 'time', 'notes']

export async function initSetting(): Promise<void> {
  const s = api.v1.storyStorage
  await s.setIfAbsent(SETTING.share, true)
  await s.setIfAbsent(SETTING.canon, true)
  for (const field of TEXT_FIELDS) await s.setIfAbsent(SETTING.field(field), '')
}

export async function readSetting(): Promise<Setting> {
  const s = api.v1.storyStorage
  return {
    share: (await s.get(SETTING.share)) !== false,
    world: text(await s.get(SETTING.field('world'))).trim(),
    location: text(await s.get(SETTING.field('location'))).trim(),
    time: text(await s.get(SETTING.field('time'))).trim(),
    canon: (await s.get(SETTING.canon)) !== false,
    notes: text(await s.get(SETTING.field('notes'))).trim(),
  }
}

/** The setting as one line for the AI, or none if it isn't shared or nothing is filled in. */
export function settingLines(setting: Setting): string[] {
  if (!setting.share) return []
  const { world, location, time, canon, notes } = setting
  if (![world, location, time, notes].some((value) => value !== '')) return []

  const parts: string[] = []
  if (world) parts.push(`Setting: ${sentences(world)}`)
  if (location) parts.push(`Current location: ${sentences(location)}`)
  if (time) parts.push(`Time: ${sentences(time)}`)
  if (world && canon) {
    parts.push(
      `Keep to the established canon of this world (its lore, history, technology and characters)${notes ? ', except where the notes say otherwise' : ''}.`,
    )
  }
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
