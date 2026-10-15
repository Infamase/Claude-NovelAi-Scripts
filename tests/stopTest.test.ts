import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installMockApi, tokenize } from './helpers/mockApi.ts'
import { initDiagnostics, registerDiagnosticsHooks } from '../src/diagnostics/stopTest.ts'
import { KEYS } from '../src/keys.ts'

const RESPONSE = 'The ale is warm and bitter. The bartender grins at you. "Another?" he asks. You nod and'

async function setup(options: Parameters<typeof installMockApi>[0] = {}) {
  const mock = installMockApi(options)
  registerDiagnosticsHooks()
  await initDiagnostics()
  mock.story.set(KEYS.diagArmed, true)
  return mock
}

const report = (mock: ReturnType<typeof installMockApi>) => String(mock.story.get(KEYS.diagReport))
const storyText = (mock: ReturnType<typeof installMockApi>) => mock.sections.map((s) => s.text).join('\n')

describe('stop test', () => {
  it('passes when trimmed text sent with the stop lands', async () => {
    const mock = await setup()
    await mock.playTurn('drink the ale', tokenize(RESPONSE))
    assert.match(report(mock), /Result: PASS/)
    assert.equal(storyText(mock), '> You drink the ale.\nThe ale is warm and bitter. The bartender grins at you.')
    assert.equal(mock.story.get(KEYS.diagArmed), false)
  })

  it('reports dropped text when only the early part lands', async () => {
    const mock = await setup({ placeTextOnStop: false })
    await mock.playTurn('drink the ale', tokenize(RESPONSE))
    assert.match(report(mock), /Result: PARTIAL: the early text landed, but the trimmed text sent with the stop was dropped/)
  })

  it('still reports when onGenerationEnd never fires after a stop', async () => {
    const mock = await setup({ endAfterStop: false })
    await mock.playTurn('drink the ale', tokenize(RESPONSE))
    assert.match(report(mock), /No test run yet/)
    await mock.runTimers()
    assert.match(report(mock), /Result: PASS/)
    assert.match(report(mock), /onGenerationEnd fired: no/)
  })

  it('works when several tokens arrive per call', async () => {
    const mock = await setup()
    await mock.playTurn('drink the ale', tokenize(RESPONSE), 5)
    assert.match(report(mock), /Result: PASS/)
  })

  it('stays armed when the response is too short to test', async () => {
    const mock = await setup()
    await mock.playTurn('wait', tokenize('Nothing happens.'))
    assert.match(report(mock), /Result: INCONCLUSIVE/)
    assert.equal(mock.story.get(KEYS.diagArmed), true)
  })

  it('does nothing when not armed', async () => {
    const mock = await setup()
    mock.story.set(KEYS.diagArmed, false)
    await mock.playTurn('drink the ale', tokenize(RESPONSE))
    assert.equal(storyText(mock), `> You drink the ale.\n${RESPONSE}`)
    assert.match(report(mock), /No test run yet/)
  })

  it('records the TA input and context in the report', async () => {
    const mock = await setup()
    await mock.playTurn('drink the ale', tokenize(RESPONSE))
    assert.match(report(mock), /TA input: action \| input "drink the ale" .* same turn: yes/)
    assert.match(report(mock), /#0 system, 19 chars/)
    assert.match(report(mock), /\[action \| user\] "> You drink the ale\."/)
  })
})
