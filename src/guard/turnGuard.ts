// The turn guard: holds each reply while it is written, checks it, and lets through only the part
// before the reply starts writing for the player character.
//
// A script can't stop a generation early: NovelAI then discards the whole reply. So the guard holds
// every streamed chunk back with `seenData` and decides on the final call, where it can still
// shorten the text before it reaches the editor. NovelAI shows replies all at once, so holding
// them back changes nothing on screen.

import { KEYS, logError } from '../keys.ts'
import { findOverstep, findRetelling, type Overstep } from './detector.ts'
import { askReferee, isRefereeRunning, type RefereeInput, type RefereeResult } from './referee.ts'
import { gameStateText } from '../state/gameState.ts'
import { addedText, turnContext, withRules } from './rules.ts'
import { isComplete, isSceneMarker, sliceChunks, splitSentences, type Sentence } from './text.ts'

/** How many times in a row the guard asks again when nothing of a reply could be kept. */
const MAX_AUTO_RETRIES = 2

type Settings = { strict: boolean; referee: boolean }

export type Turn = Settings & {
  model: string
  playerInput?: string
  storyTail?: string
  /** Set when nothing could be kept and the guard will ask again: which retry this will be. */
  retryNumber?: number
}

export type Decision = {
  reply: string
  sentences: Sentence[]
  /** How many scene breaks or headings were dropped from the start of the reply. */
  markers: number
  /** How many sentences were dropped from the start in all: scene markers, then any retelling of the player's action. */
  lead: number
  /** Index of the first sentence the referee saw; its sentence numbers count from there. */
  refereeFrom: number
  /** The part of the reply that reaches the editor: characters keepFrom to keep. */
  keepFrom: number
  keep: number
  cut?: Overstep & { by: 'rules' | 'referee' }
  unfinishedTrimmed: boolean
  referee?: RefereeResult
}

const turns = new Map<string, Turn>()
const addedTokens = new Map<string, number>()
/** Automatic retries since the player's last input or the last reply with something kept. */
let retriesInARow = 0

export function registerTurnGuard(): void {
  api.v1.hooks.register('onTextAdventureInput', () => {
    retriesInARow = 0
  })

  api.v1.hooks.register('onGenerationRequested', async ({ continuityId, model, inlineGeneration, toolboxMode }) => {
    // Script-started generations are guarded too (including the guard's own retries), apart from
    // anything the referee's call might set off.
    if (inlineGeneration || toolboxMode || isRefereeRunning() || !(await isEnabled())) return
    turns.set(continuityId, { model, ...(await readSettings()) })
  })

  api.v1.hooks.register('onBeforeContextBuild', async ({ continuityId, model, dryRun }) => {
    const settings = await settingsFor(continuityId, dryRun)
    if (!settings) return
    // Make room for what the guard adds, so it can't push the context over its limit. The game state
    // changes from turn to turn, so it is estimated generously rather than counted.
    const state = await gameStateText()
    const stateTokens = state ? Math.ceil(state.length / 3) + 4 : 0
    return { contextLimitReduction: (await addedTokenCount(model, settings.strict)) + stateTokens }
  })

  api.v1.hooks.register('onContextBuilt', async ({ continuityId, dryRun, messages }) => {
    const settings = await settingsFor(continuityId, dryRun)
    if (!settings) return
    const turn = turns.get(continuityId)
    if (turn && !dryRun) Object.assign(turn, turnContext(messages))
    return { messages: withRules(messages, settings.strict, await gameStateText()) }
  })

  api.v1.hooks.register('onResponse', async ({ continuityId, text, final }) => {
    const turn = turns.get(continuityId)
    if (!turn) return
    if (!final) return { seenData: 0 }
    const decision = await decide(turn, text.join(''))
    if (keptNothing(decision)) {
      if (retriesInARow < MAX_AUTO_RETRIES) turn.retryNumber = retriesInARow + 1
    } else {
      retriesInARow = 0
    }
    report(turn, decision).catch(logError)
    if (decision.keepFrom === 0 && decision.keep === decision.reply.length) return
    return { text: sliceChunks(text, decision.keepFrom, decision.keep) }
  })

  api.v1.hooks.register('onGenerationEnd', ({ continuityId }) => {
    const turn = turns.get(continuityId)
    turns.delete(continuityId)
    if (turn?.retryNumber === undefined) return
    retriesInARow = turn.retryNumber
    // Start the retry after this hook returns, once the editor is free again.
    api.v1.timers.setTimeout(() => api.v1.editor.generate().catch(logError), 50).catch(logError)
  })
}

