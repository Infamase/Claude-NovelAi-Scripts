// The narration rules added to the context before each reply. Pure functions.

export function narratorRules(strict: boolean): string {
  const playerCharacter = strict
    ? '- Never write anything the player character says, thinks, feels, decides or does beyond what the player typed. Describe only the world and the other characters.'
    : '- Never write the player character\'s speech, thoughts, conclusions, decisions or deliberate actions beyond what the player typed. Involuntary physical reactions (a flinch, a cough, a racing heart) are fine.'
  return [
    '[ Narration rules for this reply:',
    '- Write only what happens because of the player\'s latest input: how the world, the other characters and any companions respond, and what the player character sees and hears.',
    playerCharacter,
    '- Stop as soon as the player character would need to speak, act or decide. End on the world, never on a question: do not ask what the player does, offer choices or address the player. ]',
  ].join('\n')
}

/**
 * Returns a copy of the context with the rules appended to the latest user message, which in Text
 * Adventure is the player's input. Without a user message, the rules go in the system prompt.
 */
export function withRules(messages: Message[], rules: string): Message[] {
  const result = messages.map((m) => ({ ...m }))
  let target = -1
  for (let i = result.length - 1; i >= 0 && target < 0; i--) if (result[i].role === 'user') target = i
  if (target < 0) target = result.findIndex((m) => m.role === 'system')
  if (target < 0) return [{ role: 'system', content: rules }, ...result]
  const content = result[target].content ?? ''
  result[target].content = content ? `${content}\n\n${rules}` : rules
  return result
}

/** The player's latest input and the story just before it, as the context presents them. */
export function turnContext(messages: Message[]): { playerInput?: string; storyTail?: string } {
  let lastStory = -1
  for (let i = messages.length - 1; i >= 0 && lastStory < 0; i--) {
    if (messages[i].role === 'assistant' && (messages[i].content ?? '').trim()) lastStory = i
  }
  let playerInput: string | undefined
  for (let i = messages.length - 1; i > lastStory && playerInput === undefined; i--) {
    if (messages[i].role === 'user') playerInput = messages[i].content
  }
  const story = lastStory >= 0 ? messages[lastStory].content ?? '' : ''
  return { playerInput, storyTail: story.slice(-1200) || undefined }
}
