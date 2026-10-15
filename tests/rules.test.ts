import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GAME_FRAMING, narratorRules, turnContext, withRules } from '../src/guard/rules.ts'
import { describeError, parseRefereeAnswer, refereePrompt } from '../src/guard/referee.ts'

// The layout Xialong's context had in the stop tests.
const CONTEXT = [
  { role: 'system' as const, content: 'You are Xialong.' },
  { role: 'user' as const, content: 'Relevant persistent information:\n[ Tags: magic ]\n***\nWrite.' },
  { role: 'assistant' as const, content: '[ Chapter 1 ]\nYou stand frozen. "Awake, are we?"' },
  { role: 'user' as const, content: 'You approach the dragon.\nYou touch the dragon.' },
  { role: 'assistant' as const, content: '' },
]

describe('withRules', () => {
  it('marks your input as your action and puts the rules right after it', () => {
    const result = withRules(CONTEXT, false)
    assert.equal(
      result[3].content,
      `The player's action:\nYou approach the dragon.\nYou touch the dragon.\n\n${narratorRules(false)}`,
    )
    assert.deepEqual(result.slice(1, 3), CONTEXT.slice(1, 3))
    assert.equal(CONTEXT[3].content, 'You approach the dragon.\nYou touch the dragon.', 'the original is not changed')
  })

  it('says in the system prompt that this is a text adventure', () => {
    assert.equal(withRules(CONTEXT, false)[0].content, `You are Xialong.\n\n${GAME_FRAMING}`)
    assert.deepEqual(withRules([{ role: 'assistant', content: 'A' }], false)[0].role, 'system')
  })

  it('puts the rules after the latest user message when there is no input', () => {
    const result = withRules(CONTEXT.slice(0, 3), true)
    assert.equal(result[1].content, `${CONTEXT[1].content}\n\n${narratorRules(true)}`)
    assert.equal(result[2].content, CONTEXT[2].content)
  })
})

describe('narratorRules', () => {
  it('bans writing for the player, questions and long replies, without brackets', () => {
    const rules = narratorRules(false)
    assert.match(rules, /Never write the player character's speech, thoughts, decisions or deliberate actions/)
    assert.match(rules, /Never continue a conversation on their behalf/)
    // From the fourth playtest: the dragon answered a reply the player never gave.
    assert.match(rules, /When someone asks them something or waits for their answer, end the reply there/)
    assert.match(rules, /never have anyone react to an answer they haven't given/)
    assert.match(rules, /never on a question to the player: do not ask what they do/)
    assert.match(rules, /Keep it short/)
    assert.match(rules, /^1\. Begin with how the world responds\. Do not repeat or retell what the player wrote/m)
    assert.match(rules, /Stay in this scene: no scene breaks, headings or chapter titles/)
    assert.match(rules, /Involuntary physical reactions, like a flinch or a racing heart, are fine/)
    assert.match(narratorRules(true), /not even physical reactions/)
    assert.doesNotMatch(rules, /\[|\]/)
  })
})

describe('turnContext', () => {
  it('finds the latest input and the story before it', () => {
    assert.deepEqual(turnContext(CONTEXT), {
      playerInput: 'You approach the dragon.\nYou touch the dragon.',
      storyTail: '[ Chapter 1 ]\nYou stand frozen. "Awake, are we?"',
    })
  })

  it('has no input when the story just continues', () => {
    assert.equal(turnContext(CONTEXT.slice(0, 3)).playerInput, undefined)
  })
})

describe('referee', () => {
  it('numbers the sentences and includes the turn', () => {
    const [system, user] = refereePrompt({
      storyTail: 'Story.',
      playerInput: 'You touch the dragon.',
      sentences: [' Her? ', 'The dragon is... a woman?'],
      strict: false,
    })
    assert.equal(system.role, 'system')
    assert.match(user.content ?? '', /The player typed:\n"""\nYou touch the dragon\.\n"""/)
    assert.match(user.content ?? '', /\n1\. Her\?\n2\. The dragon is\.\.\. a woman\?\n/)
    assert.match(user.content ?? '', /never a reason to flag a sentence: .*such as a dry mouth, a racing heart/)
    assert.match(user.content ?? '', /Only flag a sentence that clearly breaks the rule/)
    assert.match(user.content ?? '', /another character reacting to an answer or action from the player character that never happened/)
    assert.match(user.content ?? '', /Answer with two numbers separated by a space/)
    assert.match(user.content ?? '', /If such an opening breaks the rule, it will be removed/)
    const [, strictUser] = refereePrompt({ sentences: ['x'], strict: true })
    assert.match(strictUser.content ?? '', /not even physical reactions or sensations/)
    assert.doesNotMatch(strictUser.content ?? '', /dry mouth/)
  })

  it('reads its answer', () => {
    // Two numbers: where an opening retelling ends, then the first problem after it.
    assert.deepEqual(parseRefereeAnswer('0 0', 5), { retold: 0, flagged: 0 })
    assert.deepEqual(parseRefereeAnswer('3 5', 5), { retold: 3, flagged: 5 })
    assert.deepEqual(parseRefereeAnswer(' 2 0\n', 5), { retold: 2, flagged: 0 })
    assert.deepEqual(parseRefereeAnswer('3 2', 5), { retold: 3, flagged: 0 }, 'a flag inside the retelling goes with it')
    // A single number is the first problem.
    assert.deepEqual(parseRefereeAnswer('2', 5), { retold: 0, flagged: 2 })
    assert.deepEqual(parseRefereeAnswer('Sentence 3.', 5), { retold: 0, flagged: 3 })
    assert.deepEqual(parseRefereeAnswer('None', 5), { retold: 0, flagged: 0 })
    assert.equal(parseRefereeAnswer('7', 5), undefined)
    assert.equal(parseRefereeAnswer('0 9', 5), undefined)
    assert.equal(parseRefereeAnswer('', 5), undefined)
  })

  it('describes errors that are plain objects, not "[object Object]"', () => {
    assert.equal(describeError({ message: 'Model not supported', status: 400 }), 'Model not supported (400)')
    assert.equal(describeError({ detail: 'nope' }), '{"detail":"nope"}')
    assert.equal(describeError(new Error('boom')), 'boom')
  })
})
