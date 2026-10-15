import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { narratorRules, turnContext, withRules } from '../src/guard/rules.ts'
import { parseRefereeAnswer, refereePrompt } from '../src/guard/referee.ts'

// The layout Xialong's context had in the stop tests.
const CONTEXT = [
  { role: 'system' as const, content: 'You are Xialong.' },
  { role: 'user' as const, content: 'Relevant persistent information:\n[ Tags: magic ]\n***\nWrite.' },
  { role: 'assistant' as const, content: '[ Chapter 1 ]\nYou stand frozen. "Awake, are we?"' },
  { role: 'user' as const, content: 'You approach the dragon.\nYou touch the dragon.' },
  { role: 'assistant' as const, content: '' },
]

describe('withRules', () => {
  it('appends the rules to the player\'s latest input', () => {
    const result = withRules(CONTEXT, 'RULES')
    assert.equal(result[3].content, 'You approach the dragon.\nYou touch the dragon.\n\nRULES')
    assert.deepEqual(result.slice(0, 3), CONTEXT.slice(0, 3))
    assert.equal(CONTEXT[3].content, 'You approach the dragon.\nYou touch the dragon.', 'the original is not changed')
  })

  it('falls back to the system prompt, or a new system message', () => {
    assert.equal(withRules([{ role: 'system', content: 'S' }, { role: 'assistant', content: 'A' }], 'R')[0].content, 'S\n\nR')
    assert.deepEqual(withRules([{ role: 'assistant', content: 'A' }], 'R')[0], { role: 'system', content: 'R' })
  })
})

describe('narratorRules', () => {
  it('bans writing for the player and ending on a question', () => {
    const rules = narratorRules(false)
    assert.match(rules, /Never write the player character's speech, thoughts/)
    assert.match(rules, /never on a question: do not ask what the player does/)
    assert.match(rules, /Involuntary physical reactions .* are fine/)
    assert.doesNotMatch(narratorRules(true), /are fine/)
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
    assert.match(user.content ?? '', /involuntary physical reactions/)
  })

  it('reads its answer', () => {
    assert.equal(parseRefereeAnswer('2', 5), 2)
    assert.equal(parseRefereeAnswer(' 0\n', 5), 0)
    assert.equal(parseRefereeAnswer('Sentence 3.', 5), 3)
    assert.equal(parseRefereeAnswer('None', 5), 0)
    assert.equal(parseRefereeAnswer('7', 5), undefined)
    assert.equal(parseRefereeAnswer('', 5), undefined)
  })
})
