// Phase 0 stop test: learns how NovelAI handles a script cutting a streamed generation short.
//
// The user arms the test from the sidebar and it runs on the next generation in this story. The
// script holds text back until the first sentence is complete, lets that sentence through with
// `seenData`, then sends the second sentence together with `stopGeneration`. Afterwards it checks
// what actually reached the editor, and records how the TA input and the context looked.

import { chunksCovering, findSentenceEnd, truncateChunks } from '../guard/text.ts'
import { KEYS, logError } from '../keys.ts'

type TaInput = { continuityId: string; mode: string; inputText: string; rawInputText: string }

type Run = {
  continuityId: string
  startedAt: string
  model: string
  scriptInitiated: boolean
  maxTokens?: number
  taInput?: TaInput
  context?: string[]
  responseCalls: number
  heldCalls: number
  released: string
  cutText?: string
  cutOnFinal?: boolean
  callsAfterStop: number
  endedEarly: boolean
  finalSeen: boolean
  generationEnded: boolean
}

const HELP = [
  'Checks how NovelAI reacts when the script cuts a response short. The result decides how Phase 1 is built.',
  '',
  '1. Tick the box below.',
  '2. Take one normal turn with the Do/Say box. Pick an action that should get several sentences back.',
  '3. The script lets the first sentence through, cuts the response after the second, and checks what reached the editor.',
  '4. Press **Copy report** and paste the report to Claude.',
  '',
  'The turn will look cut short. That is expected; undo it afterwards if you like.',
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

  api.v1.hooks.register('onGenerationRequested', async ({ continuityId, model, scriptInitiated }) => {
    if ((await api.v1.storyStorage.get(KEYS.diagArmed)) !== true) return
    const settings = await api.v1.generationParameters.get().catch(() => undefined)
    run = {
      continuityId,
      startedAt: new Date().toISOString(),
      model,
      scriptInitiated,
      maxTokens: settings?.max_tokens,
      taInput: lastTaInput,
      responseCalls: 0,
      heldCalls: 0,
      released: '',
      callsAfterStop: 0,
      endedEarly: false,
      finalSeen: false,
      generationEnded: false,
    }
  })

  api.v1.hooks.register('onContextBuilt', ({ continuityId, dryRun, messages }) => {
    if (run?.continuityId === continuityId && !dryRun) run.context = summarizeMessages(messages)
  })

  api.v1.hooks.register('onResponse', onResponse)

  api.v1.hooks.register('onGenerationEnd', async ({ continuityId }) => {
    if (!run || run.continuityId !== continuityId) return
    run.generationEnded = true
    await finish(run)
  })
}

const onResponse: OnResponse = ({ continuityId, text, final }) => {
  const r = run
  if (!r || r.continuityId !== continuityId) return
  r.responseCalls++
  if (final) r.finalSeen = true

  if (r.cutText !== undefined) {
    r.callsAfterStop++
    return { text: text.map(() => ''), stopGeneration: true }
  }
  if (r.endedEarly) return

  const joined = text.join('')
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

  r.cutText = joined.slice(0, end)
  r.cutOnFinal = final
  // In case onGenerationEnd doesn't fire after a script stop, check the document anyway.
  api.v1.timers
    .setTimeout(() => {
      if (!r.generationEnded) finish(r).catch(logError)
    }, 3000)
    .catch(logError)
  return { text: truncateChunks(text, end), stopGeneration: true }
}

async function finish(r: Run): Promise<void> {
  const doc = await readDocument()
  const verdict = judge(r, doc.text)
  await api.v1.storyStorage.set(KEYS.diagReport, formatReport(r, verdict, doc.tail))
  await api.v1.storyStorage.set(KEYS.diagLastRun, r)
  const conclusive = r.cutText !== undefined || r.responseCalls === 0
  if (conclusive) await api.v1.storyStorage.set(KEYS.diagArmed, false)
  await api.v1.ui.toast(
    conclusive
      ? 'Stop test finished. The report is in the Text Adventure+ sidebar panel.'
      : 'Stop test inconclusive. It is still armed; see the sidebar panel.',
    { type: conclusive ? 'success' : 'warning' },
  )
}

async function recheck(): Promise<void> {
  const r = run ?? ((await api.v1.storyStorage.get(KEYS.diagLastRun)) as Run | null | undefined)
  if (!r) {
    await api.v1.ui.toast('No stop test has run in this story yet.', { type: 'info' })
    return
  }
  await finish(r)
}