/** Decides how much of a finished reply to keep. */
export async function decide(turn: Turn, reply: string): Promise<Decision> {
  const sentences = splitSentences(reply)
  // Dropped from the start: scene breaks and headings, then any retelling of the player's own line,
  // which is already in the story. Anywhere later, scene markers make the rules cut the reply.
  let markers = 0
  while (markers < sentences.length && isSceneMarker(sentences[markers].text)) markers++
  let lead = markers + findRetelling(reply, sentences.slice(markers), turn.playerInput)
  const options = { strict: turn.strict, playerInput: turn.playerInput }
  const rulesFrom = (from: number, actions: boolean): Decision['cut'] => {
    const overstep = findOverstep(reply, sentences.slice(from), { ...options, actions })
    return overstep ? { ...overstep, index: overstep.index + from, by: 'rules' } : undefined
  }

  // With the referee on, it judges actions; the rules still catch the clear-cut cases.
  let cut = rulesFrom(lead, !turn.referee)
  let referee: RefereeResult | undefined
  const refereeFrom = lead
  const checkUpTo = cut ? cut.index : sentences.length
  if (turn.referee && checkUpTo > lead) {
    referee = await askReferee(turn.model, {
      storyTail: turn.storyTail,
      playerInput: turn.playerInput,
      sentences: sentences.slice(lead, checkUpTo).map((s) => s.text),
      strict: turn.strict,
    })
    // An opening that retells the player's action badly is dropped; the rest can still be used.
    lead += referee.retold ?? 0
    if (referee.answer) {
      cut = { index: refereeFrom + referee.answer - 1, reason: 'writes for your character', by: 'referee' }
    } else if (referee.error) {
      // Without the referee's verdict, let the rules judge actions too.
      const fallback = rulesFrom(lead, true)
      if (fallback && (!cut || fallback.index < cut.index)) cut = fallback
    }
  }

  let keepFrom = lead > 0 ? (sentences[lead]?.start ?? reply.length) : 0
  while (lead > 0 && keepFrom < reply.length && /\s/.test(reply[keepFrom])) keepFrom++
  let keep = cut ? sentences[cut.index].start : reply.length
  let unfinishedTrimmed = false
  const last = sentences[sentences.length - 1]
  if (!cut && sentences.length - lead > 1 && !isComplete(last.text)) {
    // The length limit cut the reply off mid-sentence.
    keep = last.start
    unfinishedTrimmed = true
  }
  while (keep > keepFrom && /\s/.test(reply[keep - 1])) keep--
  return {
    reply,
    sentences,
    markers,
    lead,
    refereeFrom,
    keepFrom,
    keep: Math.max(keep, keepFrom),
    cut,
    unfinishedTrimmed,
    referee,
  }
}

function keptNothing(decision: Decision): boolean {
  return decision.reply.trim() !== '' && decision.reply.slice(decision.keepFrom, decision.keep).trim() === ''
}

async function report(turn: Turn, decision: Decision): Promise<void> {
  await api.v1.storyStorage.set(KEYS.lastTurnStatus, sanitize(statusText(decision, turn)))
  await api.v1.storyStorage.set(KEYS.lastTurnDetails, sanitize(detailsText(turn, decision)))
  if (!keptNothing(decision)) return
  if (turn.retryNumber !== undefined) {
    await api.v1.ui.toast(
      `Text Adventure+: the reply wrote for your character from its first sentence, so it was dropped. Asking again (${turn.retryNumber} of ${MAX_AUTO_RETRIES})…`,
      { type: 'info' },
    )
  } else {
    await api.v1.ui.toast(
      `Text Adventure+: still no usable reply after ${MAX_AUTO_RETRIES + 1} tries. Try rewording your action${turn.strict ? ', or turn off Strict' : ''}.`,
      { type: 'warning' },
    )
  }
}

export function statusText(d: Decision, turn?: Pick<Turn, 'retryNumber'>): string {
  if (!d.reply.trim()) return 'Last turn: the AI wrote nothing.'
  const total = d.sentences.length - d.markers
  const kept = d.sentences.filter((s, i) => i >= d.lead && s.start < d.keep).length
  const retold = d.lead - d.markers
  const lines: string[] = []
  if (d.cut) {
    const sentence = quote(d.sentences[d.cut.index].text.trim(), 120)
    lines.push(
      kept === 0
        ? `Last turn: nothing was kept. The reply started by writing for your character: ${sentence}`
        : `Last turn: kept ${kept} of ${total} sentences. Cut from: ${sentence}`,
      `Why: ${d.cut.reason} (found by the ${d.cut.by === 'referee' ? 'referee' : 'pattern rules'}).`,
    )
    if (kept === 0 && turn?.retryNumber !== undefined) {
      lines.push(`Asking the AI again automatically (${turn.retryNumber} of ${MAX_AUTO_RETRIES}).`)
    }
  } else if (total === 0) {
    lines.push('Last turn: nothing was kept. The reply was only scene breaks or headings.')
  } else if (d.unfinishedTrimmed) {
    lines.push(`Last turn: kept ${kept} of ${total} sentences, minus an unfinished last sentence.`)
  } else {
    lines.push(`Last turn: nothing to cut (${total} sentence${total === 1 ? '' : 's'}).`)
  }
  if (d.markers > 0 && total > 0) lines.push('Removed a scene break or heading from the start.')
  if (retold > 0) {
    lines.push(`Removed ${retold === 1 ? 'the opening sentence' : `${retold} opening sentences`}, which retold your own action.`)
  }
  if (d.referee) {
    // The referee numbers the sentences it saw; these are shown counted from the start of the reply.
    const r = d.referee
    const findings = [
      r.retold ? `retelling up to sentence ${d.refereeFrom + r.retold}` : '',
      r.answer ? `flagged sentence ${d.refereeFrom + r.answer}` : '',
    ].filter(Boolean)
    lines.push(
      r.error
        ? `Referee: unavailable (${r.error}), so the pattern rules checked for actions too.`
        : `Referee: ${findings.join(', ') || 'no problems'} (${r.model}, ${(r.ms / 1000).toFixed(1)} s).`,
    )
  }
  return lines.join('\n')
}

