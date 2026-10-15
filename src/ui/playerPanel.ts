// The Player tab in the bottom bar: who "you" are in the story.
//
// Like the other tabs, inputs bind straight to story storage, and the quick-pick buttons write to
// the same keys, so the fields update live. The tab never needs rebuilding.

import { IDS, logError } from '../keys.ts'
import { gameStateBlock } from '../state/gameState.ts'
import { STATUS_PRESETS } from '../state/party.ts'
import { PLAYER, PRONOUN_PRESETS, playerLines, readPlayer, type Player } from '../state/player.ts'
import { MUTED, debounced, forTemplate, previewSection } from './common.ts'
import type { ScriptPanel } from './panelSet.ts'

const schedulePreview = debounced(() => updatePlayerPreview())

export async function playerPanel(): Promise<ScriptPanel> {
  updatePlayerPreview().catch(logError)
  const edited = () => schedulePreview()
  const key = (field: Parameters<typeof PLAYER.field>[0]) => `story:${PLAYER.field(field)}`
  const presets = (field: 'pronouns' | 'status', words: string[]): UIPart[] =>
    words.map((word) => ({
      type: 'button',
      text: word,
      callback: () =>
        api.v1.storyStorage
          .set(PLAYER.field(field), word)
          .then(edited)
          .catch(logError),
    }))
  const row = (content: UIPart[]): UIPart => ({ type: 'row', wrap: true, spacing: 'start', alignment: 'end', content })

  return {
    type: 'scriptPanel',
    id: IDS.playerPanel,
    name: 'Player',
    iconId: 'user',
    content: [
      {
        type: 'checkboxInput',
        label: 'Tell the AI about my character',
        storageKey: `story:${PLAYER.share}`,
        onChange: edited,
      },
      {
        type: 'text',
        text: 'Who "you" are in the story. Everything is optional; fill in what matters.',
        style: MUTED,
      },
      row([
        { type: 'textInput', label: 'Name', placeholder: 'Name', storageKey: key('name'), onChange: edited, style: { width: '10em' } },
        { type: 'textInput', label: 'Pronouns', storageKey: key('pronouns'), onChange: edited, style: { width: '8em' } },
        ...presets('pronouns', PRONOUN_PRESETS),
      ]),
      {
        type: 'textInput',
        label: 'Who you are',
        placeholder: 'human ranger, 24, exiled from the capital',
        storageKey: key('role'),
        onChange: edited,
      },
      {
        type: 'textInput',
        label: 'Appearance',
        placeholder: 'tall, scar over the left eye, travel-worn cloak',
        storageKey: key('appearance'),
        onChange: edited,
      },
      row([
        { type: 'textInput', label: 'Status', storageKey: key('status'), onChange: edited, style: { width: '12em' } },
        ...presets('status', STATUS_PRESETS),
      ]),
      {
        type: 'textInput',
        label: 'Skills and abilities',
        placeholder: 'tracking, archery, a little healing magic',
        storageKey: key('abilities'),
        onChange: edited,
      },
      {
        type: 'multilineTextInput',
        label: 'Notes',
        placeholder: 'Personality, backstory, goals, secrets',
        storageKey: key('notes'),
        onChange: edited,
      },
      previewSection(PLAYER.preview),
    ],
  }
}

export async function updatePlayerPreview(player?: Player): Promise<void> {
  const current = player ?? (await readPlayer())
  const block = gameStateBlock(playerLines(current))
  const text = !current.share
    ? 'Nothing: sending your character is turned off above.'
    : (block ?? 'Nothing yet. Fill in a name or a description, and it will be sent with every reply.')
  await api.v1.storyStorage.set(PLAYER.preview, forTemplate(text))
}
