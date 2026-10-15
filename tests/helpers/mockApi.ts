// A minimal stand-in for NovelAI's `api.v1`, enough to run the script's hooks in Node.
// The streaming emulation follows the documented onResponse rules: unseen chunks are resent on the
// next call, and on the final call everything is placed regardless of seenData.

type Hooks = Record<string, (params: any) => any>

export type MockOptions = {
  /** Whether text returned together with stopGeneration reaches the editor (what the stop test measures). */
  placeTextOnStop?: boolean
  /** Whether onGenerationEnd fires after a script stopped the generation. */
  endAfterStop?: boolean
}

export function installMockApi(options: MockOptions = {}) {
  const hooks: Hooks = {}
  const story = new Map<string, unknown>()
  const timers: (() => void)[] = []
  const toasts: string[] = []
  const sections: { text: string; source?: string; origin: { data: string }[] }[] = []

  const storage = {
    get: async (key: string) => (story.has(key) ? structuredClone(story.get(key)) : undefined),
    set: async (key: string, value: unknown) => void story.set(key, structuredClone(value)),
    setIfAbsent: async (key: string, value: unknown) => {
      if (story.has(key)) return false
      story.set(key, value)
      return true
    },
  }

  ;(globalThis as any).api = {
    v1: {
      script: { version: '0.0.0-test' },
      log: () => {},
      error: (...messages: unknown[]) => console.error(...messages),
      hooks: { register: (name: string, callback: (params: any) => any) => void (hooks[name] = callback) },
      storyStorage: storage,
      generationParameters: { get: async () => ({ model: 'glm-4-6', max_tokens: 150 }) },
      timers: {
        setTimeout: async (callback: () => void) => timers.push(callback),
      },
      document: {
        scan: async () =>
          sections.map((section, index) => ({ sectionId: index + 1, index, section: { formatting: [], ...section } })),
      },
      ui: { toast: async (message: string) => void toasts.push(message) },
    },
  }

  function place(text: string) {
    const [first, ...rest] = text.split('\n')
    sections[sections.length - 1].text += first
    for (const line of rest) sections.push({ text: line, source: 'story', origin: [{ data: 'ai' }] })
  }

  return {
    hooks,
    story,
    toasts,
    sections,
    runTimers: async () => {
      for (const callback of timers.splice(0)) await callback()
      await new Promise((resolve) => setTimeout(resolve, 0))
    },

    /** Plays one Text Adventure turn: the input, context building, then the streamed response. */
    async playTurn(input: string, chunks: string[], batchSize = 1) {
      const continuityId = `turn-${Math.random()}`
      const model = 'glm-4-6'
      await hooks.onTextAdventureInput?.({ continuityId, inputText: input, rawInputText: input, mode: 'action' })
      sections.push({ text: `> You ${input}.`, source: 'action', origin: [{ data: 'user' }] })
      sections.push({ text: '', source: 'story', origin: [{ data: 'ai' }] })
      const request = await hooks.onGenerationRequested?.({ continuityId, model, scriptInitiated: false })
      if (request?.stopGeneration) return
      await hooks.onContextBuilt?.({
        continuityId,
        model,
        dryRun: false,
        messages: [
          { role: 'system', content: 'You are a narrator.' },
          { role: 'assistant', content: sections.map((s) => s.text).join('\n') },
        ],
      })

      let unseen: string[] = []
      let stopped = false
      for (let i = 0; i < chunks.length && !stopped; i += batchSize) {
        const final = i + batchSize >= chunks.length
        const text = [...unseen, ...chunks.slice(i, i + batchSize)]
        const result = await hooks.onResponse?.({
          continuityId,
          model,
          final,
          text,
          logprobs: [],
          tokenIds: text.map(() => []),
        })
        const out: string[] = result?.text ?? text
        if (result?.stopGeneration) {
          if (options.placeTextOnStop ?? true) place(out.join(''))
          stopped = true
          break
        }
        const seen = final || result?.seenData === undefined || result.seenData === true
          ? out.length
          : result.seenData === false ? 0 : result.seenData
        place(out.slice(0, seen).join(''))
        unseen = out.slice(seen)
      }
      if (!stopped || (options.endAfterStop ?? true)) await hooks.onGenerationEnd?.({ continuityId, model })
    },
  }
}

/** Splits text into word-sized chunks, the way a token stream arrives. */
export function tokenize(text: string): string[] {
  return text.match(/\s*\S+/g) ?? []
}
