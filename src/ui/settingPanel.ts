// The Setting tab in the bottom bar: the world, the current location and the time period, plus how
// the story differs from the world's canon and who is not in it.
//
// Inputs bind straight to story storage, so the fields update live. The tab never needs rebuilding.

import { IDS, logError } from '../keys.ts'
import { gameStateBlock } from '../state/gameState.ts'
import { SETTING, absentList, readSetting, settingLines, type Setting } from '../state/setting.ts'
import { MUTED, debounced, forTemplate, previewSection } from './common.ts'
import type { ScriptPanel } from './panelSet.ts'

const schedulePreview = debounced(() => updateSettingPreview())

export async function settingPanel(): Promise<ScriptPanel> {
  updateSettingPreview().catch(logError)
  const edited = () => schedulePreview()
  const key = (field: Parameters<typeof SETTING.field>[0]) => `story:${SETTING.field(field)}`

  return {
    type: 'scriptPanel',
    id: IDS.settingPanel,
    name: 'Setting',
    iconId: 'globe',
    content: [
      {
        type: 'checkboxInput',
        label: 'Tell the AI about the setting',
        storageKey: `story:${SETTING.share}`,
        onChange: edited,
      },
      {
        type: 'text',
        text: 'Where and when the story takes place. Update the location as you travel.',
        style: MUTED,
      },
      {
        type: 'textInput',
        label: 'World',
        placeholder: 'the Mass Effect universe',
        storageKey: key('world'),
        onChange: edited,
      },
      {
        type: 'textInput',
        label: 'Current location',
        placeholder: 'Illium, the Nos Astra trading floor',
        storageKey: key('location'),
        onChange: edited,
      },
      {
        type: 'textInput',
        label: 'Time period',
        placeholder: '2186, during the events of Mass Effect 3',
        storageKey: key('time'),
        onChange: edited,
      },
      {
        type: 'checkboxInput',
        label: "Keep to the world's canon",
        storageKey: `story:${SETTING.canon}`,
        onChange: edited,
      },
      {
        type: 'text',
        text: 'For a world from a book, game, film or show: the AI keeps to its lore, history, technology and characters, except for the changes below.',
        style: MUTED,
      },
      {
        type: 'multilineTextInput',
        label: 'Changes from canon',
        placeholder: 'Naruto Uzumaki died as a baby in the Nine-Tails attack. Team 7 is Sasuke, Sakura and Sai, under Kakashi.',
        storageKey: key('changes'),
        onChange: edited,
      },
      {
        type: 'text',
        text: "Say what happened instead, not only what didn't: the AI fills any gap with canon. If a character is missing, say who took their place.",
        style: MUTED,
      },
      {
        type: 'multilineTextInput',
        label: 'Not in this story',
        placeholder: 'One per line, with other names after commas:\nNaruto Uzumaki, Naruto, the Nine-Tails jinchuriki',
        storageKey: key('absent'),
        onChange: edited,
      },
      {
        type: 'checkboxInput',
        label: 'Cut replies that mention them',
        storageKey: `story:${SETTING.cutAbsent}`,
        onChange: edited,
      },
      {
        type: 'text',
        text: 'A reply is cut before the first sentence that names anyone on the list, even in dialogue, and the AI is asked again if nothing is left. Names match as typed, and a first-and-last name also counts by the first name alone.',
        style: MUTED,
      },
      {
        type: 'multilineTextInput',
        label: 'Notes',
        placeholder: 'Tone, rules of the world, what has happened so far',
        storageKey: key('notes'),
        onChange: edited,
      },
      previewSection(SETTING.preview),
    ],
  }
}

export async function updateSettingPreview(setting?: Setting): Promise<void> {
  const current = setting ?? (await readSetting())
  const block = gameStateBlock(settingLines(current))
  const watched = current.cutAbsent ? absentList(current).flatMap((a) => a.variants) : []
  const text = !current.share
    ? 'Nothing: sending the setting is turned off above.'
    : block
      ? watched.length > 0
        ? `${block}\n\nReplies are cut at any mention of: ${watched.join(', ')}.`
        : block
      : 'Nothing yet. Fill in the world, location or time, and it will be sent with every reply.'
  await api.v1.storyStorage.set(SETTING.preview, forTemplate(text))
}
