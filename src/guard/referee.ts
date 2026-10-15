// The referee: a tiny second AI call that finds the first sentence of a reply that writes for the
// player character. It catches what patterns can't, such as an unattributed line of the player's
// speech or an unmarked thought.

const TIMEOUT_MS = 10000
const MAX_OUTPUT_TOKENS = 8

export type RefereeInput = {
  storyTail?: string
  playerInput?: string
  sentences: string[]
  strict: boolean
}

export type RefereeResult = {
  /** 1-based number of the first offending sentence, or 0 if none. Missing if there was no usable answer. */
  answer?: number
  /** How many opening sentences retell the player's own action in a way that breaks the rule (to remove). */
  retold?: number
  raw: string
  ms: number
  /** The model that answered. */
  model?: string
  /** Attempts that failed before the one that answered. */
  failedFirst?: string
  error?: string
}

type Attempt = { model: string; params: Omit<GenerationParams, 'model'> }

/** The attempt that last worked, tried first from then on. */
let working: Attempt | undefined
let running = false

/** Whether a referee call is in flight, so the guard can ignore any generation it causes. */
export function isRefereeRunning(): boolean {
  return running
}

export function refereePrompt({ storyTail, playerInput, sentences, strict }: RefereeInput): Message[] {
  // Playtesting showed the referee flagging "Your mouth goes dry." with reactions allowed, so the
  // allowed cases are spelled out with examples, and flagging needs a clear break of the rule.
  const allowed = strict
    ? 'Allowed: carrying out exactly what the player typed, and what the player character sees and hears. Nothing else about the player character, not even physical reactions or sensations.'
    : 'Allowed, and never a reason to flag a sentence: carrying out what the player typed; what the player character sees, hears, smells or physically feels; and involuntary bodily reactions and sensations, such as a dry mouth, a racing heart, a flinch, a shiver, a tightening chest, or feeling heat or pressure.'
  const user = [
    'Story just before the player\'s turn:',
    '"""',
    storyTail?.trim() || '(start of story)',
    '"""',
    '',
    'The player typed:',
    '"""',
    playerInput?.trim() || '(nothing; the story just continues)',
    '"""',
    '',
    'The narrator replied with these sentences:',
    ...sentences.map((s, i) => `${i + 1}. ${s.trim()}`),
    '',
    'The narrator writes for the player character when a sentence contains any of:',
    '- the player character speaking, including quoted lines that are the player character\'s words even when no speaker is named',
    '- the player character\'s thoughts, questions to themselves, conclusions or plans',
    '- the player character deciding something, or doing something deliberate that the player did not type',
    '- another character reacting to an answer or action from the player character that never happened, which means the narrator skipped past the player\'s turn',
    '- asking the player what they do, offering them choices, or speaking to the player directly',
    allowed,
    '',
    'Replies sometimes open by retelling the player\'s own action, for example the player character saying the line the player typed, with thoughts or feelings added. If such an opening breaks the rule, it will be removed and the rest of the reply can still be used.',
    '',
    'Answer with two numbers separated by a space, and nothing else:',
    '- first: if the reply opens with a retelling of the player\'s action that breaks the rule, the number of the sentence where that opening ends; otherwise 0',
    '- second: the first sentence after that opening where the narrator writes for the player character; otherwise 0',
    'For example, "0 0" means every sentence is fine, "0 4" means sentence 4 is the first problem, "2 0" means sentences 1 and 2 retell the player\'s action in a way that breaks the rule and the rest is fine, and "2 5" means the same with sentence 5 as the next problem.',
    'Only flag a sentence that clearly breaks the rule.',
  ].join('\n')
  return [
    {
      role: 'system',
      content:
        'You are a strict referee for a second-person text adventure. The player controls the character called "you". The narrator may describe the world and the other characters, but must never write for the player character.',
    },
    { role: 'user', content: user },
  ]
}

/** Reads the referee's answer: a sentence number from 1 to `count`, 0 for none, or undefined. */
/**
 * Reads the referee's answer: where an opening retelling ends (0 for none) and the first offending
 * sentence after it (0 for none), each from 1 to `count`. A single number is the offending sentence.
 */
