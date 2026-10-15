// Finds where a reply slips out of second person, present tense. Pure functions.
//
// Only narration is checked: dialogue in double or single quotes, and *italic* or _italic_ thoughts,
// may use any person and tense. Three kinds of slip:
// - first person in the narration ("I step inside");
// - the protagonist called by name as the subject ("Hunter steps inside");
// - a run of past tense ("You stepped inside. The door was open."). One past-tense sentence is not
//   enough, since present-tense narration can mention the past ("the gold you lost"): the rest of
//   the reply from there must be mostly past tense, and still past at its end. A memory ("You
//   remember…") is exempt.

import { quoteMask, type Sentence } from '../guard/text.ts'

export type SentenceCheck = {
  /** How many verb forms in the sentence's narration are past and present tense. */
  past: number
  present: number
  /** The first past-tense form found, for reports. */
  pastExample?: string
  /** A first-person word in the narration. */
  firstPerson?: string
  /** The protagonist's name used as a subject ("Hunter walks"). */
  named?: string
  /** Inside a memory or flashback, where past tense is fine. */
  memory: boolean
}

export type Slip = { index: number; reason: string }

const SUBJECTS = '(?:you|he|she|it|they|we)'
const ADVERB =
  '(?:(?:[a-z]+ly|just|still|then|never|always|already|almost|also|even|once|soon|now|again|sometimes|perhaps)\\s+)?'
const WORD = "([a-z]+(?:['’][a-z]+)?)"

const PAST_AUX = new Set(['was', 'were', 'had', 'did', "wasn't", "weren't", "hadn't", "didn't"])
const PRESENT_AUX = new Set([
  'am', 'is', 'are', 'has', 'have', 'do', 'does', 'can', "isn't", "aren't", "hasn't", "haven't", "don't", "doesn't", "can't",
])

/** Present forms counted wherever they appear ("The door is open"). */
const BARE_PRESENT_AUX = new Set(['is', 'are', 'has', "isn't", "aren't", "hasn't"])

/** Irregular past forms that differ from the present. */
const IRREGULAR_PAST = new Set(
  (
    'saw said went came took made knew thought felt found gave told got left kept began ran stood sat held brought heard meant ' +
    'met paid fell rose spoke wrote drew drove threw grew wore chose broke woke froze shook caught taught fought sought bought ' +
    'led fled slept swept wept knelt dealt built sent spent lost struck hung swung clung flung stung sank sang rang drank swam ' +
    'forgot hid bit slid lit ate became understood won sold flew blew tore swore bore rode strode spun stuck shone dug fed bled ' +
    'sped bent lent crept leapt sprang shrank stole wove arose awoke withdrew overheard forgave'
  ).split(' '),
)

/** Words ending in -ed that are not past forms. */
const NOT_PAST = new Set(
  'need feed bleed breed speed proceed succeed exceed heed seed weed shed shred wed embed bed sled red bred'.split(' '),
)

/** Words after "you", "they" or "we" that are not verbs, as in "She hands you the cup." */
const NOT_VERBS = new Set(
  (
    'and or but nor so too all both alone here there to a an the in on at with for from of into onto off out up down back ' +
    'away again now then yourself yourselves themselves ourselves as if that this these those what who whom which when where ' +
    'why how than like about before after through toward towards over under by no not nothing something everything anything ' +
    'one two three my his her their our its your me him them us it some any every each more most much many little few enough ' +
    'very right while until since because though although will would could should might must may shall yours ' +
    'always perhaps'
  ).split(' '),
)

const LY_VERBS = new Set('reply replies apply applies rely relies fly flies supply comply imply rally bully'.split(' '))

