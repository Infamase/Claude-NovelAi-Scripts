// Pattern rules that spot a reply writing for the player character. Pure functions.
//
// The rules only look at narration, never inside quoted speech: an NPC may ask "Will you help me?",
// but the narrator may not. Who is speaking an unattributed quote, or whose thought an unmarked line
// is, can't be told from patterns; the referee handles those.

import { isSceneMarker, quoteMask, type Sentence } from './text.ts'

export type Overstep = { index: number; reason: string }

export type DetectOptions = {
  /** Strict mode: no physical reactions from the player character either. */
  strict: boolean
  /**
   * Also flag "you <verb>" actions. Turned off while the referee is on, because it knows what the
   * player typed and can tell carrying out their action from inventing a new one.
   */
  actions: boolean
  /** The player's input this turn. The reply may carry out what it says. */
  playerInput?: string
}

const PROMPTS: [RegExp, string][] = [
  [/\bwhat (?:do|will|would|should|shall|can|could) you\b/i, 'asks what you do'],
  [/\b(?:do|will|would|should|shall|can|could) you\b[^.!?]*\?/i, 'asks you a question'],
  [/\b(?:the )?(?:choice|decision) is yours\b/i, 'hands the turn to you'],
  [/\bit(?:'|’)?s (?:up to you|your (?:turn|move|call|choice))\b/i, 'hands the turn to you'],
  [/\bwhat(?:'|’)?s your (?:next )?(?:move|choice|plan|decision|call)\b/i, 'asks what you do'],
  [/\bwhat (?:now|next)\s*\?/i, 'asks what you do'],
  [/\bhow (?:do|will|would|should) you (?:respond|react|reply|answer|proceed|handle)\b/i, 'asks what you do'],
  [/\byou (?:could|can|might)\b[^.!?]*\bor (?:you (?:could|can|might)|perhaps)\b/i, 'offers you choices'],
]

const ADVERB = String.raw`(?:\w+ly\s+|(?:just|still|only|never|barely|almost|nearly|already|also|even|finally|then|now|instead)\s+)*`

const SPEECH = new RegExp(
  String.raw`\byou(?:r voice)?\s+${ADVERB}(?:say|said|ask|asked|reply|replied|respond|responded|answer|answered|shout|shouted|yell|yelled|whisper|whispered|mutter|muttered|murmur|murmured|exclaim|exclaimed|stammer|stammered|blurt|blurted|tell|told|speak|spoke|repeat|repeated|insist|insisted|demand|demanded|croak|croaked|call out|called out|cry out|cried out|manage to say|managed to say)\b`,
  'i',
)

const DECISION = new RegExp(
  String.raw`\byou\s+${ADVERB}(?:decide|decided|choose|chose|opt|opted|resolve|resolved|elect|elected|make up your mind|made up your mind)\b`,
  'i',
)

const THOUGHT = new RegExp(
  String.raw`\byou\s+${ADVERB}(?:think|thought|wonder|wondered|realize|realized|realise|realised|figure|figured|suppose|supposed|guess|guessed|reckon|reckoned|conclude|concluded|consider|considered|recall|recalled|remember|remembered|hope|hoped|wish|wished|plan|planned|imagine|imagined|muse|mused|ponder|pondered|doubt|doubted|suspect|suspected|believe|believed|understand|understood|(?:feel|felt) (?:that|like you|as if you|as though you)|can(?:not|'t|’t) help but (?:think|wonder|feel))\b`,
  'i',
)

/** "you" as the subject of a clause, and the verb that follows it. */
const SUBJECT_YOU = new RegExp(
  String.raw`(?:^|[,;:—–]\s*|\b(?:and|but|then|so|as|while|when|until|before|after|because|if|once|or)\s+)you\s+${ADVERB}([a-z'’]+)`,
  'gi',
)

/** Verbs that describe what the player character perceives, or a state: always allowed. */
const PERCEPTION = new Set(
  'see saw seen hear heard notice noticed spot spotted smell smelled smelt taste tasted sense sensed watch watched glimpse glimpsed find found catch caught are were am be been being have has had can could cannot can’t can\'t couldn’t couldn\'t may might must should would will shall do does did don’t don\'t didn’t didn\'t doesn’t doesn\'t won’t won\'t wouldn’t wouldn\'t'.split(
    ' ',
  ),
)

/** Involuntary physical reactions: allowed unless strict mode is on. */
const REACTIONS = new Set(
  'feel feels felt flinch flinches flinched wince winces winced shiver shivers shivered shudder shudders shuddered tremble trembles trembled gasp gasps gasped cough coughs coughed choke chokes choked sneeze sneezes sneezed freeze freezes froze stagger staggers staggered stumble stumbles stumbled blink blinks blinked sweat sweats sweated blush blushes blushed gag gags gagged recoil recoils recoiled jolt jolts jolted startle startles startled fall falls fell slip slips slipped wake wakes woke awaken awakens awakened swallow swallows swallowed gulp gulps gulped tense tenses tensed stiffen stiffens stiffened cringe cringes cringed sway sways swayed wheeze wheezes wheezed pant pants panted groan groans groaned whimper whimpers whimpered grimace grimaces grimaced collapse collapses collapsed faint faints fainted twitch twitches twitched jerk jerks jerked'.split(
    ' ',
  ),
)

/** Finds the first sentence that writes for the player character, by pattern. */
export function findOverstep(text: string, sentences: Sentence[], options: DetectOptions): Overstep | undefined {
  const mask = quoteMask(text)
  const typed = new Set(words(options.playerInput ?? '').map(stem))
  for (let index = 0; index < sentences.length; index++) {
    const sentence = sentences[index]
    let narration = ''
    for (let i = sentence.start; i < sentence.end; i++) narration += mask[i] ? ' ' : text[i]
    const reason = checkSentence(sentence.text.trim(), narration.trim(), typed, options)
    if (reason) return { index, reason }
  }
  return undefined
}

function checkSentence(raw: string, narration: string, typed: Set<string>, options: DetectOptions): string | undefined {
  if (raw.startsWith('>')) return 'starts a new player action (>)'
  if (isSceneMarker(raw)) return 'starts a new scene or chapter'
  if (narration === '') return undefined
  for (const [pattern, reason] of PROMPTS) if (pattern.test(narration)) return reason
  if (SPEECH.test(narration)) return 'your character speaks'
  if (DECISION.test(narration)) return 'your character makes a decision'
  if (THOUGHT.test(narration)) return "your character's thoughts"

  for (const match of narration.matchAll(SUBJECT_YOU)) {
    const verb = match[1].toLowerCase()
    if (PERCEPTION.has(verb) || typed.has(stem(verb))) continue
    if (REACTIONS.has(verb)) {
      if (options.strict) return `your character reacts ("you ${verb}"), and strict mode is on`
      continue
    }
    if (options.actions) return `an action you didn't type ("you ${verb}")`
  }
  return undefined
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z'’]+/g) ?? []
}

/** A rough stem, so "approach", "approaches" and "approached" count as the same verb. */
export function stem(word: string): string {
  const w = word.toLowerCase()
  if (w.length > 4 && /ies$|ied$/.test(w)) return w.slice(0, -3) + 'y'
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}
