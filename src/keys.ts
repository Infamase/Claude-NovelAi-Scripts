// Storage keys (all kept in the current story via api.v1.storyStorage) and UI extension ids.

export const KEYS = {
  enabled: 'tap.enabled',
  diagArmed: 'tap.diag.armed',
  diagReport: 'tap.diag.report',
  diagLastRun: 'tap.diag.lastRun',
} as const

export const IDS = {
  settingsPanel: 'tap-settings',
  partyPanel: 'tap-party',
  inventoryPanel: 'tap-inventory',
} as const

export function logError(error: unknown): void {
  api.v1.error('Text Adventure+:', error)
}
