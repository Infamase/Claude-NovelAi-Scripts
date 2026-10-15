// Story Adventure+'s hooks. Before each reply they add the point-of-view rule and the writing guide
// to the system prompt, and the game state (setting, player, party, inventory) with a reminder just
// before the story. With "Catch slips"
// on, they also check the reply as it streams in and keep back the part that slips out of second
// person, present tense.
//
// A script can't stop a generation early: NovelAI then discards the whole reply. So the check holds
// back chunks with `seenData` instead. Sentences that are clearly fine are let through as they
// arrive; from the first sentence that might start a slip, the rest waits for the end of the reply,
// where it can still be cut before it reaches the editor.

import { logError } from '../keys.ts'
import { gameStateBlock } from '../state/gameState.ts'
import { inventoryLines, readInventory } from '../state/inventory.ts'
import { partyLines, readParty } from '../state/party.ts'
import { playerLines, readPlayer } from '../state/player.ts'
import { readSetting, settingLines } from '../state/setting.ts'
import { text as textOf } from '../state/store.ts'
import { sliceChunks, splitSentences, type Sentence } from '../guard/text.ts'
import { KEYS } from './keys.ts'
import { storyNote, systemAddition, withStoryPrompt } from './prompt.ts'
import { checkSentences, findSlip, mightSlip, type SentenceCheck, type Slip } from './slips.ts'

/** How many times in a row the script asks again when nothing of a reply could be kept. */
const MAX_AUTO_RETRIES = 2

export type StorySettings = {
  /** Second person, present tense. */
  pov: boolean
  /** Catch slips (only with pov on). */
  check: boolean
  /** The writing guide, or '' when it's off. */
  guide: string
}

type Reply = StorySettings & {
  model: string
  /** The protagonist's name, to catch narration that uses it instead of "you". */
  name: string
  /** The part of the reply already let through to the editor. */
  released: string
  /** Set when nothing could be kept and the script will ask again: which retry this will be. */
  retryNumber?: number
}

export type SlipDecision = {
  reply: string
  sentences: Sentence[]
  checks: SentenceCheck[]
  slip?: Slip
  /** How many characters of the reply reach the editor. */
  keep: number
}

const replies = new Map<string, Reply>()
const tokenCounts = new Map<string, number>()
/** Automatic retries since the player last asked for a reply or a reply had something kept. */
let retriesInARow = 0

export function registerStoryHooks(): void {
  api.v1.hooks.register('onGenerationRequested', async ({ continuityId, model, inlineGeneration, toolboxMode, scriptInitiated }) => {
    if (inlineGeneration || toolboxMode || !(await isEnabled())) return
    if (!scriptInitiated) retriesInARow = 0
    replies.set(continuityId, { model, ...(await readSettings()), name: (await readPlayer()).name, released: '' })
  })

  api.v1.hooks.register('onBeforeContextBuild', async ({ continuityId, model, dryRun }) => {
    const settings = await settingsFor(continuityId, dryRun)
    if (!settings) return
    // Make room for what the script adds, so it can't push the context over its limit. The game
    // state changes from reply to reply, so it is estimated generously rather than counted.
    const state = await gameStateText()
    const fixed = [systemAddition(settings.pov, settings.guide), storyNote(settings.pov)].filter(Boolean).join('\n\n')
    const stateTokens = state ? Math.ceil(state.length / 3) + 4 : 0
    return { contextLimitReduction: (await tokenCount(fixed, model)) + stateTokens + 8 }
  })

  api.v1.hooks.register('onContextBuilt', async ({ continuityId, dryRun, messages }) => {
    const settings = await settingsFor(continuityId, dryRun)
    if (!settings) return
    return {
      messages: withStoryPrompt(messages, {
        system: systemAddition(settings.pov, settings.guide),
        note: storyNote(settings.pov, await gameStateText()),
      }),
    }
  })

  api.v1.hooks.register('onResponse', async ({ continuityId, text, final }) => {
    const reply = replies.get(continuityId)
    if (!reply || !reply.pov || !reply.check) return
    const full = reply.released + text.join('')
    if (!final) {
      const count = chunksWithin(text, releasable(full, reply.name) - reply.released.length)
      reply.released += text.slice(0, count).join('')
      return { seenData: count }
    }

    const decision = decideSlips(full, reply.name)
    // A slip can only start after the part already let through, but never cut into that part.
    const keep = (decision.keep = Math.max(decision.keep, reply.released.length))
    if (keptNothing(decision)) {
      if (retriesInARow < MAX_AUTO_RETRIES) reply.retryNumber = retriesInARow + 1
    } else {
      retriesInARow = 0
    }
    report(reply, decision).catch(logError)
    if (keep >= full.length) return
    return { text: sliceChunks(text, 0, keep - reply.released.length) }
  })

  api.v1.hooks.register('onGenerationEnd', ({ continuityId }) => {
    const reply = replies.get(continuityId)
    replies.delete(continuityId)
    if (reply?.retryNumber === undefined) return
    retriesInARow = reply.retryNumber
    // Start the retry after this hook returns, once the editor is free again.
    api.v1.timers.setTimeout(() => api.v1.editor.generate().catch(logError), 50).catch(logError)
  })
}

