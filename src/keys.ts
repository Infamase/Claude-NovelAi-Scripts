// Text Adventure+'s storage keys, and the UI extension ids.

export const KEYS = {
  /** Story: whether the script is on for this story. */
  enabled: 'tap.enabled',
  /** Account: strict mode (no physical reactions from the player character either). */
  strict: 'tap.strict',
  /** Account: whether the referee double-checks replies. */
  referee: 'tap.referee',
  /** Story: summary and full details of the last guarded turn. */
  lastTurnStatus: 'tap.lastTurn.status',
  lastTurnDetails: 'tap.lastTurn.details',
  /** Story: the result of the last "Test the referee" run. */
  refereeTest: 'tap.refereeTest',
} as const

/** Keys used by earlier versions, removed on load. */
export const OLD_STORY_KEYS = ['tap.diag.armed', 'tap.diag.report', 'tap.diag.step', 'tap.diag.turns', 'tap.diag.lastRun']

/** UI extension ids. Each script has its own extensions, so Story Adventure+ uses the same tab ids. */
export const IDS = {
  settingsPanel: 'tap-settings',
  playerPanel: 'tap-player',
  partyPanel: 'tap-party',
  inventoryPanel: 'tap-inventory',
} as const

export function logError(error: unknown): void {
  api.v1.error(`${api.v1.script.name}:`, error)
}
