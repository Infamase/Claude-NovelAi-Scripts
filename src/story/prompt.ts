// What Story Adventure+ adds to the context: the point-of-view rule and the writing guide in the
// system prompt, and the game state with a short reminder just before the story. Pure functions.
//
// Text Adventure+'s playtests showed the model copies the story's own style more than it follows
// instructions, so the rule says to hold to it even where earlier text slips, and the reminder sits
// right before the story, where it is read last.

/** Added to the system prompt when "Second person, present tense" is on. */
export const POV_RULE =
  'Point of view and tense: second person, present tense. In the narration the protagonist is always "you" (never "I", never their name, never "he", "she" or "they"), and events happen now: "You push the door open," not "You pushed the door open." Other characters are "he", "she" or "they" as usual. Hold to this in every sentence of narration, even where earlier parts of the story slip. Dialogue is free: characters talk in whatever person and tense comes naturally to them.'

/** The default writing guide, added to the system prompt. The player can edit it in the sidebar. */
export const DEFAULT_GUIDE = [
  'You are co-writing an interactive story with the user. Continue it from exactly where the text stops, even mid-sentence, without repeating or retelling anything already written. Write like a skilled novelist: specific, vivid, controlled and easy to read.',
  '',
  'Craft:',
  '- Be concrete. Name the real thing ("a chipped clay mug", not "a vessel"), and choose the one telling detail over three generic ones. Use sound, smell, touch and temperature, not only sight.',
  '- Prefer plain, strong verbs and nouns. Cut filler adverbs and stacked adjectives. Choose the simple word over the fancy one.',
  "- Vary sentence length and shape. Don't start sentence after sentence the same way, don't list things in threes by habit, and don't end each paragraph on a one-line punchline.",
  "- Show, then trust the reader. Let action, dialogue and detail carry the feeling; don't name the emotion afterwards or explain what a moment means.",
  '- Make dialogue sound like people: contractions, interruptions, dodged questions, subtext. Give each character their own voice. Nobody makes speeches about their feelings or recaps what just happened.',
  "- Give characters their own wants, and let them act on them. They can refuse, lie, misread you, lose their temper or be busy with something else. Not everyone is kind, impressed or agreeable, and problems don't solve themselves.",
  "- Stay in the scene, moment to moment, and let tension last. Don't summarize, skip ahead or wrap things up.",
  "- Stop where the action pauses. Never end on a reflection, a moral, a hint of what's to come, or a line about what lies ahead.",
  '- Keep every fact consistent with the story so far and the game state: names, wounds, belongings, prices, who knows what. Use the game state; never recite it.',
  "- Write only the story: no titles, author's notes, commentary, or questions to the reader.",
  '',
  "Avoid stock phrases like these, and anything like them: a shiver running down the spine; a breath you didn't know you were holding; the air thick with tension; palpable; electric; a mix of fear and excitement; eyes sparkling with mischief; a smirk playing on lips; a smile that doesn't reach the eyes; the ghost of a smile; an unreadable expression; barely above a whisper; a voice dripping with honey; knuckles whitening; something primal; a flicker of emotion; a testament to; tapestry; symphony; a dance of; orbs for eyes; ministrations; maybe, just maybe; little did you know; in that moment; time seems to stop; the weight of the moment; \"it's not X, it's Y\"; the smell of ozone. Use em dashes sparingly.",
].join('\n')

/** The reminder placed just before the story when "Second person, present tense" is on. */
export const POV_REMINDER = 'Continue the story from where it stops, in second person, present tense.'

export type StoryPromptParts = {
  /** Appended to the system prompt. */
  system?: string
  /** Placed just before the story: the game state and the reminder. */
  note?: string
}

/** What goes into the system prompt: the point-of-view rule and the guide, as switched on. */
export function systemAddition(pov: boolean, guide: string): string | undefined {
  const parts = [pov ? POV_RULE : '', guide.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

/** What goes just before the story: the game state, then the reminder. */
export function storyNote(pov: boolean, gameState?: string): string | undefined {
  const parts = [gameState ?? '', pov ? POV_REMINDER : ''].filter(Boolean)
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

/**
 * Returns a copy of the context with `system` added to the system prompt and `note` added to the
 * latest user message, which in story mode holds the memory and comes just before the story. If
 * that message ends with NovelAI's closing "Write.", the note goes before it.
 */
export function withStoryPrompt(messages: Message[], { system, note }: StoryPromptParts): Message[] {
  const result = messages.map((m) => ({ ...m }))
  if (system) {
    const index = result.findIndex((m) => m.role === 'system')
    if (index >= 0) result[index].content = joinParts(result[index].content, system)
    else result.unshift({ role: 'system', content: system })
  }
  if (note) {
    let index = -1
    for (let i = result.length - 1; i >= 0 && index < 0; i--) if (result[i].role === 'user') index = i
    if (index >= 0) {
      const content = result[index].content ?? ''
      const write = /\n*Write\.\s*$/.exec(content)
      result[index].content = write
        ? `${joinParts(content.slice(0, write.index), note)}\n\nWrite.`
        : joinParts(content, note)
    } else {
      // No user message at all: add one before the story.
      const firstStory = result.findIndex((m) => m.role !== 'system')
      result.splice(firstStory >= 0 ? firstStory : result.length, 0, { role: 'user', content: note })
    }
  }
  return result
}

function joinParts(first: string | undefined, second: string): string {
  return first?.trim() ? `${first.replace(/\s+$/, '')}\n\n${second}` : second
}