export function parseRefereeAnswer(raw: string, count: number): { retold: number; flagged: number } | undefined {
  const text = raw.trim().toLowerCase()
  if (/^(?:none|no\b)/.test(text)) return { retold: 0, flagged: 0 }
  const numbers = (text.match(/\d+/g) ?? []).map(Number)
  if (numbers.length === 0) return undefined
  const [retold, flagged] = numbers.length === 1 ? [0, numbers[0]] : numbers
  if (retold > count || flagged > count) return undefined
  // A flagged sentence inside the retelling goes anyway, with the retelling.
  return { retold, flagged: flagged > retold ? flagged : 0 }
}

/**
 * The referee tries GLM 4.6 (which script generation officially supports), then the story's own
 * model, then that model without the thinking switch. Whatever works is remembered.
 */
function attempts(storyModel: string): Attempt[] {
  const base = { max_tokens: MAX_OUTPUT_TOKENS, temperature: 0 }
  const list: Attempt[] = [
    ...(working ? [working] : []),
    // GLM 4.6 first: while a reply is being written, NovelAI can refuse a second generation with the
    // story's own model ("Error 429: Concurrent generation is locked", seen with Xialong).
    { model: 'glm-4-6', params: { ...base, enable_thinking: false } },
    { model: storyModel, params: { ...base, enable_thinking: false } },
    { model: storyModel, params: base },
  ]
  const seen = new Set<string>()
  return list.filter((a) => {
    const key = JSON.stringify(a)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function askReferee(storyModel: string, input: RefereeInput): Promise<RefereeResult> {
  const started = Date.now()
  const elapsed = () => Date.now() - started
  if (api.v1.script.getAllowedOutput() < MAX_OUTPUT_TOKENS) {
    return { raw: '', ms: 0, error: "the script's AI allowance is used up for now" }
  }
  const messages = refereePrompt(input)
  const errors: string[] = []
  running = true
  try {
    for (const attempt of attempts(storyModel)) {
      const label = `${attempt.model}${'enable_thinking' in attempt.params ? '' : ' without the thinking switch'}`
      const outcome = await generateOnce(attempt, messages)
      if (outcome.timedOut) {
        // A hang won't get better with other settings; give up rather than make the player wait.
        errors.push(`${label}: no answer within ${TIMEOUT_MS / 1000} s`)
        break
      }
      if (outcome.error !== undefined) {
        errors.push(`${label}: ${outcome.error}`)
        continue
      }
      working = attempt
      const raw = outcome.text ?? ''
      const parsed = parseRefereeAnswer(raw, input.sentences.length)
      const failedFirst = errors.length ? errors.join('; ') : undefined
      return parsed === undefined
        ? { raw, ms: elapsed(), model: attempt.model, failedFirst, error: `unreadable answer ${JSON.stringify(raw.slice(0, 40))}` }
        : { answer: parsed.flagged, retold: parsed.retold, raw, ms: elapsed(), model: attempt.model, failedFirst }
    }
    return { raw: '', ms: elapsed(), error: errors.join('; ') }
  } finally {
    running = false
  }
}

async function generateOnce(
  attempt: Attempt,
  messages: Message[],
): Promise<{ text?: string; error?: string; timedOut?: boolean }> {
  const signal = await api.v1.createCancellationSignal()
  try {
    const request = api.v1.generate(messages, { model: attempt.model, ...attempt.params }, undefined, 'background', signal)
    request.catch(() => {}) // a late failure after the timeout has nobody waiting for it
    // Never let a stuck call hold up the reply: give up after the timeout either way.
    const timeout = new Promise<'timeout'>((resolve) => {
      api.v1.timers.setTimeout(() => resolve('timeout'), TIMEOUT_MS).catch(() => resolve('timeout'))
    })
    const response = await Promise.race([request, timeout])
    if (response === 'timeout') {
      signal.cancel().catch(() => {})
      return { timedOut: true }
    }
    return { text: response.choices[0]?.text ?? '' }
  } catch (error) {
    return { error: describeError(error) }
  } finally {
    signal.dispose()
  }
}

/** Turns whatever was thrown into readable text. NovelAI may throw plain objects, not Errors. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const fields = error as Record<string, unknown>
    const message = [fields.message, fields.error, fields.reason, fields.statusText].find((v) => typeof v === 'string')
    const status = fields.status ?? fields.statusCode ?? fields.code
    if (typeof message === 'string') return status === undefined ? message : `${message} (${String(status)})`
    try {
      return JSON.stringify(error).slice(0, 300)
    } catch {
      // fall through
    }
  }
  return String(error)
}
