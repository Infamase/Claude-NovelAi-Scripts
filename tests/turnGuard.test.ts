import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installMockApi, tokenize, type MockOptions } from './helpers/mockApi.ts'
import { registerTurnGuard, runRefereeTest } from '../src/guard/turnGuard.ts'
import { GAME_FRAMING } from '../src/guard/rules.ts'
import { KEYS } from '../src/keys.ts'

type Mock = ReturnType<typeof installMockApi>

async function setup(options: MockOptions = {}, settings: { enabled?: boolean; referee?: boolean; strict?: boolean } = {}) {
  const mock = installMockApi(options)
  registerTurnGuard()
  mock.story.set(KEYS.enabled, settings.enabled ?? true)
  mock.account.set(KEYS.referee, settings.referee ?? true)
  mock.account.set(KEYS.strict, settings.strict ?? false)
  return mock
}

async function turn(mock: Mock, input: string, reply: string) {
  await mock.playTurn(input, tokenize(reply))
  await mock.settle()
  return mock.lastReply()
}

async function retry(mock: Mock, reply: string) {
  await mock.playRetry(tokenize(reply))
  await mock.settle()
  return mock.lastReply()
}

const status = (mock: Mock) => String(mock.story.get(KEYS.lastTurnStatus))
const refereePromptOf = (mock: Mock, call = 0) => mock.refereeCalls[call].messages[1].content ?? ''

/** A reply that writes for the player from its first sentence (from the stop tests). */
const BAD = '"First... guest?"\nShe doesn\'t reply right away.'

