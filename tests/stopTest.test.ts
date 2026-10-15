import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installMockApi, tokenize, type MockOptions } from './helpers/mockApi.ts'
import { diagnosticsSection, initDiagnostics, registerDiagnosticsHooks } from '../src/diagnostics/stopTest.ts'
import { KEYS } from '../src/keys.ts'

const RESPONSE = 'The ale is warm and bitter. The bartender grins at you. "Another?" he asks. You nod and'
const WANTED = 'The ale is warm and bitter. The bartender grins at you.'

type Mock = ReturnType<typeof installMockApi>

async function setup(options: MockOptions = {}) {
  const mock = installMockApi(options)
  registerDiagnosticsHooks()
  await initDiagnostics()
  mock.story.set(KEYS.diagArmed, true)
  mock.story.set(KEYS.diagStep, 0)
  mock.story.set(KEYS.diagTurns, [])
  return mock
}

async function turn(mock: Mock, response = RESPONSE, batchSize = 1) {
  await mock.playTurn('drink the ale', tokenize(response), batchSize)
  await mock.runTimers()
}

const report = (mock: Mock) => String(mock.story.get(KEYS.diagReport))
const storyText = (mock: Mock) => mock.sections.map((s) => s.text).join('\n')
const verdicts = (mock: Mock) => [...report(mock).matchAll(/At generation end: (\w+)/g)].map((m) => m[1])

describe('stop test', () => {
  it('tries one technique per turn and passes when the editor keeps the text', async () => {
    const mock = await setup()
    for (let i = 1; i <= 3; i++) {
      await turn(mock)
      assert.ok(storyText(mock).endsWith(WANTED), `turn ${i} kept the wrong text`)
      assert.equal(mock.story.get(KEYS.diagStep), i)
    }
    assert.match(report(mock), /3 of 3 turns done/)
    assert.deepEqual(verdicts(mock), ['PASS', 'PASS', 'PASS'])
    assert.equal(mock.story.get(KEYS.diagArmed), false)
  })

  it('shows which techniques fail when a script stop throws the text away', async () => {
    const mock = await setup({ discardOnStop: true, finalAfterStop: true })
    for (let i = 0; i < 3; i++) await turn(mock)
    assert.deepEqual(verdicts(mock), ['FAIL', 'FAIL', 'PASS'])
    assert.match(report(mock), /Turn 1 of 3: Cut and stop in one step\n {2}At generation end: FAIL: none of the generated text/)
  })

  it('trims a final call that resends the whole response instead of blanking it', async () => {
    const mock = await setup({ finalAfterStop: true, finalResendsAll: true })
    for (let i = 0; i < 3; i++) await turn(mock)
    assert.deepEqual(verdicts(mock), ['PASS', 'PASS', 'PASS'])
    assert.match(report(mock), /whole response resent: yes/)
  })

  it('still reports when onGenerationEnd never fires after a stop', async () => {
    const mock = await setup({ endAfterStop: false })
    await turn(mock)
    assert.match(report(mock), /No onGenerationEnd; 4 s after the cut: PASS/)
    assert.match(report(mock), /onGenerationEnd: no/)
  })

  it('works when several tokens arrive per call', async () => {
    const mock = await setup()
    await turn(mock, RESPONSE, 5)
    assert.deepEqual(verdicts(mock), ['PASS'])
  })

  it('stays on the same turn when the response is too short', async () => {
    const mock = await setup()
    await turn(mock, 'Nothing happens.')
    assert.match(report(mock), /INCONCLUSIVE/)
    assert.equal(mock.story.get(KEYS.diagStep), 0)
    assert.equal(mock.story.get(KEYS.diagArmed), true)
  })

  it('does nothing when not armed', async () => {
    const mock = await setup()
    mock.story.set(KEYS.diagArmed, false)
    await turn(mock)
    assert.equal(storyText(mock), `> You drink the ale.\n${RESPONSE}`)
    assert.match(report(mock), /No test run yet/)
  })

  it('records the TA input, context, history and document in the report', async () => {
    const mock = await setup()
    await turn(mock)
    assert.match(report(mock), /TA input: action "drink the ale"\n/)
    assert.match(report(mock), /History node: 1 -> 2 \(latest generation node: 2\)/)
    assert.match(report(mock), /first sentence visible mid-stream: yes/)
    assert.match(report(mock), /#0 system, 19 chars/)
    assert.match(report(mock), /\[action \| user\] "> You drink the ale\."/)
  })

  it('restarts from the first turn when the box is ticked again', async () => {
    const mock = await setup()
    await turn(mock)
    const checkbox: any = (diagnosticsSection() as any).content.find((part: any) => part.type === 'checkboxInput')
    checkbox.onChange(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(mock.story.get(KEYS.diagStep), 0)
    assert.deepEqual(mock.story.get(KEYS.diagTurns), [])
  })
})
