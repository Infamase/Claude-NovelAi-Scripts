// A minimal stand-in for NovelAI's `api.v1`, enough to run the script's hooks in Node.
// The streaming emulation follows the documented onResponse rules: unseen chunks are resent on the
// next call, and on the final call everything is placed regardless of seenData. The options switch
// on behaviours NovelAI might have but doesn't document, so tests can check the script copes.

type Hooks = Record<string, (params: any) => any>
type Section = { text: string; source?: string; origin: { data: string }[] }

export type MockOptions = {
  /** Whether text returned together with stopGeneration reaches the editor. */
  placeTextOnStop?: boolean
  /** Whether a script stop throws away everything the generation placed. */
  discardOnStop?: boolean
  /** Whether one more (final) onResponse call still arrives after a script stop. */
  finalAfterStop?: boolean
  /** Whether the final call carries the whole response and replaces what was streamed. */
  finalResendsAll?: boolean
  /** Whether onGenerationEnd fires after a script stopped the generation. */
  endAfterStop?: boolean
}

export function installMockApi(options: MockOptions = {}) {
  const hooks: Hooks = {}
  const story = new Map<string, unknown>()
  const timers: (() => void)[] = []
  const toasts: string[] = []
  const sections: Section[] = []
  // Like NovelAI: register replaces all of the script's extensions, update adds or merges by id.
  const extensions = new Map<string, any>()
  let unnamed = 0
  const keyOf = (extension: any) => extension.id ?? `unnamed-${unnamed++}`
  let historyNode = 1
  let latestGenerationNode: number | undefined

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
      generationParameters: { get: async () => ({ model: 'xialong-v1', max_tokens: 256 }) },
      timers: {
        setTimeout: async (callback: () => void) => timers.push(callback),
      },
      document: {
        scan: async () =>
          sections.map((section, index) => ({ sectionId: index + 1, index, section: { formatting: [], ...section } })),
        history: {
          currentNodeId: async () => historyNode,
          mostRecentGenerationNodeId: async () => latestGenerationNode,
        },
      },
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

  function restore(snapshot: Section[]) {
    sections.splice(0, sections.length, ...structuredClone(snapshot))
  }

  return {
    hooks,
    story,
    toasts,
    sections,
    extensions,
    runTimers: async () => {
      for (const callback of timers.splice(0)) await callback()
      await new Promise((resolve) => setTimeout(resolve, 0))
    },

    /** Plays one Text Adventure turn: the input, context building, then the streamed response. */
    async playTurn(input: string, chunks: string[], batchSize = 1) {
      const continuityId = `turn-${Math.random()}`
      const model = 'xialong-v1'
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

      const before = structuredClone(sections)
      const respond = async (text: string[], final: boolean) =>
        (await hooks.onResponse?.({ continuityId, model, final, text, logprobs: [], tokenIds: text.map(() => []) })) ?? {}

      let unseen: string[] = []
      let stopped = false
      for (let i = 0; i < chunks.length; i += batchSize) {
        const final = i + batchSize >= chunks.length
        const text = final && options.finalResendsAll ? chunks : [...unseen, ...chunks.slice(i, i + batchSize)]
        const result = await respond(text, final)
        const out: string[] = result.text ?? text
        if (final && options.finalResendsAll) {
          restore(before)
          place(out.join(''))
          break
        }
        if (result.stopGeneration) {
          stopped = true
          if (options.discardOnStop) restore(before)
          else if (options.placeTextOnStop ?? true) place(out.join(''))
          if (options.finalAfterStop && !final) {
            const last = options.finalResendsAll ? chunks : chunks.slice(i + batchSize, i + 2 * batchSize)
            const lastOut: string[] = (await respond(last, true)).text ?? last
            if (options.finalResendsAll) restore(before)
            if (!options.discardOnStop) place(lastOut.join(''))
          }
          break
        }
        const seen = final || result.seenData === undefined || result.seenData === true
          ? out.length
          : result.seenData === false ? 0 : result.seenData
        place(out.slice(0, seen).join(''))
        unseen = out.slice(seen)
      }

      if (JSON.stringify(sections) !== JSON.stringify(before)) latestGenerationNode = ++historyNode
      if (!stopped || (options.endAfterStop ?? true)) await hooks.onGenerationEnd?.({ continuityId, model })
    },
  }
}

/** Splits text into word-sized chunks, the way a token stream arrives. */
export function tokenize(text: string): string[] {
  return text.match(/\s*\S+/g) ?? []
}
