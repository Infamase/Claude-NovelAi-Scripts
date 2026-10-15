import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chunksCovering, findSentenceEnd, isComplete, quoteMask, splitSentences, truncateChunks } from '../src/guard/text.ts'

describe('findSentenceEnd', () => {
  const firstSentence = (text: string) => {
    const end = findSentenceEnd(text)
    return end < 0 ? null : text.slice(0, end)
  }

  it('finds a sentence once the next one has started', () => {
    assert.equal(firstSentence('The ale is warm. The bartender grins.'), 'The ale is warm.')
  })

  it('waits while the sentence could still be going', () => {
    assert.equal(firstSentence('The ale is warm'), null)
    assert.equal(firstSentence('The ale is warm.'), null)
    assert.equal(firstSentence('The ale is warm. '), null)
  })

  it('treats a line break as the end of a paragraph', () => {
    assert.equal(firstSentence('The ale is warm.\nThe bartender'), 'The ale is warm.')
    assert.equal(firstSentence('The bartender shrugs\nSomething'), 'The bartender shrugs')
  })

  it('skips leading line breaks', () => {
    assert.equal(firstSentence('\n\nThe ale is warm. It'), '\n\nThe ale is warm.')
  })

  it('keeps closing quotes with the sentence', () => {
    assert.equal(firstSentence('"Drink up!" The bartender grins.'), '"Drink up!"')
    assert.equal(firstSentence('He says, “Drink up.” Then he'), 'He says, “Drink up.”')
  })

  it('continues when dialogue is followed by a lowercase tag', () => {
    assert.equal(firstSentence('"Another?" she asks. You'), '"Another?" she asks.')
  })

  it('ignores common abbreviations and initials', () => {
    assert.equal(firstSentence('Mr. Hale nods. You'), 'Mr. Hale nods.')
    assert.equal(firstSentence('J. R. Tolk waves. You'), 'J. R. Tolk waves.')
  })

  it('handles runs of terminators', () => {
    assert.equal(firstSentence('What?! The door slams.'), 'What?!')
    assert.equal(firstSentence('Silence... Then a knock.'), 'Silence...')
    assert.equal(firstSentence('Silence... then a knock. It'), 'Silence... then a knock.')
  })
})

describe('chunksCovering', () => {
  const chunks = ['The', ' ale', ' is', ' warm', '.', ' The']

  it('counts the chunks needed to cover a length', () => {
    assert.equal(chunksCovering(chunks, 0), 0)
    assert.equal(chunksCovering(chunks, 3), 1)
    assert.equal(chunksCovering(chunks, 4), 2)
    assert.equal(chunksCovering(chunks, 16), 5)
    assert.equal(chunksCovering(chunks, 99), 6)
  })
})

describe('truncateChunks', () => {
  it('cuts mid-chunk and empties the rest, keeping the array length', () => {
    assert.deepEqual(truncateChunks(['The', ' ale.', ' The', ' end'], 8), ['The', ' ale.', '', ''])
    assert.deepEqual(truncateChunks(['The', ' ale. The'], 8), ['The', ' ale.'])
    assert.deepEqual(truncateChunks(['ab', 'cd'], 0), ['', ''])
  })
})

describe('splitSentences', () => {
  it('covers the text exactly, with whitespace leading each sentence', () => {
    const text = 'The ale is warm. "Another?" he asks.\n\nYou nod and'
    const sentences = splitSentences(text)
    assert.deepEqual(sentences.map((s) => s.text), ['The ale is warm.', ' "Another?" he asks.', '\n\nYou nod and'])
    assert.equal(sentences.map((s) => s.text).join(''), text)
    assert.deepEqual(sentences.map((s) => [s.start, s.end]), [[0, 16], [16, 36], [36, 49]])
  })

  it('ignores trailing whitespace and handles empty text', () => {
    assert.deepEqual(splitSentences('Done.  ').map((s) => s.text), ['Done.  '])
    assert.deepEqual(splitSentences('  '), [])
  })
})

describe('isComplete', () => {
  it('tells finished sentences from cut-off ones', () => {
    for (const done of ['It ends.', '"Go!"', 'Really?” ', 'Wait…', '"But—"']) assert.ok(isComplete(done), done)
    for (const cut of ['The fire crackles as the', '"And then', 'She says,']) assert.ok(!isComplete(cut), cut)
  })
})

describe('quoteMask', () => {
  it('marks quoted speech, with straight, curly or mixed quotes', () => {
    const text = '"Awake, are we?” A voice. “Good." End'
    const inside = [...text].filter((_, i) => quoteMask(text)[i]).join('')
    assert.equal(inside, '"Awake, are we?”“Good."')
  })

  it('does not carry an unclosed quote past a line break', () => {
    const text = '"Unclosed\nNarration'
    assert.equal(quoteMask(text).lastIndexOf(true), 8) // the 'd' before the line break
  })
})
