// Characters (or anything else) that are not in this story, such as a canon character who died
// before it begins. Pure functions.
//
// Telling the AI isn't always enough: in an established world it knows who belongs in a scene and
// writes them in anyway. So replies can also be cut before the first sentence that names one.

import type { Sentence } from '../guard/text.ts'

export type Absent = {
  /** The name as the player wrote it first on its line, for the AI and for reports. */
  name: string
  /** Every form that counts as a mention. */
  variants: string[]
}

export type Mention = { index: number; name: string; variant: string }

/** Words that start titles rather than first names ("Lord Voldemort", "The Hokage"). */
const TITLES = new Set(
  (
    'the a an lord lady king queen prince princess sir dame captain general commander admiral doctor dr professor master ' +
    'mister miss mr mrs ms saint st uncle aunt father mother brother sister old young great high grand elder little big'
  ).split(' '),
)

/**
 * Reads the "Not in this story" list: one entry per line, with other names after commas
 * ("Naruto Uzumaki, Naruto"). A two-word name also counts by its first word, unless that's a title.
 */
export function parseAbsent(list: string): Absent[] {
  return list
    .split('\n')
    .map((line) => line.split(',').map((part) => part.trim()).filter((part) => part !== ''))
    .filter((parts) => parts.length > 0)
    .map((parts) => {
      const variants = [...parts]
      for (const part of parts) {
        const words = part.split(/\s+/)
        if (words.length === 2 && /^\p{Lu}/u.test(words[0]) && /^\p{Lu}/u.test(words[1]) && !TITLES.has(words[0].toLowerCase())) {
          variants.push(words[0])
        }
      }
      return { name: parts[0], variants: [...new Set(variants)] }
    })
}

/**
 * The first sentence that mentions anyone on the list, in narration or dialogue. Names match as
 * typed, case and all, as whole words, so "Naruto" doesn't match "narutomaki".
 */
export function findMention(text: string, sentences: Sentence[], absent: Absent[]): Mention | undefined {
  const pairs = absent.flatMap((a) => a.variants.map((variant) => ({ name: a.name, variant })))
  if (pairs.length === 0 || sentences.length === 0) return undefined
  // Longest first, so "Naruto Uzumaki" is reported rather than "Naruto".
  pairs.sort((a, b) => b.variant.length - a.variant.length)
  const pattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(${pairs.map((p) => escapeRegExp(p.variant)).join('|')})(?![\\p{L}\\p{N}])`,
    'gu',
  )
  for (const match of text.matchAll(pattern)) {
    const at = (match.index ?? 0) + match[0].length - match[1].length
    const index = sentences.findIndex((s) => at < s.end)
    if (index < 0) continue
    const pair = pairs.find((p) => p.variant === match[1])
    return { index, name: pair?.name ?? match[1], variant: match[1] }
  }
  return undefined
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
