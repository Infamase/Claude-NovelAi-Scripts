import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findOverstep, type DetectOptions } from '../src/guard/detector.ts'
import { splitSentences } from '../src/guard/text.ts'

const REACTIONS: DetectOptions = { strict: false, actions: true }

/** The first sentence the rules would cut, or null. */
function cutAt(text: string, options: DetectOptions = REACTIONS) {
  const sentences = splitSentences(text)
  const overstep = findOverstep(text, sentences, options)
  return overstep ? { sentence: sentences[overstep.index].text.trim(), reason: overstep.reason } : null
}

describe('findOverstep', () => {
  describe('leaves the narrator and other characters alone', () => {
    const fine = [
      // Real replies from the stop tests.
      '"Indeed," The dragon shifts, its coils unspooling slowly, the motion deceptively graceful.',
      'She cocks her head. "I see your surprise. Few would expect it."',
      'The air stirs around you as she lowers her head, bringing her snout to just a few inches from your face.',
      // Other characters may ask you things in their own words.
      '"Will you help me?" she asks. "What do you say, little one?"',
      // Perception and states.
      'You see a door to the north. You can hear water dripping somewhere.',
      'Before you can speak, she raises a claw.',
      'You are standing in a narrow cave.',
      // A whole reply from the second playtest (v0.2.1): it stays on the dragon's side throughout,
      // ending on sensations and reactions, which are allowed.
      '"You\'ve trespassed," she rumbles. "I should kill you. But something... itches." She lowers her head, her nostrils flaring. "I sense... familiarity. Or perhaps it\'s something else." She draws a long breath, and the heat of it washes over you. Her gaze flicks over your body, then back to your face. "Tell me why you are here. Now." Her eyes glow like amethysts, and her jaws hang just far enough apart that the tip of her tongue darts between them. You can feel the pressure of her words like a physical thing. Your mouth goes dry. Your body feels too small.',
    ]
    for (const text of fine) it(text, () => assert.equal(cutAt(text), null))
  })

  it('cuts your character speaking', () => {
    assert.deepEqual(cutAt('The bartender grins. "Thanks," you say. He nods.'), {
      sentence: '"Thanks," you say.',
      reason: 'your character speaks',
    })
    assert.equal(cutAt('You quietly ask her name.')?.reason, 'your character speaks')
  })

  it('cuts your character thinking or deciding', () => {
    assert.equal(cutAt('You wonder if she is lying.')?.reason, "your character's thoughts")
    assert.equal(cutAt('You suddenly realize the dragon is female.')?.reason, "your character's thoughts")
    assert.equal(cutAt('You decide to stay a while.')?.reason, 'your character makes a decision')
  })

  it('cuts any form of "What do you do?"', () => {
    for (const prompt of [
      'What do you do?',
      'What will you do next?',
      'The choice is yours.',
      "What's your next move?",
      'Will you fight, or flee?',
      'It’s your move.',
      'How do you respond?',
      'You could run, or you could stand your ground.',
    ]) {
      assert.ok(cutAt(`The door creaks open. ${prompt}`), prompt)
    }
  })

  it('cuts a new action marker', () => {
    assert.equal(cutAt('The ale is warm.\n> You draw your sword.')?.reason, 'starts a new player action (>)')
  })

  it('cuts actions you did not type, unless the referee judges them', () => {
    const text = 'The ale is warm. You nod and set the mug down.'
    assert.deepEqual(cutAt(text), { sentence: 'You nod and set the mug down.', reason: 'an action you didn\'t type ("you nod")' })
    assert.equal(cutAt(text, { strict: false, actions: false }), null)
  })

  it('lets the reply carry out what you typed', () => {
    const options = { ...REACTIONS, playerInput: 'You approach the dragon.' }
    assert.equal(cutAt('As you approach, the dragon lifts her head.', options), null)
    assert.equal(cutAt('You approached slowly. She watches.', options), null)
  })

  it('allows physical reactions, except in strict mode', () => {
    const text = 'The ale burns your throat, and you cough.'
    assert.equal(cutAt(text), null)
    assert.match(cutAt(text, { strict: true, actions: false })?.reason ?? '', /strict mode/)
    // From playtesting: swallowing hard is a reaction, not a deliberate action.
    const swallow = 'You swallow hard, trying to speak, but your throat is dry.'
    assert.equal(cutAt(swallow, { ...REACTIONS, playerInput: 'You restate "Speak…with?"' }), null)
    assert.match(cutAt(swallow, { strict: true, actions: true })?.reason ?? '', /strict mode/)
  })

  it('leaves unmarked thoughts and unattributed lines to the referee', () => {
    // From the stop tests: both write for the player, but patterns can't tell.
    assert.equal(cutAt('Her? The dragon is... a woman?'), null)
    assert.equal(cutAt('"First... guest?"\nShe doesn\'t reply right away.'), null)
  })
})
