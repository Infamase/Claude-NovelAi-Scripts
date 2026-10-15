import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findMention, parseAbsent } from '../src/state/absent.ts'
import { splitSentences } from '../src/guard/text.ts'

describe('parseAbsent', () => {
  it('reads one entry per line, with other names after commas', () => {
    assert.deepEqual(parseAbsent('Naruto Uzumaki, the Nine-Tails jinchuriki\n\n  Jiraiya  '), [
      { name: 'Naruto Uzumaki', variants: ['Naruto Uzumaki', 'the Nine-Tails jinchuriki', 'Naruto'] },
      { name: 'Jiraiya', variants: ['Jiraiya'] },
    ])
  })

  it('counts a first-and-last name by its first name too, but not a title', () => {
    assert.deepEqual(parseAbsent('Lord Voldemort')[0].variants, ['Lord Voldemort'])
    assert.deepEqual(parseAbsent('The Hokage')[0].variants, ['The Hokage'])
    assert.deepEqual(parseAbsent('Naruto Uzumaki, Naruto')[0].variants, ['Naruto Uzumaki', 'Naruto'])
    assert.deepEqual(parseAbsent('Kakashi of the Sharingan')[0].variants, ['Kakashi of the Sharingan'])
  })
})

describe('findMention', () => {
  const absent = parseAbsent('Naruto Uzumaki')
  const mention = (text: string) => {
    const found = findMention(text, splitSentences(text), absent)
    return found && { ...found, sentence: splitSentences(text)[found.index].text.trim() }
  }

  it('finds the first sentence that names them, in narration or dialogue', () => {
    assert.deepEqual(mention('Kakashi sighs. Naruto bursts through the door. Sakura groans.'), {
      index: 1,
      name: 'Naruto Uzumaki',
      variant: 'Naruto',
      sentence: 'Naruto bursts through the door.',
    })
    assert.equal(mention('"Where is Naruto?" Sakura asks.')?.index, 0)
    assert.equal(mention("You find Naruto's headband.")?.variant, 'Naruto', 'a possessive counts')
    assert.equal(mention('Naruto Uzumaki grins.')?.variant, 'Naruto Uzumaki', 'the full name is reported')
  })

  it('matches whole words, case and all', () => {
    assert.equal(mention('The ramen comes with narutomaki and a slice of naruto.'), undefined)
    assert.equal(mention('A Narutoesque grin.'), undefined)
    assert.equal(mention('Sasuke trains alone.'), undefined)
    assert.equal(findMention('Naruto waves.', splitSentences('Naruto waves.'), []), undefined)
  })
})
