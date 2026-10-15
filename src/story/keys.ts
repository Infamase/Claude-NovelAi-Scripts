// Story Adventure+'s storage keys and its own UI extension ids. The tabs (Player, Party, Inventory)
// share their keys and ids with Text Adventure+; each script has its own storage and extensions.

export const KEYS = {
  /** Story: whether the script is on for this story. */
  enabled: 'sap.enabled',
  /** Account: keep the story in second person, present tense. */
  pov: 'sap.pov',
  /** Account: check each reply for slips out of second person, present tense. */
  check: 'sap.check',
  /** Account: whether the writing guide is added to the system prompt, and its text. */
  useGuide: 'sap.useGuide',
  guide: 'sap.guide',
  /** Account: the default guide the script last stored, to tell an untouched guide from an edited one. */
  guideDefault: 'sap.guideDefault',
  /** Story: summary and full details of the last checked reply. */
  lastReplyStatus: 'sap.lastReply.status',
  lastReplyDetails: 'sap.lastReply.details',
} as const

export const STORY_IDS = {
  settingsPanel: 'sap-settings',
} as const
