import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installMockApi, tokenize, type MockOptions } from './helpers/mockApi.ts'
import { registerTurnGuard } from '../src/guard/turnGuard.ts'
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

const status = (mock: Mock) => String(mock.story.get(KEYS.lastTurnStatus))

describe('turn guard', () => {
  it('does nothing in stories where it is off', async () => {
    const mock = await setup({}, { enabled: false })
    const reply = 'The ale is warm. "Thanks," you say. What do you do?'
    assert.equal(await turn(mock, 'You drink the ale.', reply), reply)
    assert.equal(mock.last.context?.[3].content, 'You drink the ale.')
    assert.equal(mock.last.contextLimitReduction, undefined)
  })

  it('adds the rules after your input and makes room for them', async () => {
    const mock = await setup()
    await turn(mock, 'You drink the ale.', 'The ale is warm.')
    assert.match(mock.last.context?.[3].content ?? '', /^You drink the ale\.\n\n\[ Narration rules for this reply:/)
    assert.ok((mock.last.contextLimitReduction ?? 0) > 50)
  })

  it('keeps a reply that stays on the right side of the line', async () => {
    const mock = await setup()
    const reply = 'The ale is warm and bitter. The bartender grins.'
    assert.equal(await turn(mock, 'You drink the ale.', reply), reply)
    assert.match(status(mock), /nothing to cut \(2 sentences\)\.\nReferee: no problems/)
  })

  it('cuts at your character speaking, and only asks the referee about the part before it', async () => {
    const mock = await setup()
    const kept = await turn(mock, 'You drink the ale.', 'The ale is warm. The bartender grins. "Thanks," you say. He nods.')
    assert.equal(kept, 'The ale is warm. The bartender grins.')
    assert.match(status(mock), /kept 2 of 4 sentences\. Cut from: "\\"Thanks,\\" you say\."\nWhy: your character speaks \(found by the pattern rules\)/)
    assert.match(mock.refereeCalls[0][1].content ?? '', /\n1\. The ale is warm\.\n2\. The bartender grins\.\n\nWhich/)
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
    assert.match(mock.refereeCalls[0][1].content ?? '', /The player typed:\n"""\nYou touch the dragon\.\n"""/)
  })

  it('adds nothing, and says so, when the reply starts by writing for you', async () => {
    const mock = await setup({ referee: () => '1' })
    const kept = await turn(mock, 'You approach the dragon.', '"First... guest?"\nShe doesn\'t reply right away.')
    assert.equal(kept, '')
    assert.match(status(mock), /nothing was kept/)
    assert.match(mock.toasts.at(-1) ?? '', /nothing was added\. Press Retry/)
  })

  it('falls back to the pattern rules for actions when the referee fails', async () => {
    const mock = await setup({ generateError: 'busy' })
    const kept = await turn(mock, 'You drink the ale.', 'The ale is warm. You nod and set the mug down.')
    assert.equal(kept, 'The ale is warm.')
    assert.match(status(mock), /Referee: unavailable \(busy\), so the pattern rules checked for actions too/)
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
})
