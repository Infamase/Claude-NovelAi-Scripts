// Story Adventure+'s Setting, Player, Party and Inventory tabs in the bottom bar. They only exist in
// stories where the script is enabled.

import { IDS } from '../keys.ts'
import { inventoryPanel } from '../ui/inventoryPanel.ts'
import { panelSet } from '../ui/panelSet.ts'
import { partyPanel } from '../ui/partyPanel.ts'
import { playerPanel } from '../ui/playerPanel.ts'
import { settingPanel } from '../ui/settingPanel.ts'

export const STORY_PARTY_NOTE =
  'The people travelling with you. Untick "In party" for someone who is away: they stay listed but are not sent.'

const panels = panelSet(
  [settingPanel, playerPanel, (rebuild) => partyPanel(rebuild, STORY_PARTY_NOTE), inventoryPanel],
  [IDS.settingPanel, IDS.playerPanel, IDS.partyPanel, IDS.inventoryPanel],
)

export const setStoryPanelsVisible = panels.setVisible
