import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { installMockApi } from './helpers/mockApi.ts'
import { IDS } from '../src/keys.ts'
import { INV, initInventory } from '../src/state/inventory.ts'
import { setStoryPanelsVisible } from '../src/ui/storyPanels.ts'

type Mock = ReturnType<typeof installMockApi>

/** All UI parts in the Inventory tab, depth first. */
function parts(mock: Mock): any[] {
  const out: any[] = []
  const walk = (list: any[]) => {
    for (const part of list ?? []) {
      out.push(part)
      walk(part.content)
    }
  }
  walk(mock.extensions.get(IDS.inventoryPanel).content)
  return out
}

const button = (mock: Mock, text: string, nth = 0) => parts(mock).filter((p) => p.type === 'button' && p.text === text)[nth]
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

async function setup() {
  const mock = installMockApi()
  await initInventory()
  await setStoryPanelsVisible(true)
  return mock
}

describe('Inventory tab', () => {
  afterEach(() => setStoryPanelsVisible(false))

  it('has money with a currency name and price guide, and starts with no items', async () => {
    const mock = await setup()
    const labels = parts(mock).map((p) => p.label ?? p.title ?? p.text)
    for (const label of ['Tell the AI about my inventory', 'Amount', 'Currency', 'Price guide', 'Nothing yet.', 'Add item', 'What the AI sees']) {
      assert.ok(labels.includes(label), label)
    }
    assert.equal(parts(mock).find((p) => p.label === 'Currency').storageKey, `story:${INV.currency}`)
    assert.match(String(mock.story.get(INV.preview)), /^Nothing yet/)
  })

  it('adds an item, steps its quantity, previews it, and removes it', async () => {
    const mock = await setup()
    await button(mock, 'Add item').callback()
    await settle()
    const ids = mock.story.get(INV.items) as string[]
    assert.equal(ids.length, 1)
    assert.ok(parts(mock).some((p) => p.storageKey === `story:${INV.item(ids[0], 'name')}`), 'the tab was rebuilt with the item')

    mock.story.set(INV.item(ids[0], 'name'), 'rope')
    // The money − and + come first, then the item's.
    await button(mock, '+', 1).callback()
    await button(mock, '+', 0).callback()
    await settle()
    assert.equal(mock.story.get(INV.item(ids[0], 'quantity')), 2)
    assert.equal(mock.story.get(INV.amount), 1)

    await mock.runTimers()
    assert.equal(
      mock.story.get(INV.preview),
      'Game state (keep the story consistent with it):\n- Money: 1 gold.\n- Typical prices in gold: bread or a mug of ale 1, a hot meal 2, a night at an inn 5, a rug or simple tools 30, a sword 50, a horse 300. Keep every price in the story in line with these.\n- Carrying: rope ×2.',
    )

    await button(mock, 'Remove').callback()
    await settle()
    assert.deepEqual(mock.story.get(INV.items), [])
    assert.ok(parts(mock).some((p) => p.text === 'Nothing yet.'))
  })

  it('says so in the preview when sharing is off', async () => {
    const mock = await setup()
    mock.story.set(INV.share, false)
    parts(mock).find((p) => p.label === 'Tell the AI about my inventory').onChange(false)
    await mock.runTimers()
    assert.match(String(mock.story.get(INV.preview)), /turned off/)
  })
})
