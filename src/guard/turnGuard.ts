// The turn guard: holds each reply while it is written, checks it, and lets through only the part
// before the reply starts writing for the player character.
//
// A script can't stop a generation early: NovelAI then discards the whole reply. So the guard holds
// every streamed chunk back with `seenData` and decides on the final call, where it can still
// shorten the text before it reaches the editor. NovelAI shows replies all at once, so holding
// them back changes nothing on screen.

import { KEYS, logError } from '../keys.ts'
import { findOverstep, type Overstep } from './detector.ts'
import { askReferee, type RefereeResult } from './referee.ts'
import { narratorRules, turnContext, withRules } from './rules.ts'
import { isComplete, splitSentences, truncateChunks, type Sentence } from './text.ts'

type Settings = { strict: boolean; referee: boolean }

export type Turn = Settings & {
  model: string
  playerInput?: string
  storyTail?: string
}

export type Decision = {
  reply: string
  sentences: Sentence[]
  /** How many characters of the reply reach the editor. */
  keep: number
  cut?: Overstep & { by: 'rules' | 'referee' }
  unfinishedTrimmed: boolean
  referee?: RefereeResult
}

const turns = new Map<string, Turn>()
const ruleTokens = new Map<string, number>()

export function registerTurnGuard(): void {
  api.v1.hooks.register('onGenerationRequested', async ({ continuityId, model, scriptInitiated, inlineGeneration, toolboxMode }) => {
    if (scriptInitiated || inlineGeneration || toolboxMode || !(await isEnabled())) return
    turns.set(continuityId, { model, ...(await readSettings()) })
  })

  api.v1.hooks.register('onBeforeContextBuild', async ({ continuityId, model, dryRun }) => {
    const settings = await settingsFor(continuityId, dryRun)
    if (!settings) return
    // Make room for the rules, so adding them can't push the context over its limit.
    return { contextLimitReduction: await rulesTokens(model, settings.strict) }
  })

  api.v1.hooks.register('onContextBuilt', async ({ continuityId, dryRun, messages }) => {
    const settings = await settingsFor(continuityId, dryRun)
    if (!settings) return
    const turn = turns.get(continuityId)
    if (turn && !dryRun) Object.assign(turn, turnContext(messages))
    return { messages: withRules(messages, narratorRules(settings.strict)) }
  })

  api.v1.hooks.register('onResponse', async ({ continuityId, text, final }) => {
    const turn = turns.get(continuityId)
    if (!turn) return
    if (!final) return { seenData: 0 }
    const decision = await decide(turn, text.join(''))
    report(turn, decision).catch(logError)
    if (decision.keep === decision.reply.length) return
    return { text: truncateChunks(text, decision.keep) }
  })

  api.v1.hooks.register('onGenerationEnd', ({ continuityId }) => {
    turns.delete(continuityId)
  })
}

/** Decides how much of a finished reply to keep. */
export async function decide(turn: Turn, reply: string): Promise<Decision> {
  const sentences = splitSentences(reply)
  const options = { strict: turn.strict, playerInput: turn.playerInput }
  const byRules = (overstep: Overstep | undefined) => (overstep ? { ...overstep, by: 'rules' as const } : undefined)

  // With the referee on, it judges actions; the rules still catch the clear-cut cases.
  let cut: Decision['cut'] = byRules(findOverstep(reply, sentences, { ...options, actions: !turn.referee }))
  let referee: RefereeResult | undefined
  const checkUpTo = cut ? cut.index : sentences.length
  if (turn.referee && checkUpTo > 0) {
    referee = await askReferee(turn.model, {
      storyTail: turn.storyTail,
      playerInput: turn.playerInput,
      sentences: sentences.slice(0, checkUpTo).map((s) => s.text),
      strict: turn.strict,
    })
    if (referee.answer) {
      cut = { index: referee.answer - 1, reason: 'writes for your character', by: 'referee' }
    } else if (referee.error) {
      // Without the referee's verdict, let the rules judge actions too.
      const fallback = byRules(findOverstep(reply, sentences, { ...options, actions: true }))
      if (fallback && (!cut || fallback.index < cut.index)) cut = fallback
    }
  }

  let keep = cut ? sentences[cut.index].start : reply.length
  let unfinishedTrimmed = false
  const last = sentences[sentences.length - 1]
  if (!cut && sentences.length > 1 && !isComplete(last.text)) {
    // The length limit cut the reply off mid-sentence.
    keep = last.start
    unfinishedTrimmed = true
  }
  while (keep > 0 && /\s/.test(reply[keep - 1])) keep--
  return { reply, sentences, keep, cut, unfinishedTrimmed, referee }
}

