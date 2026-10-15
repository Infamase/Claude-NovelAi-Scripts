import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chunksCovering, findSentenceEnd, truncateChunks } from '../src/guard/text.ts'

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
