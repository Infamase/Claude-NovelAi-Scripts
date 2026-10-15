// The narration rules added to the context before each reply. Pure functions.
//
// Playtesting showed the model copies the story's style much more than it follows a bracketed note
// (NovelAI's convention for soft hints like Tags). So the rules are plain numbered instructions
// right after the player's input, which is marked as their action, and the system prompt says
// what kind of story this is.

/** Added to the system prompt. */
export const GAME_FRAMING =
  'This is an interactive text adventure. The user plays the character called "you", and each of their messages is that character\'s next action or line. Reply with only the world\'s response to it: never write for the player character.'

export function narratorRules(strict: boolean): string {
  return [
    'Narrate what happens as a direct result of this, then stop. Rules:',
    '1. Begin with how the world responds. Do not repeat or retell what the player wrote; it is already in the story.',
    '2. Write only the world\'s response: what the other characters and any companions say and do, and what the player character sees and hears.',
    strict
      ? '3. Never write anything the player character says, thinks, feels, decides or does beyond what the player wrote, not even physical reactions.'
      : '3. Never write the player character\'s speech, thoughts, decisions or deliberate actions beyond what the player wrote. Involuntary physical reactions, like a flinch or a racing heart, are fine.',
    '4. Stop at the first moment the player character could speak, act or decide. When someone asks them something or waits for their answer, end the reply there. Never continue a conversation on their behalf, and never have anyone react to an answer they haven\'t given.',
    '5. Stay in this scene: no scene breaks, headings or chapter titles, and no skipping ahead in time.',
    '6. End on the world, never on a question to the player: do not ask what they do, offer choices or address them.',
    '7. Keep it short: one to three short paragraphs.',
  ].join('\n')
}

/** Everything the guard adds to the context, for reserving room for it. */
export function addedText(strict: boolean): string {
  return `\n\n${GAME_FRAMING}\nThe player's action:\n\n\n${narratorRules(strict)}`
}

/**
 * Returns a copy of the context with the game framing added to the system prompt, and the player's
 * latest input marked as their action and followed by the rules. If there is no input this turn
 * (the story just continues), the rules go after the latest user message instead.
 */
export function withRules(messages: Message[], strict: boolean): Message[] {
  const result = messages.map((m) => ({ ...m }))
  const system = result.findIndex((m) => m.role === 'system')
  if (system >= 0) result[system].content = joinParts(result[system].content, GAME_FRAMING)
  else result.unshift({ role: 'system', content: GAME_FRAMING })

  const rules = narratorRules(strict)
  const input = playerInputIndex(result)
  if (input >= 0) {
    result[input].content = `The player's action:\n${result[input].content ?? ''}\n\n${rules}`
    return result
  }
  let lastUser = -1
  for (let i = result.length - 1; i >= 0 && lastUser < 0; i--) if (result[i].role === 'user') lastUser = i
  const target = lastUser >= 0 ? lastUser : 0
  result[target].content = joinParts(result[target].content, rules)
  return result
}

/** The player's latest input and the story just before it, as the context presents them. */
export function turnContext(messages: Message[]): { playerInput?: string; storyTail?: string } {
  const story = lastStoryIndex(messages)
  const input = playerInputIndex(messages)
  const storyText = story >= 0 ? messages[story].content ?? '' : ''
  return {
    playerInput: input >= 0 ? messages[input].content : undefined,
    storyTail: storyText.slice(-1200) || undefined,
  }
}

function lastStoryIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && (messages[i].content ?? '').trim()) return i
  }
  return -1
}

/** The latest user message after the story, which in Text Adventure holds the player's input. */
function playerInputIndex(messages: Message[]): number {
  const story = lastStoryIndex(messages)
  for (let i = messages.length - 1; i > story; i--) {
    if (messages[i].role === 'user') return i
  }
  return -1
}

function joinParts(first: string | undefined, second: string): string {
  return first ? `${first}\n\n${second}` : second
}