async function copyReport(): Promise<void> {
  const granted = await api.v1.permissions.request(
    'clipboardWrite',
    'Text Adventure+ needs clipboard access to copy the stop test report.',
  )
  if (!granted) return
  const report = await api.v1.storyStorage.get(KEYS.diagReport)
  await api.v1.clipboard.writeText(String(report ?? ''))
  await api.v1.ui.toast('Report copied.', { type: 'success' })
}

function judge(r: Run, documentText: string): string {
  if (r.responseCalls === 0) {
    return 'FAIL: onResponse never ran. The live cut-off needs GLM 4.6; check which model this story uses.'
  }
  if (r.cutText === undefined) {
    if (r.responseCalls === 1) {
      return 'INCONCLUSIVE: the whole response arrived at once. Streaming may be off; turn it on and take another turn.'
    }
    return 'INCONCLUSIVE: the response ended before two full sentences. The test is still armed; take another, longer turn.'
  }
  const doc = normalize(documentText)
  const released = normalize(r.released)
  const cut = normalize(r.cutText)
  if (doc.endsWith(normalize(r.released + r.cutText))) {
    return 'PASS: the early text stayed, the trimmed text sent with the stop landed, and nothing came after the cut.'
  }
  const at = released ? doc.lastIndexOf(released) : -1
  if (at < 0) {
    return 'UNKNOWN: the text released before the cut is not in the document. Was the story edited or undone before the check?'
  }
  const after = doc.slice(at + released.length).trim()
  if (after === '') return 'PARTIAL: the early text landed, but the trimmed text sent with the stop was dropped.'
  if (after.startsWith(cut)) {
    return `PARTIAL: the stop did not fully halt. Extra text came after the cut point: ${quote(after.slice(cut.length), 120)}`
  }
  return `UNKNOWN: unexpected text after the early part: ${quote(after, 120)}`
}

function formatReport(r: Run, verdict: string, documentTail: string[]): string {
  const yesNo = (value: boolean) => (value ? 'yes' : 'no')
  const ta = r.taInput
  const lines = [
    `Text Adventure+ stop test (v${api.v1.script.version})`,
    `Run: ${r.startedAt}`,
    `Result: ${verdict}`,
    '',
    `Model: ${r.model} | max_tokens: ${r.maxTokens ?? 'unknown'} | script-initiated: ${yesNo(r.scriptInitiated)}`,
    `onResponse calls: ${r.responseCalls} (held back ${r.heldCalls}, after stop ${r.callsAfterStop}) | final call seen: ${yesNo(r.finalSeen)} | onGenerationEnd fired: ${yesNo(r.generationEnded)}`,
    `Released before cut: ${quote(r.released, 200)}`,
    `Sent with stop: ${r.cutText === undefined ? '(never reached)' : quote(r.cutText, 200)} | on final call: ${yesNo(r.cutOnFinal === true)}`,
    ta
      ? `TA input: ${ta.mode} | input ${quote(ta.inputText, 80)} | raw ${quote(ta.rawInputText, 80)} | same turn: ${yesNo(ta.continuityId === r.continuityId)}`
      : 'TA input: none recorded',
    '',
    'Context sent to the AI:',
    ...(r.context ?? ['(not recorded)']),
    '',
    'End of document:',
    ...documentTail,
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

export function diagnosticsSection(): UIPart {
  return {
    type: 'collapsibleSection',
    title: 'Diagnostics: stop test',
    iconId: 'activity',
    content: [
      { type: 'text', markdown: true, text: HELP },
      {
        type: 'checkboxInput',
        label: 'Run the stop test on my next turn',
        storageKey: `story:${KEYS.diagArmed}`,
      },
      {
        type: 'row',
        spacing: 'start',
        content: [
          {
            type: 'button',
            text: 'Check result now',
            iconId: 'refresh',
            disabledWhileCallbackRunning: true,
            callback: () => recheck().catch(logError),
          },
          {
            type: 'button',
            text: 'Copy report',
            iconId: 'copy',
            callback: () => copyReport().catch(logError),
          },
        ],
      },
      {
        type: 'text',
        text: `{{story:${KEYS.diagReport}}}`,
        style: { whiteSpace: 'pre-wrap', fontSize: '0.85em' },
      },
    ],
  }
}
