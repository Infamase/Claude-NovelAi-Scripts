// The game state the AI gets next to the player's action each turn: the party, then the inventory.

import { inventoryLines, readInventory } from './inventory.ts'
import { partyLines, readParty } from './party.ts'

/** Formats state lines as the block the AI sees, or undefined if there is nothing to tell. */
export function gameStateBlock(lines: string[]): string | undefined {
  if (lines.length === 0) return undefined
  return ['Game state (keep the story consistent with it):', ...lines.map((line) => `- ${line}`)].join('\n')
}

export async function gameStateText(): Promise<string | undefined> {
  return gameStateBlock([...partyLines(await readParty()), ...inventoryLines(await readInventory())])
}
