// Phase 0 stop test: learns how NovelAI handles a script cutting a streamed generation short.
//
// Once armed from the sidebar it runs over the user's next three turns, one cutting technique per
// turn. Each turn holds text back until the first sentence is complete and releases it with
// `seenData`, then cuts after the second sentence using that turn's technique. After the generation
// it checks what actually reached the editor, and records how the TA input and the context looked.

import { chunksCovering, findSentenceEnd, truncateChunks } from '../guard/text.ts'
import { KEYS, logError } from '../keys.ts'

type Technique = { id: 'stop-with-text' | 'release-then-stop' | 'hide-rest'; label: string }

const TECHNIQUES: Technique[] = [
  { id: 'stop-with-text', label: 'Cut and stop in one step' },
  { id: 'release-then-stop', label: 'Let the text through, then stop on the next call' },
  { id: 'hide-rest', label: 'Hide everything after the cut, without stopping' },
]

type TaInput = { continuityId: string; mode: string; inputText: string; rawInputText: string }

type Run = {
  technique: Technique
  step: number
  continuityId: string
  model: string
  maxTokens?: number
  taInput?: TaInput
  context?: string[]
  nodeBefore?: number
  nodeAfter?: number
  latestGenerationNode?: number
  responseCalls: number
  heldCalls: number
  /** First sentence, let through with seenData. */
  released: string
  /** Everything that should end up in the editor: the first two sentences. Set at the cut. */
  wanted?: string
  cutCall?: number
  cutOnFinal?: boolean
  afterCutCalls: number
  afterCutChars: number
  afterCutResent: boolean
  finalCall?: string
  midStreamVisible?: boolean
  endedEarly: boolean
  generationEnded: boolean
  checks: { label: string; verdict: string }[]
  documentTail: string[]
  concluded: boolean
}

const HELP = [
  'Checks how NovelAI reacts when the script cuts a response short. The result decides how Phase 1 is built.',
  '',
  '1. Tick the box below.',
  '2. Take **three** normal turns with the Do/Say box. Pick actions that should get several sentences back. Each turn tries a different way of cutting.',
  '3. After the third turn, press **Copy report** and paste the report to Claude.',
  '',
  'Turns will look cut short, or may lose their text entirely; that is part of what is being measured. Undo them afterwards if you like.',
].join('\n')

let lastTaInput: TaInput | undefined
let run: Run | undefined

export async function initDiagnostics(): Promise<void> {
  await api.v1.storyStorage.setIfAbsent(KEYS.diagReport, 'No test run yet.')
}

export function registerDiagnosticsHooks(): void {
  api.v1.hooks.register('onTextAdventureInput', ({ continuityId, mode, inputText, rawInputText }) => {
    lastTaInput = { continuityId, mode, inputText, rawInputText }
  })

  api.v1.hooks.register('onGenerationRequested', async ({ continuityId, model }) => {
    if ((await api.v1.storyStorage.get(KEYS.diagArmed)) !== true) return
    const step = Math.min(Number(await api.v1.storyStorage.get(KEYS.diagStep)) || 0, TECHNIQUES.length - 1)
    const settings = await api.v1.generationParameters.get().catch(() => undefined)
    run = {
      technique: TECHNIQUES[step],
      step,
      continuityId,
      model,
      maxTokens: settings?.max_tokens,
      taInput: lastTaInput,
      nodeBefore: await api.v1.document.history.currentNodeId().catch(() => undefined),
      responseCalls: 0,
      heldCalls: 0,
      released: '',
      afterCutCalls: 0,
      afterCutChars: 0,
      afterCutResent: false,
      endedEarly: false,
      generationEnded: false,
      checks: [],
      documentTail: [],
      concluded: false,
    }
  })

  api.v1.hooks.register('onContextBuilt', ({ continuityId, dryRun, messages }) => {
    if (run?.continuityId === continuityId && !dryRun) run.context = summarizeMessages(messages)
  })

  api.v1.hooks.register('onResponse', onResponse)

  api.v1.hooks.register('onGenerationEnd', async ({ continuityId }) => {
    const r = run
    if (!r || r.continuityId !== continuityId || r.concluded) return
    r.generationEnded = true
    await check(r, 'At generation end')
    // Look again shortly after, in case the editor changes once the generation has wound down.
    later(r, 2000, '2 s later')
  })
}

