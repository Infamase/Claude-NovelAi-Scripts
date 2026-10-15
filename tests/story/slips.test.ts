import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { splitSentences } from '../../src/guard/text.ts'
import { checkSentences, findSlip, speechMask } from '../../src/story/slips.ts'

/** The first sentence that slips, with why, or null. */
function slip(text: string, name = 'Hunter Grayson') {
  const sentences = splitSentences(text)
  const found = findSlip(checkSentences(text, sentences, name))
  return found ? { sentence: sentences[found.index].text.trim(), reason: found.reason } : null
}

describe('findSlip', () => {
  describe('leaves second person, present tense alone', () => {
    const fine = [
      'You push the door open. The tavern is loud and warm, and the smell of roasting meat hangs in the air. A woman behind the bar looks up. "Took you long enough," she says.',
      // Dialogue may use any person and tense, in double or single quotes.
      'The dragon lifts her head. "I have waited a hundred years," she rumbles. "My hoard was never touched."',
      "'I don't know,' she says. 'I was never there.'",
      // Thoughts in italics.
      '*I need to get out of here*, you think. The door is still open.',
      // Present narration can mention the past.
      'She hands you the cup. You drink. It is bitter, and the gold you lost yesterday weighs on your mind.',
      'The fire crackles. Zylith studies you for a long moment, then turns away. You had told her the truth, and she knows it.',
      // A memory may be told in the past.
      'You remember the night your father left. The rain was cold. He never looked back. You blink, and the tavern returns.',
      // Backstory, as long as the reply returns to the present.
      'She was a soldier once. She lost her brother at the pass. Now she guards the gate, and she does not smile.',
      // Your name in someone's mouth, or as an object.
      '"Hunter," she says, tasting the name. She calls you Hunter and walks away.',
      'Chapter I\nYou wake to rain.',
    ]
    for (const text of fine) it(text, () => assert.equal(slip(text), null))
  })

  it('cuts where the narration turns to the past and stays there', () => {
    assert.deepEqual(
      slip('You push the door open. The tavern was loud and warm. A woman behind the bar looked up. "Took you long enough," she said.'),
      { sentence: 'The tavern was loud and warm.', reason: 'slips into past tense ("was")' },
    )
    assert.deepEqual(slip('You stepped inside. The room was dark, and you could barely see. You froze.'), {
      sentence: 'You stepped inside.',
      reason: 'slips into past tense ("you stepped")',
    })
    assert.equal(slip('The dragon lifted her head. Smoke curled from her nostrils. She said nothing.')?.sentence, 'The dragon lifted her head.')
  })

  it('needs more than one past-tense sentence', () => {
    assert.equal(slip('You wait. The guard was gone.'), null)
  })

  it('cuts first person in the narration', () => {
    assert.deepEqual(slip('The dragon lifts her head. I step back, my heart pounding.'), {
      sentence: 'I step back, my heart pounding.',
      reason: 'slips into first person ("I")',
    })
    assert.equal(slip('She smiles at me.')?.reason, 'slips into first person ("me")')
  })

  it('cuts narration that calls you by name', () => {
    assert.deepEqual(slip('The guard steps aside. Hunter walks past him.'), {
      sentence: 'Hunter walks past him.',
      reason: 'calls you by name ("Hunter walks")',
    })
    assert.equal(slip('Grayson is tired.')?.reason, 'calls you by name ("Grayson is")')
    assert.equal(slip('Hunter walks past him.', ''), null, 'no name set')
  })
})

describe('speechMask', () => {
  it('masks double and single quotes and italics, but not apostrophes or scene breaks', () => {
    const show = (text: string) => [...text].map((ch, i) => (speechMask(text)[i] ? '_' : ch)).join('')
    assert.equal(show('She says "hi" and \'bye\'.'), 'She says ____ and _____.')
    assert.equal(show("You don't know *why* it's here."), "You don't know _____ it's here.")
    assert.equal(show('***\nYou wake.'), '***\nYou wake.')
    assert.equal(show('‘I can’t,’ she says.'), '__________ she says.')
  })
})
