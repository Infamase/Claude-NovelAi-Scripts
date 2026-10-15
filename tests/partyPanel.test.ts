import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { installMockApi } from './helpers/mockApi.ts'
import { IDS } from '../src/keys.ts'
import { initInventory } from '../src/state/inventory.ts'
import { PARTY, initParty } from '../src/state/party.ts'
import { setStoryPanelsVisible } from '../src/ui/storyPanels.ts'

type Mock = ReturnType<typeof installMockApi>

/** All UI parts in the Party tab, depth first. */
function parts(mock: Mock): any[] {
  const out: any[] = []
  const walk = (list: any[]) => {
    for (const part of list ?? []) {
      out.push(part)
      walk(part.content)
    }
  }
  walk(mock.extensions.get(IDS.partyPanel).content)
  return out
}

const buttons = (mock: Mock, text: string) => parts(mock).filter((p) => p.type === 'button' && p.text === text)
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

async function setup() {
  const mock = installMockApi()
  await initParty()
  await initInventory()
  await setStoryPanelsVisible(true)
  return mock
}

async function addCompanion(mock: Mock, name: string) {
  await buttons(mock, 'Add companion')[0].callback()
  await settle()
  const ids = mock.story.get(PARTY.members) as string[]
  const id = ids[ids.length - 1]
  mock.story.set(PARTY.member(id, 'name'), name)
  return id
}

describe('Party tab', () => {
  afterEach(() => setStoryPanelsVisible(false))

  it('starts empty, with a way to add companions and a preview', async () => {
    const mock = await setup()
    const labels = parts(mock).map((p) => p.label ?? p.title ?? p.text)
    for (const label of ['Tell the AI about my party', 'No companions yet.', 'Add companion', 'What the AI sees']) {
      assert.ok(labels.includes(label), label)
    }
    assert.match(String(mock.story.get(PARTY.preview)), /^Nothing yet/)
  })

  it('gives each companion their fields, with quick picks for status and attitude', async () => {
    const mock = await setup()
    const id = await addCompanion(mock, 'Lyra')
    const labels = parts(mock).map((p) => p.label ?? p.text)
    for (const label of ['Name', 'Who they are', 'In party', 'Status', 'Attitude toward you', 'Notes', 'Wounded', 'Loyal', 'Move up', 'Move down', 'Remove']) {
      assert.ok(labels.includes(label), label)
    }

    await buttons(mock, 'Wounded')[0].callback()
    await buttons(mock, 'Loyal')[0].callback()
    await settle()
    assert.equal(mock.story.get(PARTY.member(id, 'status')), 'Wounded')
    assert.equal(mock.story.get(PARTY.member(id, 'attitude')), 'Loyal')
    await mock.runTimers()
    assert.equal(
      mock.story.get(PARTY.preview),
      'Game state (keep the story consistent with it):\n- Companion: Lyra. Status: Wounded. Attitude toward you: Loyal.',
    )
  })

  it('reorders and removes companions', async () => {
    const mock = await setup()
    const lyra = await addCompanion(mock, 'Lyra')
    const bram = await addCompanion(mock, 'Bram')
    assert.equal(buttons(mock, 'Move up')[0].disabled, true, 'the first companion cannot move up')
    assert.equal(buttons(mock, 'Move down')[1].disabled, true, 'the last cannot move down')

    await buttons(mock, 'Move up')[1].callback()
    await settle()
    assert.deepEqual(mock.story.get(PARTY.members), [bram, lyra])

    await buttons(mock, 'Remove')[0].callback()
    await settle()
    assert.deepEqual(mock.story.get(PARTY.members), [lyra])
    assert.equal(buttons(mock, 'Remove').length, 1, 'the tab was rebuilt')
  })
})
