// The Party and Inventory tabs in the bottom bar. They only exist in stories where the script is enabled.

import { IDS } from '../keys.ts'
import { inventoryPanel } from './inventoryPanel.ts'
import { partyPanel } from './partyPanel.ts'

let visible = false

export async function setStoryPanelsVisible(show: boolean): Promise<void> {
  if (show === visible) return
  // ui.register replaces every extension the script has (it would remove the sidebar panel), so
  // panels added later go through ui.update, which adds extensions alongside the existing ones.
  if (show) await api.v1.ui.update(await storyPanels())
  else await api.v1.ui.remove([IDS.partyPanel, IDS.inventoryPanel])
  visible = show
}

/** Rebuilds the tabs after companions or items are added, removed or reordered. */
async function rebuild(): Promise<void> {
  if (visible) await api.v1.ui.update(await storyPanels())
}

async function storyPanels(): Promise<(UIExtensionScriptPanel & { id: string })[]> {
  return [await partyPanel(rebuild), await inventoryPanel(rebuild)]
}