/** Common narration verbs counted in any sentence, whoever the subject is ("The dragon said…"). */
const NARRATION_PAST = new Set(
  (
    'said went came took knew gave told stood began spoke drew threw grew ran sat heard brought caught fought wore chose woke ' +
    'froze shook swore tore rode strode flew sang sank drank swam slept wept knelt crept leapt sprang stole forgot became ' +
    'understood seemed looked turned smiled nodded stared glanced whispered murmured replied asked answered laughed sighed ' +
    'shrugged frowned grinned walked stepped reached pulled pushed waited paused continued added lifted tilted narrowed ' +
    'widened leaned hesitated studied noticed realized wanted needed tried kept'
  ).split(' '),
)
const NARRATION_PRESENT = new Set(
  (
    'says goes comes takes knows gives tells stands begins speaks grows sits hears brings catches wears chooses wakes shakes ' +
    'rides sings swims sleeps kneels creeps steals forgets becomes understands seems nods murmurs asks shrugs frowns reaches ' +
    'pulls pushes opens closes waits continues adds lifts tilts narrows widens rises leans hesitates studies notices realizes ' +
    'feels sees thinks wants needs tries finds keeps leaves lets puts holds'
  ).split(' '),
)

const MEMORY_CUE =
  /\b(?:remember(?:s|ed|ing)?|recall(?:s|ed|ing)?|memor(?:y|ies)|years ago|long ago|back then|used to|as a child|in your dreams?|you once)\b/i

/** Marks narration that isn't the narrator's own voice: quoted speech and italic thoughts. */
export function speechMask(text: string): boolean[] {
  const mask = quoteMask(text)
  let open: string | undefined
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n') {
      open = undefined
      continue
    }
    if (open) {
      mask[i] = true
      if (closes(open, text, i)) open = undefined
    } else if (!mask[i] && opens(text, i)) {
      open = ch
      mask[i] = true
    }
  }
  return mask
}

function opens(text: string, i: number): boolean {
  const ch = text[i]
  const before = text[i - 1] ?? ' '
  const after = text[i + 1] ?? ' '
  if (ch === '‘') return true
  if (ch === "'") return !/[\p{L}\p{N}]/u.test(before) && /\p{L}/u.test(after)
  if (ch === '*' || ch === '_') return !/[\p{L}\p{N}*_]/u.test(before) && !/[\s*_]/.test(after)
  return false
}

function closes(open: string, text: string, i: number): boolean {
  const ch = text[i]
  const before = text[i - 1] ?? ' '
  const after = text[i + 1] ?? ' '
  if (open === '‘') return ch === '’' && !/\p{L}/u.test(after)
  if (open === "'") return ch === "'" && !/\s/.test(before) && !/\p{L}/u.test(after)
  return ch === open && !/\s/.test(before)
}

/** Checks each sentence's narration for person and tense. */
export function checkSentences(text: string, sentences: Sentence[], playerName = ''): SentenceCheck[] {
  const mask = speechMask(text)
  const nameRe = namePattern(playerName)
  let inMemory = false
  return sentences.map((sentence) => {
    let narration = ''
    for (let i = sentence.start; i < sentence.end; i++) narration += mask[i] ? ' ' : text[i]
    const check = checkNarration(narration, nameRe)
    // A memory lasts while the sentences stay in the past (or show no tense), until the present returns.
    if (MEMORY_CUE.test(narration)) inMemory = true
    else if (check.present > check.past) inMemory = false
    check.memory = inMemory
    return check
  })
}

