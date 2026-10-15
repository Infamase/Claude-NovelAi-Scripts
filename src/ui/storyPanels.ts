// Text Adventure+'s Party and Inventory tabs in the bottom bar. They only exist in stories where the
// script is enabled.

import { IDS } from '../keys.ts'
import { inventoryPanel } from './inventoryPanel.ts'
import { panelSet } from './panelSet.ts'
import { partyPanel } from './partyPanel.ts'

const panels = panelSet([(rebuild) => partyPanel(rebuild), inventoryPanel], [IDS.partyPanel, IDS.inventoryPanel])

export const setStoryPanelsVisible = panels.setVisible
