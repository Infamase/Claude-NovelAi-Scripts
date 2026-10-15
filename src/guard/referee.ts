// The referee: a tiny second AI call that finds the first sentence of a reply that writes for the
// player character. It catches what patterns can't, such as an unattributed line of the player's
// speech or an unmarked thought.

const TIMEOUT_MS = 12000
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
  error?: string
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

export async function askReferee(model: string, input: RefereeInput): Promise<RefereeResult> {
  const started = Date.now()
  const elapsed = () => Date.now() - started
  if (api.v1.script.getAllowedOutput() < MAX_OUTPUT_TOKENS) {
    return { raw: '', ms: 0, error: "the script's generation allowance is used up for now" }
  }
  const signal = await api.v1.createCancellationSignal()
  try {
    const request = api.v1.generate(
      refereePrompt(input),
      { model, max_tokens: MAX_OUTPUT_TOKENS, temperature: 0, enable_thinking: false },
      undefined,
      'background',
      signal,
    )
    request.catch(() => {}) // a late failure after the timeout has nobody waiting for it
    // Never let a stuck call hold up the reply: give up after the timeout either way.
    const timeout = new Promise<'timeout'>((resolve) => {
      api.v1.timers.setTimeout(() => resolve('timeout'), TIMEOUT_MS).catch(() => resolve('timeout'))
    })
    const response = await Promise.race([request, timeout])
    if (response === 'timeout') {
      signal.cancel().catch(() => {})
      return { raw: '', ms: elapsed(), error: `no answer within ${TIMEOUT_MS / 1000} s` }
    }
    const raw = response.choices[0]?.text ?? ''
    const answer = parseRefereeAnswer(raw, input.sentences.length)
    return answer === undefined
      ? { raw, ms: elapsed(), error: `unreadable answer ${JSON.stringify(raw.slice(0, 40))}` }
      : { answer, raw, ms: elapsed() }
  } catch (error) {
    return { raw: '', ms: elapsed(), error: error instanceof Error ? error.message : String(error) }
  } finally {
    signal.dispose()
  }
}
