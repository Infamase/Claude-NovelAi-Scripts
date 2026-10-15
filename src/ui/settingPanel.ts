// The Setting tab in the bottom bar: the world, the current location and the time period.
//
// Inputs bind straight to story storage, so the fields update live. The tab never needs rebuilding.

import { IDS, logError } from '../keys.ts'
import { gameStateBlock } from '../state/gameState.ts'
import { SETTING, readSetting, settingLines, type Setting } from '../state/setting.ts'
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
        text: 'For a world from a book, game, film or show: the AI keeps to its lore, history, technology and characters, except where your notes say otherwise.',
        style: MUTED,
      },
      {
        type: 'multilineTextInput',
        label: 'Notes',
        placeholder: 'Tone, rules of the world, what has happened so far, and anything that differs from canon',
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
  const text = !current.share
    ? 'Nothing: sending the setting is turned off above.'
    : (block ?? 'Nothing yet. Fill in the world, location or time, and it will be sent with every reply.')
  await api.v1.storyStorage.set(SETTING.preview, forTemplate(text))
}
