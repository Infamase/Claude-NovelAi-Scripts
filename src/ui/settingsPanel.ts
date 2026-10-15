// The script's right-sidebar panel: the per-story switch, plus diagnostics.

import { diagnosticsSection } from '../diagnostics/stopTest.ts'
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
          text: `**Text Adventure+** v${api.v1.script.version} (Phase 0 preview)`,
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
          text: 'When enabled, Party and Inventory tabs appear above the bottom controls.',
          style: { opacity: 0.7 },
        },
        diagnosticsSection(),
      ],
    },
  ])
}