const onResponse: OnResponse = async ({ continuityId, text, final }) => {
  const r = run
  if (!r || r.continuityId !== continuityId || r.concluded) return
  r.responseCalls++
  const joined = text.join('')
  if (final) {
    r.finalCall = `#${r.responseCalls}, ${text.length} chunks, ${joined.length} chars, starts ${quote(joined.slice(0, 60), 60)}`
  }

  if (r.wanted !== undefined) return afterCut(r, text, joined)
  if (r.endedEarly) return

  if (r.released && r.midStreamVisible === undefined) {
    r.midStreamVisible = normalize((await readDocument()).text).includes(normalize(r.released))
  }

  const end = findSentenceEnd(joined)
  if (end < 0 || (!r.released && final)) {
    // On the final call everything is placed regardless of seenData, so the test can't continue.
    if (final) {
      r.endedEarly = true
      return
    }
    r.heldCalls++
    return { seenData: 0 }
  }

  if (!r.released) {
    const count = chunksCovering(text, end)
    r.released = text.slice(0, count).join('')
    return { seenData: count }
  }

  r.wanted = r.released + joined.slice(0, end)
  r.cutCall = r.responseCalls
  r.cutOnFinal = final
  later(r, 4000, 'No onGenerationEnd; 4 s after the cut', true)
  const kept = truncateChunks(text, end)
  return r.technique.id === 'stop-with-text' ? { text: kept, stopGeneration: true } : { text: kept }
}

/** Handles calls that arrive after the cut point: their text must not reach the editor. */
function afterCut(r: Run, text: string[], joined: string): OnResponseReturnValue {
  const wanted = r.wanted ?? ''
  r.afterCutCalls++
  r.afterCutChars += joined.length
  // If a call resends the whole response, trim it to the wanted text instead of blanking it all.
  const resent = wanted !== '' && joined.startsWith(wanted)
  if (resent) r.afterCutResent = true
  const out = resent ? truncateChunks(text, wanted.length) : text.map(() => '')
  return r.technique.id === 'hide-rest' ? { text: out } : { text: out, stopGeneration: true }
}

function later(r: Run, delay: number, label: string, onlyWithoutGenerationEnd = false): void {
  api.v1.timers
    .setTimeout(() => {
      if (r.concluded || (onlyWithoutGenerationEnd && r.generationEnded)) return
      check(r, label)
        .then(() => conclude(r))
        .catch(logError)
    }, delay)
    .catch(logError)
}

async function check(r: Run, label: string): Promise<void> {
  const doc = await readDocument()
  r.checks.push({ label, verdict: judge(r, doc.text) })
  r.documentTail = doc.tail
  r.nodeAfter = await api.v1.document.history.currentNodeId().catch(() => undefined)
  r.latestGenerationNode = await api.v1.document.history.mostRecentGenerationNodeId().catch(() => undefined)
}

async function conclude(r: Run): Promise<void> {
  if (r.concluded) return
  r.concluded = true
  const turns: string[] = (await api.v1.storyStorage.get(KEYS.diagTurns)) ?? []
  turns[r.step] = formatTurn(r)
  await api.v1.storyStorage.set(KEYS.diagTurns, turns)

  const noHooks = r.responseCalls === 0
  const step = r.wanted === undefined ? r.step : r.step + 1
  const done = noHooks || step >= TECHNIQUES.length
  await api.v1.storyStorage.set(KEYS.diagStep, step)
  if (done) await api.v1.storyStorage.set(KEYS.diagArmed, false)
  await api.v1.storyStorage.set(KEYS.diagReport, formatReport(turns, step, r))

  if (noHooks) await toast('Stop test stopped: onResponse never ran. See the report.', 'warning')
  else if (r.wanted === undefined) await toast(`Stop test turn ${r.step + 1}: the response was too short. Take another turn.`, 'warning')
  else if (!done) await toast(`Stop test turn ${r.step + 1} of ${TECHNIQUES.length} done. Take your next turn.`, 'info')
  else await toast('Stop test finished. Press Copy report in the Text Adventure+ panel.', 'success')
}

async function resetTest(): Promise<void> {
  run = undefined
  await api.v1.storyStorage.set(KEYS.diagStep, 0)
  await api.v1.storyStorage.set(KEYS.diagTurns, [])
  await api.v1.storyStorage.set(KEYS.diagReport, `Armed. Take your next turn (1 of ${TECHNIQUES.length}).`)
}

async function copyReport(): Promise<void> {
  const granted = await api.v1.permissions.request(
    'clipboardWrite',
    'Text Adventure+ needs clipboard access to copy the stop test report.',
  )
  if (!granted) return
  const report = await api.v1.storyStorage.get(KEYS.diagReport)
  await api.v1.clipboard.writeText(String(report ?? ''))
  await toast('Report copied.', 'success')
}

function judge(r: Run, documentText: string): string {
  if (r.responseCalls === 0) {
    return 'FAIL: onResponse never ran. The live cut-off needs a chat-endpoint model such as Xialong or GLM 4.6.'
  }
  if (r.wanted === undefined) {
    if (r.responseCalls === 1) return 'INCONCLUSIVE: the whole response arrived at once. Streaming may be off.'
    return 'INCONCLUSIVE: the response ended before two full sentences.'
  }
  const doc = normalize(documentText)
  const wanted = normalize(r.wanted)
  const released = normalize(r.released)
  if (doc.endsWith(wanted)) return 'PASS: exactly the text up to the cut is in the editor.'
  if (doc.includes(wanted)) {
    return `PARTIAL: text after the cut got through: ${quote(doc.slice(doc.lastIndexOf(wanted) + wanted.length).trim(), 120)}`
  }
  if (doc.endsWith(released)) return 'PARTIAL: only the first sentence is in the editor; the second was dropped.'
  if (doc.includes(released)) {
    return `PARTIAL: the first sentence is there, followed by unexpected text: ${quote(doc.slice(doc.lastIndexOf(released) + released.length).trim(), 120)}`
  }
  return 'FAIL: none of the generated text is in the editor.'
}

