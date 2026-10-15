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
  raw: string
  ms: number
  /** The model that answered. */
  model?: string
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
  const allowed = strict
    ? 'Allowed: carrying out exactly what the player typed, and what the player character sees and hears. Nothing else about the player character, not even physical reactions.'
    : 'Allowed: carrying out what the player typed, what the player character sees and hears, and involuntary physical reactions such as a flinch or a racing heart.'
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
    'Which is the first sentence where the narrator writes for the player character? That means any of:',
    '- the player character speaking, including quoted lines that are the player character\'s words even when no speaker is named',
    '- the player character\'s thoughts, questions to themselves, conclusions or plans',
    '- the player character deciding something, or doing something deliberate that the player did not type',
    '- asking the player what they do, offering them choices, or speaking to the player directly',
    allowed,
    '',
    'Answer with the sentence number only, or 0 if no sentence breaks the rule.',
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
export function parseRefereeAnswer(raw: string, count: number): number | undefined {
  const text = raw.trim().toLowerCase()
  if (/^(?:none|no\b)/.test(text)) return 0
  const match = /\d+/.exec(text)
  if (!match) return undefined
  const answer = Number(match[0])
  return answer <= count ? answer : undefined
}

/**
 * Script generation officially supports GLM 4.6, so after the story's own model the referee tries
 * GLM 4.6, then the story's model without the thinking switch. Whatever works is remembered.
 */
function attempts(storyModel: string): Attempt[] {
  const base = { max_tokens: MAX_OUTPUT_TOKENS, temperature: 0 }
  const list: Attempt[] = [
    ...(working ? [working] : []),
    { model: storyModel, params: { ...base, enable_thinking: false } },
    { model: 'glm-4-6', params: { ...base, enable_thinking: false } },
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
      const answer = parseRefereeAnswer(raw, input.sentences.length)
      return answer === undefined
        ? { raw, ms: elapsed(), model: attempt.model, error: `unreadable answer ${JSON.stringify(raw.slice(0, 40))}` }
        : { answer, raw, ms: elapsed(), model: attempt.model }
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