function checkNarration(narration: string, nameRe?: RegExp): SentenceCheck {
  const check: SentenceCheck = { past: 0, present: 0, memory: false }
  const pastFound = (form: string) => {
    check.past++
    check.pastExample ??= form
  }
  // "I" counts only as a capital, and not as a numeral ("Chapter I").
  const firstPerson =
    /\bI\b/.exec(narration.replace(/\b(?:chapter|part|book|act|volume|king|queen) I\b/gi, '')) ??
    /\b(?:me|my|myself)\b/i.exec(narration)
  if (firstPerson) check.firstPerson = firstPerson[0]
  if (nameRe) {
    for (const match of narration.matchAll(nameRe)) {
      if (verbTense('she', match[2]) !== undefined) {
        check.named = match[1]
        break
      }
    }
  }

  // A subject and its verb: "you walked", "she turns", "they're".
  let rest = narration.replace(
    new RegExp(`\\b${SUBJECTS}(?:['’](re|ve|s|m))?\\b(?:\\s+${ADVERB}${WORD})?`, 'gi'),
    (match: string, contraction: string | undefined, word: string | undefined) => {
      if (contraction) {
        check.present++
        return ' '
      }
      if (!word) return match
      const subject = match.split(/\s+/)[0]
      const tense = verbTense(subject, word)
      if (tense === 'past') pastFound(`${subject} ${word}`.toLowerCase())
      else if (tense === 'present') check.present++
      return tense ? ' ' : match
    },
  )
  // Any other "was", "is", "said", "says"…
  rest = rest.replace(/\b[a-z]+(?:['’]t)?\b/gi, (word) => {
    const w = normalize(word)
    if (PAST_AUX.has(w) && w !== 'did' && w !== "didn't") pastFound(w)
    else if (NARRATION_PAST.has(w)) pastFound(w)
    else if (BARE_PRESENT_AUX.has(w)) check.present++
    else if (NARRATION_PRESENT.has(w)) check.present++
    return ' '
  })
  return check
}

/** The tense of `word` as the verb after `subject`, if it reads as a verb. */
function verbTense(subject: string, word: string): 'past' | 'present' | undefined {
  const w = normalize(word)
  if (PAST_AUX.has(w) || IRREGULAR_PAST.has(w) || (/^[a-z]{2,}ed$/.test(w) && !NOT_PAST.has(w))) return 'past'
  if (PRESENT_AUX.has(w)) return 'present'
  if (NOT_VERBS.has(w) || /ing$/.test(w) || !/^[a-z]+$/.test(w)) return undefined
  // Mostly adverbs ("She eyes you warily"), apart from a few verbs.
  if (/ly$/.test(w) && !LY_VERBS.has(w)) return undefined
  if (/^(?:he|she|it)$/i.test(subject)) return /^[a-z]*[^s]s$/.test(w) ? 'present' : undefined
  return 'present'
}

function normalize(word: string): string {
  return word.toLowerCase().replace(/’/g, "'")
}

/** Matches the protagonist's name (or any part of it) followed by a word, as in "Hunter walks". */
function namePattern(playerName: string): RegExp | undefined {
  const parts = playerName
    .split(/\s+/)
    .filter((part) => /^\p{Lu}[\p{L}'’-]+$/u.test(part))
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (parts.length === 0) return undefined
  return new RegExp(`(?:^|[^\\p{L}'’])((?:${parts.join('|')})(?![\\p{L}'’])\\s+${ADVERB}${WORD})`, 'gu')
}

/** The first sentence where the reply slips out of second person, present tense, if any. */
export function findSlip(checks: SentenceCheck[]): Slip | undefined {
  // Past tense is only a slip if the reply is still in the past at the end. A reply that returns to
  // the present was telling some backstory ("She was a soldier once."), which is fine.
  const tensed = checks.filter((c) => !c.memory && c.past !== c.present)
  const endsInPast = tensed.length > 0 && isPast(tensed[tensed.length - 1])
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i]
    if (check.firstPerson) return { index: i, reason: `slips into first person ("${check.firstPerson}")` }
    if (check.named) return { index: i, reason: `calls you by name ("${check.named}")` }
    if (endsInPast && isPast(check) && !check.memory) {
      const rest = checks.slice(i)
      const past = rest.filter((c) => isPast(c) && !c.memory).length
      const present = rest.filter((c) => c.present > c.past).length
      if (past >= 2 && past > present) return { index: i, reason: `slips into past tense ("${check.pastExample}")` }
    }
  }
  return undefined
}

/**
 * Whether a sentence could be where a slip starts, so it must wait until the reply is finished:
 * a run of past tense is only a slip if the rest of the reply stays in the past.
 */
export function mightSlip(check: SentenceCheck): boolean {
  return Boolean(check.firstPerson || check.named || (isPast(check) && !check.memory))
}

function isPast(check: SentenceCheck): boolean {
  return check.past > check.present
}
