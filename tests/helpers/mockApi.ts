// A minimal stand-in for NovelAI's `api.v1`, enough to run the script's hooks in Node.
//
// It mimics what the Phase 0 stop tests showed about NovelAI (on Xialong):
// - unseen chunks (seenData) are resent on the next call; on the final call everything is placed;
// - a script stop (stopGeneration in onResponse) discards everything the generation produced;
// - the context is system, user (memory), assistant (story), user (latest inputs), empty assistant.

type Hooks = Record<string, (params: any) => any>
type Section = { text: string; source?: string; origin: { data: string }[] }
type Message = { role: 'system' | 'user' | 'assistant'; content?: string }

export type MockOptions = {
  /** What the referee answers (it may throw). Defaults to "0", nothing wrong. */
  referee?: (messages: Message[], params: any) => string | Promise<string>
}

export function installMockApi(options: MockOptions = {}) {
  const hooks: Hooks = {}
  const story = new Map<string, unknown>()
  const account = new Map<string, unknown>()
  const timers: (() => void)[] = []
  const toasts: string[] = []
  const clipboard: string[] = []
  const sections: Section[] = []
  const refereeCalls: { messages: Message[]; params: any }[] = []
  const counts = { editorGenerate: 0 }
  // Like NovelAI: register replaces all of the script's extensions, update adds or merges by id.
  const extensions = new Map<string, any>()
  let unnamed = 0
  const keyOf = (extension: any) => extension.id ?? `unnamed-${unnamed++}`
  const last: { context?: Message[]; contextLimitReduction?: number } = {}

  const storage = (map: Map<string, unknown>) => ({
    get: async (key: string) => (map.has(key) ? structuredClone(map.get(key)) : undefined),
    set: async (key: string, value: unknown) => void map.set(key, structuredClone(value)),
    remove: async (key: string) => void map.delete(key),
    setIfAbsent: async (key: string, value: unknown) => {
      if (map.has(key)) return false
      map.set(key, value)
      return true
    },
  })

  ;(globalThis as any).api = {
    v1: {
      script: { version: '0.0.0-test', getAllowedOutput: () => 2048 },
      log: () => {},
      error: (...messages: unknown[]) => console.error(...messages),
      hooks: { register: (name: string, callback: (params: any) => any) => void (hooks[name] = callback) },
      storage: storage(account),
      storyStorage: storage(story),
      tokenizer: { encode: async (text: string) => text.split(/\s+/) },
      createCancellationSignal: async () => ({ cancelled: false, cancel: async () => {}, dispose: () => {} }),
      generate: async (messages: Message[], params: any) => {
        refereeCalls.push({ messages, params })
        const text = options.referee ? await options.referee(messages, params) : '0'
        return { choices: [{ text, index: 0, token_ids: [] }] }
      },
      generationParameters: { get: async () => ({ model: 'xialong-v1', max_tokens: 256 }) },
      editor: { generate: async () => void counts.editorGenerate++ },
      timers: {
        setTimeout: async (callback: () => void) => timers.push(callback),
      },
      document: {
        scan: async () =>
          sections.map((section, index) => ({ sectionId: index + 1, index, section: { formatting: [], ...section } })),
      },
      permissions: { request: async () => true },
      clipboard: { writeText: async (text: string) => void clipboard.push(text) },
      ui: {
        toast: async (message: string) => void toasts.push(message),
        register: async (list: any[]) => {
          extensions.clear()
          for (const extension of list) extensions.set(keyOf(extension), extension)
        },
        update: async (list: any[]) => {
          for (const extension of list) {
            extensions.set(extension.id, { ...extensions.get(extension.id), ...extension })
          }
        },
        remove: async (ids: string[]) => {
          for (const id of ids) extensions.delete(id)
        },
      },
    },
  }

  function place(text: string) {
    const [first, ...rest] = text.split('\n')
    sections[sections.length - 1].text += first
    for (const line of rest) sections.push({ text: line, source: 'story', origin: [{ data: 'ai' }] })
  }

  /** Runs one generation through the hooks, the way NovelAI does. */
  async function generate(continuityId: string, chunks: string[], batchSize: number, scriptInitiated: boolean) {
    const model = 'xialong-v1'
    // A reply that kept nothing leaves no paragraph behind.
    const lastSection = sections[sections.length - 1]
    if (lastSection?.origin[0]?.data === 'ai' && lastSection.text === '') sections.pop()
    // The context groups the trailing inputs into one user message after the story.
    let firstInput = sections.length
    while (firstInput > 0 && sections[firstInput - 1].origin[0]?.data === 'user') firstInput--
    const storyText = sections.slice(0, firstInput).map((s) => s.text).join('\n')
    const inputs = sections.slice(firstInput).map((s) => s.text).join('\n')
    sections.push({ text: '', source: 'story', origin: [{ data: 'ai' }] })
    const before = structuredClone(sections)

    const request = await hooks.onGenerationRequested?.({ continuityId, model, scriptInitiated })
    if (request?.stopGeneration) return
    const built = await hooks.onBeforeContextBuild?.({ continuityId, model, dryRun: false })
    last.contextLimitReduction = built?.contextLimitReduction
    const messages: Message[] = [
      { role: 'system', content: 'You are Xialong.' },
      { role: 'user', content: 'Relevant persistent information:\n[ Genre: fantasy ]\n***\nWrite.' },
      { role: 'assistant', content: storyText },
      ...(inputs ? [{ role: 'user' as const, content: inputs }] : []),
      { role: 'assistant', content: '' },
    ]
    const context = await hooks.onContextBuilt?.({ continuityId, model, dryRun: false, messages })
    last.context = context?.messages ?? messages

    let unseen: string[] = []
    for (let i = 0; i < chunks.length; i += batchSize) {
      const final = i + batchSize >= chunks.length
      const text = [...unseen, ...chunks.slice(i, i + batchSize)]
      const result =
        (await hooks.onResponse?.({ continuityId, model, final, text, logprobs: [], tokenIds: text.map(() => []) })) ?? {}
      const out: string[] = result.text ?? text
      if (result.stopGeneration) {
        sections.splice(0, sections.length, ...before)
        break
      }
      const seen = final || result.seenData === undefined || result.seenData === true
        ? out.length
        : result.seenData === false ? 0 : result.seenData
      place(out.slice(0, seen).join(''))
      unseen = out.slice(seen)
    }
    await hooks.onGenerationEnd?.({ continuityId, model })
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return {
    hooks,
    story,
    account,
    toasts,
    clipboard,
    sections,
    extensions,
    refereeCalls,
    counts,
    last,
    runTimers: async () => {
      for (const callback of timers.splice(0)) await callback()
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
    /** Waits for fire-and-forget work (like the last-turn report) to finish. */
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),

    /** Plays one Text Adventure turn: the input, then a generation. */
    async playTurn(input: string, chunks: string[], batchSize = 1) {
      const continuityId = `turn-${Math.random()}`
      await hooks.onTextAdventureInput?.({ continuityId, inputText: input, rawInputText: input, mode: 'action' })
      sections.push({ text: input, source: 'action', origin: [{ data: 'user' }] })
      await generate(continuityId, chunks, batchSize, false)
    },

    /** Plays a generation started by a script (such as the guard's retry), with no new input. */
    async playRetry(chunks: string[], batchSize = 1) {
      await generate(`retry-${Math.random()}`, chunks, batchSize, true)
    },

    /** The text the last turn added to the story. */
    lastReply() {
      const index = sections.findLastIndex((s) => s.origin[0]?.data === 'user')
      return sections.slice(index + 1).map((s) => s.text).join('\n')
    },
  }
}

/** Splits text into word-sized chunks, the way a token stream arrives. */
export function tokenize(text: string): string[] {
  return text.match(/\s*\S+/g) ?? []
}
