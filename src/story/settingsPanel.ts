// Story Adventure+'s right-sidebar panel: the per-story switch, the point-of-view and writing-guide
// settings, and a report on the last reply.

import { logError } from '../keys.ts'
import { KEYS, STORY_IDS } from './keys.ts'
import { setStoryPanelsVisible } from './panels.ts'
import { DEFAULT_GUIDE } from './prompt.ts'

const MUTED = { opacity: 0.7, fontSize: '0.85em' }

export async function registerSettingsPanel(): Promise<void> {
  await api.v1.ui.register([
    {
      type: 'sidebarPanel',
      id: STORY_IDS.settingsPanel,
      name: 'Story Adventure+',
      iconId: 'bookOpen',
      content: [
        { type: 'text', markdown: true, text: `**Story Adventure+** v${api.v1.script.version}` },
        {
          type: 'checkboxInput',
          label: 'Enable for this story',
          storageKey: `story:${KEYS.enabled}`,
          onChange: (on) => {
            setStoryPanelsVisible(on).catch(logError)
          },
        },
        {
          type: 'text',
          text: 'When enabled, Player, Party and Inventory tabs appear above the bottom controls, and the settings below apply to this story.',
          style: MUTED,
        },
        { type: 'checkboxInput', label: 'Second person, present tense', storageKey: KEYS.pov },
        {
          type: 'text',
          text: 'Tells the AI to write with you as the protagonist ("you step inside"), in the present tense.',
          style: MUTED,
        },
        { type: 'checkboxInput', label: 'Catch slips', storageKey: KEYS.check },
        {
          type: 'text',
          text: 'Checks each reply and cuts it where it slips into past tense, first person ("I") or your character\'s name. If nothing is left, it asks the AI again, up to twice. Sentences that might slip wait until the reply is finished.',
          style: MUTED,
        },
        { type: 'checkboxInput', label: 'Use the writing guide', storageKey: KEYS.useGuide },
        {
          type: 'collapsibleSection',
          title: 'Writing guide',
          iconId: 'feather',
          initialCollapsed: true,
          content: [
            {
              type: 'text',
              text: 'Added to the system prompt with every reply: how to write well, and the stock phrases to avoid. Edit it to taste.',
              style: MUTED,
            },
            { type: 'multilineTextInput', storageKey: KEYS.guide, style: { minHeight: '16em' } },
            {
              type: 'button',
              text: 'Reset to default',
              iconId: 'rotate-ccw',
              callback: () => resetGuide().catch(logError),
            },
          ],
        },
        {
          type: 'collapsibleSection',
          title: 'Last reply',
          iconId: 'activity',
          content: [
            {
              type: 'text',
              text: `{{story:${KEYS.lastReplyStatus}}}`,
              style: { whiteSpace: 'pre-wrap', fontSize: '0.9em' },
            },
            {
              type: 'button',
              text: 'Copy details',
              iconId: 'copy',
              callback: () => copyDetails().catch(logError),
            },
            {
              type: 'text',
              text: 'If a reply was cut wrongly, or a slip got through, copy its details and send them to Claude.',
              style: MUTED,
            },
          ],
        },
      ],
    },
  ])
}

/** Stores the default guide unless the player has edited theirs, so new defaults reach everyone else. */
export async function initGuide(): Promise<void> {
  const s = api.v1.storage
  const guide = await s.get(KEYS.guide)
  const lastDefault = await s.get(KEYS.guideDefault)
  if (guide === undefined || (guide === lastDefault && lastDefault !== DEFAULT_GUIDE)) await resetGuide()
}

async function resetGuide(): Promise<void> {
  await api.v1.storage.set(KEYS.guide, DEFAULT_GUIDE)
  await api.v1.storage.set(KEYS.guideDefault, DEFAULT_GUIDE)
}

async function copyDetails(): Promise<void> {
  const details = await api.v1.storyStorage.get(KEYS.lastReplyDetails)
  if (!details) {
    await api.v1.ui.toast('No reply has been checked in this story yet.', { type: 'info' })
    return
  }
  const granted = await api.v1.permissions.request(
    'clipboardWrite',
    "Story Adventure+ needs clipboard access to copy the last reply's details.",
  )
  if (!granted) return
  await api.v1.clipboard.writeText(String(details))
  await api.v1.ui.toast('Details copied.', { type: 'success' })
}
