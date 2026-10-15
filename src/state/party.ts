// The player's party: companions with who they are, their condition, their attitude toward the
// player, and notes. Kept in the story, one storage key per field, like the inventory.

import { idList, moveInList, text } from './store.ts'

export type Member = {
  id: string
  name: string
  /** Who they are: race, class, role. */
  role: string
  status: string
  attitude: string
  notes: string
  /** Travelling with the player now. Members left behind are kept but not sent to the AI. */
  present: boolean
}

export type Party = { share: boolean; members: Member[] }

type MemberField = 'name' | 'role' | 'status' | 'attitude' | 'notes' | 'present'

export const PARTY = {
  share: 'tap.party.share',
  /** The member ids, in the order shown. */
  members: 'tap.party.members',
  /** What the AI sees, for the tab's preview. */
  preview: 'tap.party.preview',
  member: (id: string, field: MemberField) => `tap.party.member.${id}.${field}`,
} as const

/** Quick picks offered next to the status and attitude fields. */
export const STATUS_PRESETS = ['Healthy', 'Wounded', 'Exhausted', 'Unconscious']
export const ATTITUDE_PRESETS = ['Hostile', 'Wary', 'Neutral', 'Friendly', 'Loyal']

const MEMBER_FIELDS: MemberField[] = ['name', 'role', 'status', 'attitude', 'notes', 'present']

const NEW_MEMBER: Record<MemberField, string | boolean> = {
  name: '',
  role: '',
  status: 'Healthy',
  attitude: 'Neutral',
  notes: '',
  present: true,
}

export async function initParty(): Promise<void> {
  await api.v1.storyStorage.setIfAbsent(PARTY.share, true)
  await api.v1.storyStorage.setIfAbsent(PARTY.members, [])
}

export async function readParty(): Promise<Party> {
  const s = api.v1.storyStorage
  const members = await Promise.all(
    (await idList(PARTY.members)).map(async (id) => ({
      id,
      name: text(await s.get(PARTY.member(id, 'name'))),
      role: text(await s.get(PARTY.member(id, 'role'))),
      status: text(await s.get(PARTY.member(id, 'status'))),
      attitude: text(await s.get(PARTY.member(id, 'attitude'))),
      notes: text(await s.get(PARTY.member(id, 'notes'))),
      present: (await s.get(PARTY.member(id, 'present'))) !== false,
    })),
  )
  return { share: (await s.get(PARTY.share)) !== false, members }
}

export async function addMember(): Promise<string> {
  const id = api.v1.uuid()
  const s = api.v1.storyStorage
  for (const field of MEMBER_FIELDS) await s.set(PARTY.member(id, field), NEW_MEMBER[field])
  await s.set(PARTY.members, [...(await idList(PARTY.members)), id])
  return id
}

export async function removeMember(id: string): Promise<void> {
  const s = api.v1.storyStorage
  await s.set(PARTY.members, (await idList(PARTY.members)).filter((other) => other !== id))
  for (const field of MEMBER_FIELDS) await s.remove(PARTY.member(id, field))
}

export function moveMember(id: string, delta: -1 | 1): Promise<void> {
  return moveInList(PARTY.members, id, delta)
}

/** One line per companion travelling with the player, or none if the party isn't shared. */
export function partyLines(party: Party): string[] {
  if (!party.share) return []
  return party.members
    .filter((member) => member.present && member.name.trim() !== '')
    .map((member) => {
      const role = member.role.trim()
      const parts = [`Companion: ${member.name.trim()}${role ? `, ${role}` : ''}.`]
      if (member.status.trim()) parts.push(`Status: ${sentence(member.status)}`)
      if (member.attitude.trim()) parts.push(`Attitude toward you: ${sentence(member.attitude)}`)
      const notes = member.notes.split('\n').filter((line) => line.trim() !== '').map(sentence)
      if (notes.length > 0) parts.push(`Notes: ${notes.join(' ')}`)
      return parts.join(' ')
    })
}

/** Text as a sentence: trimmed, ending in a full stop unless it already ends in punctuation. */
function sentence(value: string): string {
  const trimmed = value.trim()
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`
}
