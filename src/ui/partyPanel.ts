// The Party tab in the bottom bar: companions travelling with the player.
//
// Like the Inventory tab, inputs bind straight to story storage, and the quick-pick buttons write
// to the same keys, so the fields update live. The tab is rebuilt only when companions are added,
// removed or reordered.

import { IDS, logError } from '../keys.ts'
import { gameStateBlock } from '../state/gameState.ts'
import {
  ATTITUDE_PRESETS,
  PARTY,
  STATUS_PRESETS,
  addMember,
  moveMember,
  partyLines,
  readParty,
  removeMember,
  type Member,
  type Party,
} from '../state/party.ts'
import { MUTED, debounced, forTemplate, previewSection } from './common.ts'

const schedulePreview = debounced(() => updatePartyPreview())

/** The explanation at the top of the tab in Text Adventure+. */
export const TEXT_ADVENTURE_PARTY_NOTE =
  'Companions speak and act for themselves; only your own character is protected. Untick "In party" for someone who is away: they stay listed but are not sent.'

export async function partyPanel(
  rebuild: () => Promise<void>,
  note = TEXT_ADVENTURE_PARTY_NOTE,
): Promise<UIExtensionScriptPanel & { id: string }> {
  const party = await readParty()
  updatePartyPreview(party).catch(logError)
  const edited = () => schedulePreview()
  return {
    type: 'scriptPanel',
    id: IDS.partyPanel,
    name: 'Party',
    iconId: 'users',
    content: [
      {
        type: 'checkboxInput',
        label: 'Tell the AI about my party',
        storageKey: `story:${PARTY.share}`,
        onChange: edited,
      },
      { type: 'text', text: note, style: MUTED },
      ...(party.members.length > 0
        ? party.members.map((member, index) => memberPart(member, index, party.members.length, rebuild, edited))
        : [{ type: 'text' as const, text: 'No companions yet.', style: MUTED }]),
      {
        type: 'button',
        text: 'Add companion',
        iconId: 'user-plus',
        disabledWhileCallbackRunning: true,
        callback: () => addMember().then(rebuild).catch(logError),
      },
      previewSection(PARTY.preview),
    ],
  }
}

function memberPart(member: Member, index: number, total: number, rebuild: () => Promise<void>, edited: () => void): UIPart {
  const key = (field: 'name' | 'role' | 'status' | 'attitude' | 'notes' | 'present') => PARTY.member(member.id, field)
  const presets = (field: 'status' | 'attitude', words: string[]): UIPart[] =>
    words.map((word) => ({
      type: 'button',
      text: word,
      callback: () =>
        api.v1.storyStorage
          .set(key(field), word)
          .then(edited)
          .catch(logError),
    }))
  return {
    type: 'box',
    id: `tap-member-${member.id}`,
    content: [
      {
        type: 'row',
        wrap: true,
        spacing: 'start',
        alignment: 'end',
        content: [
          { type: 'textInput', label: 'Name', placeholder: 'Name', storageKey: `story:${key('name')}`, onChange: edited, style: { width: '10em' } },
          {
            type: 'textInput',
            label: 'Who they are',
            placeholder: 'elf ranger, your guide',
            storageKey: `story:${key('role')}`,
            onChange: edited,
            style: { flex: '1 1 12em' },
          },
          { type: 'checkboxInput', label: 'In party', storageKey: `story:${key('present')}`, onChange: edited },
        ],
      },
      {
        type: 'row',
        wrap: true,
        spacing: 'start',
        alignment: 'end',
        content: [
          { type: 'textInput', label: 'Status', storageKey: `story:${key('status')}`, onChange: edited, style: { width: '12em' } },
          ...presets('status', STATUS_PRESETS),
        ],
      },
      {
        type: 'row',
        wrap: true,
        spacing: 'start',
        alignment: 'end',
        content: [
          { type: 'textInput', label: 'Attitude toward you', storageKey: `story:${key('attitude')}`, onChange: edited, style: { width: '12em' } },
          ...presets('attitude', ATTITUDE_PRESETS),
        ],
      },
      {
        type: 'textInput',
        label: 'Notes',
        placeholder: 'Personality, goals, secrets (optional)',
        storageKey: `story:${key('notes')}`,
        onChange: edited,
      },
      {
        type: 'row',
        spacing: 'start',
        content: [
          {
            type: 'button',
            text: 'Move up',
            iconId: 'arrow-up',
            disabled: index === 0,
            callback: () => moveMember(member.id, -1).then(rebuild).catch(logError),
          },
          {
            type: 'button',
            text: 'Move down',
            iconId: 'arrow-down',
            disabled: index === total - 1,
            callback: () => moveMember(member.id, 1).then(rebuild).catch(logError),
          },
          {
            type: 'button',
            text: 'Remove',
            iconId: 'trash-2',
            callback: () => removeMember(member.id).then(rebuild).catch(logError),
          },
        ],
      },
    ],
  }
}

export async function updatePartyPreview(party?: Party): Promise<void> {
  const current = party ?? (await readParty())
  const block = gameStateBlock(partyLines(current))
  const text = !current.share
    ? 'Nothing: sending the party is turned off above.'
    : (block ?? 'Nothing yet. Add a companion with a name, and they will be sent with every turn.')
  await api.v1.storyStorage.set(PARTY.preview, forTemplate(text))
}