/** Setting, player, party, then inventory, as the block the AI sees, or undefined if there is nothing to tell. */
export async function gameStateText(): Promise<string | undefined> {
  return gameStateBlock([
    ...settingLines(await readSetting()),
    ...playerLines(await readPlayer()),
    ...partyLines(await readParty()),
    ...inventoryLines(await readInventory()),
  ])
}

/** Decides how much of a finished reply to keep: everything before the first slip. */
export function decideSlips(reply: string, name = ''): SlipDecision {
  const sentences = splitSentences(reply)
  const checks = checkSentences(reply, sentences, name)
  const slip = findSlip(checks)
  let keep = slip ? sentences[slip.index].start : reply.length
  if (slip) while (keep > 0 && /\s/.test(reply[keep - 1])) keep--
  return { reply, sentences, checks, slip, keep }
}

/**
 * How much of a reply still being written can be let through: everything before the first
 * sentence that might start a slip, and never the last sentence, which may not be finished.
 */
export function releasable(reply: string, name = ''): number {
  const sentences = splitSentences(reply)
  if (sentences.length === 0) return 0
  const checks = checkSentences(reply, sentences, name)
  let index = 0
  while (index < sentences.length - 1 && !mightSlip(checks[index])) index++
  return sentences[index].start
}

/** How many leading chunks fit within `length` characters. */
function chunksWithin(chunks: string[], length: number): number {
  let total = 0
  let count = 0
  while (count < chunks.length && total + chunks[count].length <= length) {
    total += chunks[count].length
    count++
  }
  return count
}

function keptNothing(decision: SlipDecision): boolean {
  return decision.reply.trim() !== '' && decision.reply.slice(0, decision.keep).trim() === ''
}

async function report(reply: Reply, decision: SlipDecision): Promise<void> {
  await api.v1.storyStorage.set(KEYS.lastReplyStatus, sanitize(statusText(decision, reply)))
  await api.v1.storyStorage.set(KEYS.lastReplyDetails, sanitize(detailsText(reply, decision)))
  if (!keptNothing(decision)) return
  if (reply.retryNumber !== undefined) {
    await api.v1.ui.toast(
      `Story Adventure+: the reply slipped out of second person, present tense from its first sentence, so it was dropped. Asking again (${reply.retryNumber} of ${MAX_AUTO_RETRIES})…`,
      { type: 'info' },
    )
  } else {
    await api.v1.ui.toast(
      `Story Adventure+: still no usable reply after ${MAX_AUTO_RETRIES + 1} tries. Check that the story so far is in second person, present tense, or turn off Catch slips.`,
      { type: 'warning' },
    )
  }
}

