// The script's right-sidebar panel: the per-story switch, the turn guard's settings, and a report
// on the last turn.

import { IDS, KEYS, logError } from '../keys.ts'
import { setStoryPanelsVisible } from './storyPanels.ts'

export async function registerSettingsPanel(): Promise<void> {
  await api.v1.ui.register([
    {
      type: 'sidebarPanel',
      id: IDS.settingsPanel,
      name: 'Text Adventure+',
      iconId: 'compass',
      content: [
        {
          type: 'text',
          markdown: true,
          text: `**Text Adventure+** v${api.v1.script.version}`,
        },
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
          text: 'When enabled, the AI stops at your turn, and Party and Inventory tabs appear above the bottom controls.',
          style: { opacity: 0.7 },
        },
        {
          type: 'checkboxInput',
          label: 'Referee: double-check each reply with a quick AI call',
          storageKey: KEYS.referee,
        },
        {
          type: 'checkboxInput',
          label: 'Strict: no physical reactions from your character either',
          storageKey: KEYS.strict,
        },
        {
          type: 'collapsibleSection',
          title: 'Last turn',
          iconId: 'activity',
          content: [
            {
              type: 'text',
              text: `{{story:${KEYS.lastTurnStatus}}}`,
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
              text: 'If a turn was cut wrongly, or should have been cut, copy its details and send them to Claude.',
              style: { opacity: 0.7, fontSize: '0.85em' },
            },
          ],
        },
      ],
    },
  ])
}

async function copyDetails(): Promise<void> {
  const details = await api.v1.storyStorage.get(KEYS.lastTurnDetails)
  if (!details) {
    await api.v1.ui.toast('No turn has been checked in this story yet.', { type: 'info' })
    return
  }
  const granted = await api.v1.permissions.request(
    'clipboardWrite',
    'Text Adventure+ needs clipboard access to copy the last turn\'s details.',
  )
  if (!granted) return
  await api.v1.clipboard.writeText(String(details))
  await api.v1.ui.toast('Details copied.', { type: 'success' })
}