describe('turn guard', () => {
  it('does nothing in stories where it is off', async () => {
    const mock = await setup({}, { enabled: false })
    const reply = 'The ale is warm. "Thanks," you say. What do you do?'
    assert.equal(await turn(mock, 'You drink the ale.', reply), reply)
    assert.equal(mock.last.context?.[3].content, 'You drink the ale.')
    assert.equal(mock.last.contextLimitReduction, undefined)
  })

  it('marks your input as your action, adds the rules and framing, and makes room for them', async () => {
    const mock = await setup()
    await turn(mock, 'You drink the ale.', 'The ale is warm.')
    assert.match(
      mock.last.context?.[3].content ?? '',
      /^The player's action:\nYou drink the ale\.\n\nNarrate what happens as a direct result of this, then stop\. Rules:\n1\./,
    )
    assert.equal(mock.last.context?.[0].content, `You are Xialong.\n\n${GAME_FRAMING}`)
    assert.ok((mock.last.contextLimitReduction ?? 0) > 100)
  })

  it('keeps a reply that stays on the right side of the line', async () => {
    const mock = await setup()
    const reply = 'The ale is warm and bitter. The bartender grins.'
    assert.equal(await turn(mock, 'You drink the ale.', reply), reply)
    assert.match(status(mock), /nothing to cut \(2 sentences\)\.\nReferee: no problems \([\w-]+, \d+\.\d s\)/)
  })

  it('cuts at your character speaking, and only asks the referee about the part before it', async () => {
    const mock = await setup()
    const kept = await turn(mock, 'You drink the ale.', 'The ale is warm. The bartender grins. "Thanks," you say. He nods.')
    assert.equal(kept, 'The ale is warm. The bartender grins.')
    assert.match(status(mock), /kept 2 of 4 sentences\. Cut from: "\\"Thanks,\\" you say\."\nWhy: your character speaks \(found by the pattern rules\)/)
    assert.match(refereePromptOf(mock), /\n1\. The ale is warm\.\n2\. The bartender grins\.\n\nWhich/)
  })

  it('cuts "What do you do?"', async () => {
    const mock = await setup()
    assert.equal(await turn(mock, 'You look around.', 'The cave is dark.\n\nWhat do you do?'), 'The cave is dark.')
  })

  it('cuts where the referee says, catching what patterns miss', async () => {
    const mock = await setup({ referee: () => '2' })
    const kept = await turn(mock, 'You touch the dragon.', 'Her scales are warm. Her? The dragon is... a woman? She rumbles.')
    assert.equal(kept, 'Her scales are warm.')
    assert.match(status(mock), /Why: writes for your character \(found by the referee\)\.\nReferee: flagged sentence 2/)
    assert.match(refereePromptOf(mock), /The player typed:\n"""\nYou touch the dragon\.\n"""/)
  })

  it('asks the AI again, twice at most, when nothing of a reply can be kept', async () => {
    const mock = await setup({ referee: (messages) => (messages[1].content?.includes('First... guest?') ? '1' : '0') })
    assert.equal(await turn(mock, 'You approach the dragon.', BAD), '')
    assert.match(status(mock), /nothing was kept[\s\S]*Asking the AI again automatically \(1 of 2\)/)
    assert.match(mock.toasts.at(-1) ?? '', /so it was dropped\. Asking again \(1 of 2\)/)
    await mock.runTimers()
    assert.equal(mock.counts.editorGenerate, 1)

    // The retry is script-started; it is guarded too, and sees the same input.
    assert.equal(await retry(mock, BAD), '')
    assert.match(refereePromptOf(mock, mock.refereeCalls.length - 1), /The player typed:\n"""\nYou approach the dragon\.\n"""/)
    await mock.runTimers()
    assert.equal(mock.counts.editorGenerate, 2)

    assert.equal(await retry(mock, BAD), '')
    assert.match(mock.toasts.at(-1) ?? '', /still no usable reply after 3 tries\. Try rewording your action\./)
    await mock.runTimers()
    assert.equal(mock.counts.editorGenerate, 2)

    // A new input starts the count again.
    assert.equal(await turn(mock, 'You wait.', 'The dragon watches you.'), 'The dragon watches you.')
    assert.equal(await turn(mock, 'You approach the dragon.', BAD), '')
    await mock.runTimers()
    assert.equal(mock.counts.editorGenerate, 3)
  })

  it('drops a scene break at the start and cuts at one later on', async () => {
    // The reply from the third playtest, with its paragraph breaks.
    const reply = [
      '***',
      '"Speak with? Yes, with," she says, tilting her head, studying you with unnerving intensity. Her voice reverberates in your skull like a drumbeat.',
      'The air around you feels heavy, pressing you back. Your mouth opens, but no words come out.',
      '"Tell me your name, or we\'ll see if you\'re more talkative as a smear on the wall."',
      'The cave is silent, except for your pulse pounding in your ears. The dragon waits.',
      '***',
      '[ Dragonfire and Doubts ]',
      'You blink at her. Then, "That\'s not my name."',
    ].join('\n')
    const mock = await setup()
    const kept = await turn(mock, 'You ask "Speak with?"', reply)
    assert.ok(kept.startsWith('"Speak with? Yes, with," she says'), kept)
    assert.ok(kept.endsWith('The dragon waits.'), kept)
    assert.match(status(mock), /Why: starts a new scene or chapter \(found by the pattern rules\)\.\nRemoved a scene break or heading from the start\./)
    // The referee only judges the reply proper: no leading marker, nothing from the cut on.
    assert.match(refereePromptOf(mock), /\n1\. "Speak with\?\n/)
    assert.doesNotMatch(refereePromptOf(mock), /Dragonfire|\d\. \*\*\*/)
    assert.match(String(mock.story.get(KEYS.lastTurnDetails)), /\n {2}1 – "\*\*\*"\n/)
  })

  it('keeps nothing from a reply that is only scene breaks and headings', async () => {
    const mock = await setup()
    assert.equal(await turn(mock, 'You wait.', '***\n[ Chapter 2 ]'), '')
    assert.match(status(mock), /nothing was kept\. The reply was only scene breaks or headings/)
    assert.equal(mock.refereeCalls.length, 0)
  })

  it('falls back to GLM 4.6 for the referee when the story model fails', async () => {
    const mock = await setup({
      referee: (_messages, params) => {
        if (params.model === 'xialong-v1') throw { message: 'Model not supported', status: 400 }
        return '0'
      },
    })
    await turn(mock, 'You drink the ale.', 'The ale is warm.')
    assert.match(status(mock), /Referee: no problems \(glm-4-6, /)
  })

  it('falls back to the pattern rules for actions when the referee fails, and says why', async () => {
    const mock = await setup({
      referee: () => {
        throw { message: 'busy' }
      },
    })
    const kept = await turn(mock, 'You drink the ale.', 'The ale is warm. You nod and set the mug down.')
    assert.equal(kept, 'The ale is warm.')
    // Every model was tried (whichever worked last goes first), and each failure is named.
    assert.match(status(mock), /Referee: unavailable \(.*\), so the pattern rules checked for actions too/)
    assert.match(status(mock), /xialong-v1: busy/)
    assert.match(status(mock), /glm-4-6: busy/)
  })

  it('uses the pattern rules for actions when the referee is off', async () => {
    const mock = await setup({}, { referee: false })
    assert.equal(await turn(mock, 'You drink the ale.', 'The ale is warm. You nod and set the mug down.'), 'The ale is warm.')
    assert.equal(mock.refereeCalls.length, 0)
  })

  it('removes an unfinished last sentence', async () => {
    const mock = await setup()
    assert.equal(await turn(mock, 'You wait.', 'Night falls. The fire crackles as the'), 'Night falls.')
    assert.match(status(mock), /minus an unfinished last sentence/)
  })

  it('holds the reply back until it is finished', async () => {
    const mock = await setup()
    const results: unknown[] = []
    const onResponse = mock.hooks.onResponse
    mock.hooks.onResponse = async (params: any) => {
      const result = await onResponse(params)
      results.push(result)
      return result
    }
    await turn(mock, 'You wait.', 'Night falls. The fire crackles.')
    assert.deepEqual(results.slice(0, -1), Array(4).fill({ seenData: 0 }))
  })

  it('records details for reporting a bad turn', async () => {
    const mock = await setup({ referee: () => '2' })
    await turn(mock, 'You touch the dragon.', 'Her scales are warm. Her? The dragon is... a woman?')
    const details = String(mock.story.get(KEYS.lastTurnDetails))
    assert.match(details, /Player input: "You touch the dragon\."/)
    assert.match(details, /1 ✓ "Her scales are warm\."\n {2}2 ✂ "Her\?"\n {2}3 · "The dragon is\.\.\. a woman\?"/)
    assert.match(details, /Referee answer: "2"/)
  })

  it('tests the referee on a known sample', async () => {
    const pass = await setup({ referee: () => '2' })
    assert.match(await runRefereeTest(), /^Referee test passed: it found the right sentence \([\w-]+, /)
    assert.match(String(pass.story.get(KEYS.refereeTest)), /passed/)

    await setup({ referee: () => '3' })
    assert.match(await runRefereeTest(), /it works, but answered 3 where 2 was right/)

    await setup({
      referee: () => {
        throw { message: 'not allowed' }
      },
    })
    assert.match(await runRefereeTest(), /^Referee test failed: .*not allowed/)
  })
})