async function report(turn: Turn, decision: Decision): Promise<void> {
  await api.v1.storyStorage.set(KEYS.lastTurnStatus, sanitize(statusText(decision)))
  await api.v1.storyStorage.set(KEYS.lastTurnDetails, sanitize(detailsText(turn, decision)))
  if (decision.keep === 0 && decision.reply.trim()) {
    await api.v1.ui.toast(
      'Text Adventure+: the reply started by writing for your character, so nothing was added. Press Retry.',
      { type: 'warning' },
    )
  }
}

export function statusText(d: Decision): string {
  if (!d.reply.trim()) return 'Last turn: the AI wrote nothing.'
  const total = d.sentences.length
  const kept = d.sentences.filter((s) => s.start < d.keep).length
  const lines: string[] = []
  if (d.cut) {
    const sentence = quote(d.sentences[d.cut.index].text.trim(), 120)
    lines.push(
      kept === 0
        ? `Last turn: nothing was kept. The reply started by writing for your character: ${sentence}`
        : `Last turn: kept ${kept} of ${total} sentences. Cut from: ${sentence}`,
      `Why: ${d.cut.reason} (found by the ${d.cut.by === 'referee' ? 'referee' : 'pattern rules'}).`,
    )
  } else if (d.unfinishedTrimmed) {
    lines.push(`Last turn: kept ${kept} of ${total} sentences, minus an unfinished last sentence.`)
  } else {
    lines.push(`Last turn: nothing to cut (${total} sentence${total === 1 ? '' : 's'}).`)
  }
  if (d.referee) {
    lines.push(
      d.referee.error
        ? `Referee: unavailable (${d.referee.error}), so the pattern rules checked for actions too.`
        : `Referee: ${d.referee.answer ? `flagged sentence ${d.referee.answer}` : 'no problems'} (${(d.referee.ms / 1000).toFixed(1)} s).`,
    )
  }
  return lines.join('\n')
}

function detailsText(turn: Turn, d: Decision): string {
  const marks = d.sentences.map((s, i) => {
    const mark = s.start < d.keep ? '✓' : d.cut?.index === i ? '✂' : '·'
    return `  ${i + 1} ${mark} ${quote(s.text.trim(), 400)}`
  })
  return [
    `Text Adventure+ last turn (v${api.v1.script.version})`,
    `Model: ${turn.model} | strict: ${turn.strict ? 'on' : 'off'} | referee: ${turn.referee ? 'on' : 'off'}`,
    `Player input: ${turn.playerInput === undefined ? '(none)' : quote(turn.playerInput, 400)}`,
    statusText(d),
    d.referee ? `Referee answer: ${quote(d.referee.raw, 40)}` : 'Referee: not asked',
    'Reply, sentence by sentence (✓ kept, ✂ cut here, · hidden):',
    ...marks,
    `Story just before: ${quote(turn.storyTail ?? '', 400)}`,
  ].join('\n')
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

async function rulesTokens(model: string, strict: boolean): Promise<number> {
  const key = `${model}|${strict}`
  let count = ruleTokens.get(key)
  if (count === undefined) {
    const rules = `\n\n${narratorRules(strict)}`
    count = await api.v1.tokenizer
      .encode(rules, model)
      .then((tokens) => tokens.length)
      .catch(() => Math.ceil(rules.length / 3))
    ruleTokens.set(key, count)
  }
  return count + 4
}

/** JSON-quotes text (shortened from the end if needed), so whitespace stays visible. */
function quote(text: string, max: number): string {
  return JSON.stringify(text.length > max ? text.slice(0, max) + '…' : text)
}

/** The sidebar shows these through {{storage}} templates, so keep story text from looking like one. */
function sanitize(text: string): string {
  return text.replace(/\{\{/g, '{ {')
}