export function statusText(d: SlipDecision, reply?: Pick<Reply, 'retryNumber'>): string {
  if (!d.reply.trim()) return 'Last reply: the AI wrote nothing.'
  const total = d.sentences.length
  if (!d.slip) return `Last reply: no slips (${total} sentence${total === 1 ? '' : 's'}).`
  const kept = d.sentences.filter((s) => s.start < d.keep).length
  const sentence = quote(d.sentences[d.slip.index].text.trim(), 120)
  const lines = [
    kept === 0
      ? `Last reply: nothing was kept. It slipped from the first sentence: ${sentence}`
      : `Last reply: kept ${kept} of ${total} sentences. Cut from: ${sentence}`,
    `Why: it ${d.slip.reason}.`,
  ]
  if (kept === 0 && reply?.retryNumber !== undefined) {
    lines.push(`Asking the AI again automatically (${reply.retryNumber} of ${MAX_AUTO_RETRIES}).`)
  }
  return lines.join('\n')
}

function detailsText(reply: Reply, d: SlipDecision): string {
  const marks = d.sentences.map((s, i) => {
    const mark = s.start < d.keep ? '✓' : d.slip?.index === i ? '✂' : '·'
    const c = d.checks[i]
    const notes = [
      `past ${c.past}, present ${c.present}`,
      c.memory ? 'memory' : '',
      c.firstPerson ? `first person "${c.firstPerson}"` : '',
      c.named ? `named "${c.named}"` : '',
    ].filter(Boolean)
    return `  ${i + 1} ${mark} (${notes.join('; ')}) ${quote(s.text.trim(), 400)}`
  })
  return [
    `Story Adventure+ last reply (v${api.v1.script.version})`,
    `Model: ${reply.model} | name: ${reply.name ? quote(reply.name, 60) : '(none)'}`,
    statusText(d, reply),
    'Reply, sentence by sentence (✓ kept, ✂ cut here, · hidden):',
    ...marks,
  ].join('\n')
}

async function isEnabled(): Promise<boolean> {
  return (await api.v1.storyStorage.get(KEYS.enabled)) === true
}

export async function readSettings(): Promise<StorySettings> {
  const s = api.v1.storage
  return {
    pov: (await s.get(KEYS.pov)) !== false,
    check: (await s.get(KEYS.check)) !== false,
    guide: (await s.get(KEYS.useGuide)) !== false ? textOf(await s.get(KEYS.guide)) : '',
  }
}

/** The settings to use for a context build, or undefined if the script isn't involved. */
async function settingsFor(continuityId: string, dryRun: boolean): Promise<StorySettings | undefined> {
  const reply = replies.get(continuityId)
  if (reply) return reply
  // Dry runs (such as the Context viewer) show the additions too, so they can be checked.
  if (dryRun && (await isEnabled())) return readSettings()
  return undefined
}

async function tokenCount(text: string, model: string): Promise<number> {
  if (!text) return 0
  const key = `${model}|${text}`
  let count = tokenCounts.get(key)
  if (count === undefined) {
    count = await api.v1.tokenizer
      .encode(text, model)
      .then((tokens) => tokens.length)
      .catch(() => Math.ceil(text.length / 3))
    // The guide can be edited, so keep only a few counts around.
    if (tokenCounts.size > 8) tokenCounts.clear()
    tokenCounts.set(key, count)
  }
  return count
}

/** JSON-quotes text (shortened from the end if needed), so whitespace stays visible. */
function quote(text: string, max: number): string {
  return JSON.stringify(text.length > max ? text.slice(0, max) + '…' : text)
}

/** The sidebar shows these through {{storage}} templates, so keep story text from looking like one. */
function sanitize(text: string): string {
  return text.replace(/\{\{/g, '{ {')
}