function detailsText(turn: Turn, d: Decision): string {
  const marks = d.sentences.map((s, i) => {
    const mark = i < d.lead ? '–' : s.start < d.keep ? '✓' : d.cut?.index === i ? '✂' : '·'
    return `  ${i + 1} ${mark} ${quote(s.text.trim(), 400)}`
  })
  return [
    `Text Adventure+ last turn (v${api.v1.script.version})`,
    `Model: ${turn.model} | strict: ${turn.strict ? 'on' : 'off'} | referee: ${turn.referee ? 'on' : 'off'}`,
    `Player input: ${turn.playerInput === undefined ? '(none)' : quote(turn.playerInput, 400)}`,
    statusText(d, turn),
    d.referee
      ? `Referee answer: ${quote(d.referee.raw, 40)}${d.referee.failedFirst ? ` (after ${d.referee.failedFirst})` : ''}`
      : 'Referee: not asked',
    'Reply, sentence by sentence (✓ kept, ✂ cut here, · hidden, – removed):',
    ...marks,
    `Story just before: ${quote(turn.storyTail ?? '', 400)}`,
  ].join('\n')
}

/** A made-up turn whose answer is known: sentence 2 has the player character speak. */
const REFEREE_SAMPLE: RefereeInput = {
  storyTail: 'The dragon opens one violet eye. "Awake, are we?"',
  playerInput: 'You ask "Who are you?"',
  sentences: ['The dragon lifts her head from the pile of books.', '"Where am I?" you whisper.', 'She laughs, a sound like rolling thunder.'],
  strict: false,
}

/** Runs the referee once on a sample, outside any reply, and records the result. */
export async function runRefereeTest(): Promise<string> {
  const settings = await api.v1.generationParameters.get().catch(() => undefined)
  const result = await askReferee(settings?.model ?? 'glm-4-6', REFEREE_SAMPLE)
  const where = `${result.model}, ${(result.ms / 1000).toFixed(1)} s`
  const text = result.error
    ? `Referee test failed: ${result.error}`
    : result.answer === 2
      ? `Referee test passed: it found the right sentence (${where}).`
      : `Referee test: it works, but answered ${result.answer} where 2 was right (${where}).`
  await api.v1.storyStorage.set(KEYS.refereeTest, sanitize(text))
  return text
}

async function isEnabled(): Promise<boolean> {
  return (await api.v1.storyStorage.get(KEYS.enabled)) === true
}

async function readSettings(): Promise<Settings> {
  return {
    strict: (await api.v1.storage.get(KEYS.strict)) === true,
    referee: (await api.v1.storage.get(KEYS.referee)) !== false,
  }
}

/** The settings to use for a context build, or undefined if the guard isn't involved. */
async function settingsFor(continuityId: string, dryRun: boolean): Promise<Settings | undefined> {
  const turn = turns.get(continuityId)
  if (turn) return turn
  // Dry runs (such as the Context viewer) show the rules too, so they can be checked.
  if (dryRun && (await isEnabled())) return readSettings()
  return undefined
}

async function addedTokenCount(model: string, strict: boolean): Promise<number> {
  const key = `${model}|${strict}`
  let count = addedTokens.get(key)
  if (count === undefined) {
    const text = addedText(strict)
    count = await api.v1.tokenizer
      .encode(text, model)
      .then((tokens) => tokens.length)
      .catch(() => Math.ceil(text.length / 3))
    addedTokens.set(key, count)
  }
  return count + 8
}

/** JSON-quotes text (shortened from the end if needed), so whitespace stays visible. */
function quote(text: string, max: number): string {
  return JSON.stringify(text.length > max ? text.slice(0, max) + '…' : text)
}

/** The sidebar shows these through {{storage}} templates, so keep story text from looking like one. */
export function sanitize(text: string): string {
  return text.replace(/\{\{/g, '{ {')
}