function formatTurn(r: Run): string {
  const ta = r.taInput
  const taText = ta
    ? `${ta.mode} ${quote(ta.inputText, 80)}${ta.continuityId === r.continuityId ? '' : ' (from an earlier turn)'}`
    : 'none'
  const visible = r.midStreamVisible === undefined ? 'not checked' : yesNo(r.midStreamVisible)
  return [
    `Turn ${r.step + 1} of ${TECHNIQUES.length}: ${r.technique.label}`,
    ...r.checks.map((c) => `  ${c.label}: ${c.verdict}`),
    `  onResponse calls: ${r.responseCalls} (held back ${r.heldCalls}) | cut at call ${r.cutCall ?? '-'} (final: ${yesNo(r.cutOnFinal)}) | after the cut: ${r.afterCutCalls} calls, ${r.afterCutChars} chars, whole response resent: ${yesNo(r.afterCutResent)}`,
    `  Final call: ${r.finalCall ?? 'never arrived'} | onGenerationEnd: ${yesNo(r.generationEnded)} | first sentence visible mid-stream: ${visible}`,
    `  History node: ${r.nodeBefore ?? '?'} -> ${r.nodeAfter ?? '?'} (latest generation node: ${r.latestGenerationNode ?? 'none'})`,
    `  Model: ${r.model} | max_tokens: ${r.maxTokens ?? 'unknown'} | TA input: ${taText}`,
    r.wanted === undefined
      ? `  Released: ${quote(r.released, 200)} (never reached the cut)`
      : `  Should remain: ${quote(r.wanted, 240)}`,
  ].join('\n')
}

function formatReport(turns: string[], step: number, latest: Run): string {
  const lines = [
    `Text Adventure+ stop test (v${api.v1.script.version}): ${Math.min(step, TECHNIQUES.length)} of ${TECHNIQUES.length} turns done`,
    '',
    ...turns.filter(Boolean).flatMap((turn) => [turn, '']),
    'Latest turn, context sent to the AI:',
    ...(latest.context ?? ['(not recorded)']),
    '',
    'Latest turn, end of document:',
    ...latest.documentTail,
  ]
  // The panel shows this through a {{storage}} template, so keep story text from looking like one.
  return lines.join('\n').replace(/\{\{/g, '{ {')
}

async function readDocument(): Promise<{ text: string; tail: string[] }> {
  const sections = await api.v1.document.scan()
  const text = sections.map(({ section }) => section.text).join('\n')
  const tail = sections.slice(-5).map(({ section }) => {
    const origins = [...new Set(section.origin.map((o) => o.data))].join('+') || 'none'
    return `[${section.source ?? 'story'} | ${origins}] ${quote(section.text, 160)}`
  })
  return { text, tail }
}

function summarizeMessages(messages: Message[]): string[] {
  return messages.map((m, i) => {
    const content = m.content ?? ''
    return `#${i} ${m.role}, ${content.length} chars: starts ${quote(content.slice(0, 80), 80)} … ends ${quote(content, 160)}`
  })
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** JSON-quotes the end of `text` (where the interesting part usually is), so whitespace is visible. */
function quote(text: string, max: number): string {
  return JSON.stringify(text.length > max ? '…' + text.slice(-max) : text)
}

function yesNo(value: boolean | undefined): string {
  return value ? 'yes' : 'no'
}

function toast(message: string, type: 'info' | 'success' | 'warning'): Promise<void> {
  return api.v1.ui.toast(message, { type })
}

export function diagnosticsSection(): UIPart {
  return {
    type: 'collapsibleSection',
    title: 'Diagnostics: stop test',
    iconId: 'activity',
    content: [
      { type: 'text', markdown: true, text: HELP },
      {
        type: 'checkboxInput',
        label: 'Run the stop test on my next three turns',
        storageKey: `story:${KEYS.diagArmed}`,
        onChange: (on) => {
          if (on) resetTest().catch(logError)
        },
      },
      {
        type: 'button',
        text: 'Copy report',
        iconId: 'copy',
        callback: () => copyReport().catch(logError),
      },
      {
        type: 'text',
        text: `{{story:${KEYS.diagReport}}}`,
        style: { whiteSpace: 'pre-wrap', fontSize: '0.85em' },
      },
    ],
  }
}
