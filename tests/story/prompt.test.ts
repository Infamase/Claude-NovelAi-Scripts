import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_GUIDE, POV_REMINDER, POV_RULE, storyNote, systemAddition, withStoryPrompt } from '../../src/story/prompt.ts'

// Story mode's context as assumed from Text Adventure's: system, memory with "Write.", the story.
const CONTEXT = [
  { role: 'system' as const, content: 'You are Xialong.' },
  { role: 'user' as const, content: 'Relevant persistent information:\n[ Tags: magic ]\n***\nWrite.' },
  { role: 'assistant' as const, content: 'You stand frozen. "Awake, are we?"' },
]

describe('withStoryPrompt', () => {
  it('adds to the system prompt and puts the note before "Write."', () => {
    const result = withStoryPrompt(CONTEXT, { system: 'GUIDE', note: 'NOTE' })
    assert.equal(result[0].content, 'You are Xialong.\n\nGUIDE')
    assert.equal(result[1].content, 'Relevant persistent information:\n[ Tags: magic ]\n***\n\nNOTE\n\nWrite.')
    assert.deepEqual(result[2], CONTEXT[2])
    assert.equal(CONTEXT[1].content, 'Relevant persistent information:\n[ Tags: magic ]\n***\nWrite.', 'the original is not changed')
  })

  it('appends the note when there is no "Write.", and adds messages that are missing', () => {
    assert.equal(withStoryPrompt([{ role: 'user', content: 'Memory.' }], { note: 'NOTE' })[0].content, 'Memory.\n\nNOTE')
    assert.deepEqual(withStoryPrompt([{ role: 'assistant', content: 'Story.' }], { system: 'GUIDE', note: 'NOTE' }), [
      { role: 'system', content: 'GUIDE' },
      { role: 'user', content: 'NOTE' },
      { role: 'assistant', content: 'Story.' },
    ])
  })

  it('changes nothing without additions', () => {
    assert.deepEqual(withStoryPrompt(CONTEXT, {}), CONTEXT)
  })
})

describe('the additions', () => {
  it('puts the point-of-view rule before the guide, and the game state before the reminder', () => {
    assert.equal(systemAddition(true, 'GUIDE'), `${POV_RULE}\n\nGUIDE`)
    assert.equal(systemAddition(false, '  '), undefined)
    assert.equal(storyNote(true, 'STATE'), `STATE\n\n${POV_REMINDER}`)
    assert.equal(storyNote(false, 'STATE'), 'STATE')
    assert.equal(storyNote(false), undefined)
  })

  it('has a point-of-view rule that names the slips the check looks for', () => {
    assert.match(POV_RULE, /second person, present tense/)
    assert.match(POV_RULE, /never "I", never their name/)
    assert.match(POV_RULE, /even where earlier parts of the story slip/)
  })

  it('has a guide on craft and stock phrases, without brackets', () => {
    assert.match(DEFAULT_GUIDE, /Continue it from exactly where the text stops/)
    assert.match(DEFAULT_GUIDE, /a breath you didn't know you were holding/)
    assert.match(DEFAULT_GUIDE, /Use the game state; never recite it/)
    assert.doesNotMatch(DEFAULT_GUIDE, /\[|\]/)
  })
})
