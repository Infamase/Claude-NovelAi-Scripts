// The Party and Inventory tabs in the bottom bar. They only exist in stories where the script is enabled.

import { IDS } from '../keys.ts'

let visible = false

export async function setStoryPanelsVisible(show: boolean): Promise<void> {
  if (show === visible) return
  // ui.register replaces every extension the script has (it would remove the sidebar panel), so
  // panels added later go through ui.update, which adds extensions alongside the existing ones.
  if (show) await api.v1.ui.update([partyPanel(), inventoryPanel()])
  else await api.v1.ui.remove([IDS.partyPanel, IDS.inventoryPanel])
  visible = show
}

function partyPanel(): UIExtensionScriptPanel & { id: string } {
  return {
    type: 'scriptPanel',
    id: IDS.partyPanel,
    name: 'Party',
    iconId: 'users',
    content: [
      {
        type: 'text',
        markdown: true,
        text: [
          '**Party** (coming in Phase 3)',
          '',
          'Your companions will be listed here with their role, status (healthy, wounded…), attitude toward you and notes. Members marked *in party* are added to the AI\'s context every turn, like this:',
          '',
          '`[ Party: Lyra (elf ranger; wounded; trusts you) ]`',
        ].join('\n'),
      },
    ],
  }
}

function inventoryPanel(): UIExtensionScriptPanel & { id: string } {
  return {
    type: 'scriptPanel',
    id: IDS.inventoryPanel,
    name: 'Inventory',
    iconId: 'package',
    content: [
      {
        type: 'text',
        markdown: true,
        text: [
          '**Inventory** (coming in Phase 2)',
          '',
          'Your currency, items with quantities, and what you have equipped will be tracked here and added to the AI\'s context every turn, like this:',
          '',
          '`[ Equipped: iron sword ]`  ',
          '`[ Carrying: healing potion ×3, rope; 45 gold ]`',
        ].join('\n'),
      },
    ],
  }
}
