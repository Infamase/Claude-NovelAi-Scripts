// Text helpers for working with streamed generations. Pure functions with no NovelAI API access,
// so they can be unit tested outside NovelAI.

const TERMINATORS = '.!?…'
const CLOSERS = `"'”’)]*_`
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'sr', 'jr', 'mt', 'vs', 'etc', 'prof', 'capt', 'gen', 'lt', 'sgt', 'col',
])

/**
 * Finds the end of the first complete sentence in `text`. Returns the index just past the sentence
 * (after any closing quotes), or -1 if no sentence is complete yet.
 *
 * Streaming text can stop anywhere, so a sentence only counts as complete once the next word has
 * started (or a line break ends the paragraph). A lowercase next word means the sentence goes on,
 * as in `"Hello?" she asked.`
 */
export function findSentenceEnd(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n') {
      if (text.slice(0, i).trim() !== '') return i
      continue
    }
    if (!TERMINATORS.includes(ch)) continue

    let end = i + 1
    while (end < text.length && TERMINATORS.includes(text[end])) end++
    while (end < text.length && CLOSERS.includes(text[end])) end++
    if (end >= text.length) return -1
    if (!isSpace(text[end]) || (ch === '.' && isAbbreviation(text, i))) {
      i = end - 1
      continue
    }

    let next = end
    while (next < text.length && isSpace(text[next])) {
      if (text[next] === '\n') return end
      next++
    }
    if (next >= text.length) return -1
    if (/\p{Ll}/u.test(text[next])) {
      i = next - 1
      continue
    }
    return end
  }
  return -1
}

export type Sentence = { start: number; end: number; text: string }

/**
 * Splits a finished reply into sentences. Each sentence starts where the previous one ended, so
 * leading whitespace and line breaks belong to the sentence after them.
 */
export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = []
  let start = 0
  while (start < text.length && text.slice(start).trim() !== '') {
    const end = findSentenceEnd(text.slice(start))
    const stop = end < 0 ? text.length : start + end
    sentences.push({ start, end: stop, text: text.slice(start, stop) })
    start = stop
  }
  return sentences
}

/** Whether a sentence ends properly, rather than being cut off mid-way by the length limit. */
export function isComplete(sentence: string): boolean {
  return /(?:[.!?…]|[—–-]["”’])["'”’)\]*_]*\s*$/.test(sentence)
}

/** Marks which characters are inside quoted speech. Quotes don't carry over a line break. */
export function quoteMask(text: string): boolean[] {
  const mask: boolean[] = []
  let inside = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n') inside = false
    if (ch === '“' || (ch === '"' && !inside)) {
      mask.push(true)
      inside = true
    } else if (ch === '”' || ch === '"') {
      mask.push(true)
      inside = false
    } else {
      mask.push(inside)
    }
  }
  return mask
}

/** How many leading chunks are needed to cover the first `length` characters. */
export function chunksCovering(chunks: string[], length: number): number {
  let total = 0
  let count = 0
  while (count < chunks.length && total < length) {
    total += chunks[count].length
    count++
  }
  return count
}

/** Keeps exactly the first `length` characters. The array keeps its length; later chunks become empty. */
export function truncateChunks(chunks: string[], length: number): string[] {
  let remaining = length
  return chunks.map((chunk) => {
    const kept = chunk.slice(0, Math.max(0, remaining))
    remaining -= chunk.length
    return kept
  })
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r'
}

function isAbbreviation(text: string, dotIndex: number): boolean {
  const word = /([A-Za-z]+)$/.exec(text.slice(Math.max(0, dotIndex - 12), dotIndex))?.[1]
  if (!word) return false
  if (word.length === 1) return word !== 'I' && word === word.toUpperCase()
  return ABBREVIATIONS.has(word.toLowerCase())
}
