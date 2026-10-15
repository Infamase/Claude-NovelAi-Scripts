import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installMockApi } from './helpers/mockApi.ts'
import { gameStateBlock } from '../src/state/gameState.ts'
import {
  DEFAULT_PRICES,
  INV,
  addItem,
  adjustCount,
  initInventory,
  inventoryLines,
  priceList,
  readInventory,
  removeItem,
  type Inventory,
} from '../src/state/inventory.ts'

const item = (name: string, quantity = 1, equipped = false, note = '') => ({ id: name, name, quantity, equipped, note })

const INVENTORY: Inventory = {
  share: true,
  currency: 'crowns',
  amount: 45,
  prices: 'a hot meal: 2\na rug - 30\n\na horse = 300',
  items: [item('healing potion', 3), item('iron sword', 1, true, 'notched blade'), item('rope'), item('leather armor', 1, true)],
}

describe('inventoryLines', () => {
  it('tells the AI the money, the prices it is worth, and what is equipped and carried', () => {
    assert.deepEqual(inventoryLines(INVENTORY), [
      'Money: 45 crowns.',
      'Typical prices in crowns: a hot meal 2, a rug 30, a horse 300. Keep every price in the story in line with these.',
      'Equipped: iron sword (notched blade), leather armor.',
      'Carrying: healing potion ×3, rope.',
    ])
  })

  it('skips unnamed and used-up items, and says when nothing else is carried', () => {
    const lines = inventoryLines({ ...INVENTORY, prices: '', items: [item('torch', 0), item('  '), item('lantern', 1, true)] })
    assert.deepEqual(lines, ['Money: 45 crowns.', 'Equipped: lantern.', 'Carrying: nothing else.'])
  })

  it('sends nothing when sharing is off or the inventory is empty', () => {
    assert.deepEqual(inventoryLines({ ...INVENTORY, share: false }), [])
    assert.deepEqual(inventoryLines({ ...INVENTORY, amount: 0, items: [] }), [])
    // Being broke still matters once there are items.
    assert.equal(inventoryLines({ ...INVENTORY, amount: 0 })[0], 'Money: 0 crowns.')
  })
})

describe('priceList', () => {
  it('reads "item: price" lines in a few common styles', () => {
    assert.equal(priceList('a hot meal: 2\na two-handed sword: 80\nRug - 30\na horse = 300 crowns'), 'a hot meal 2, a two-handed sword 80, Rug 30, a horse 300 crowns')
    assert.equal(priceList('everything is cheap here'), 'everything is cheap here')
    assert.equal(priceList('\n  \n'), '')
  })

  it('has a sensible default guide', () => {
    assert.match(priceList(DEFAULT_PRICES), /a hot meal 2, a night at an inn 5, a rug or simple tools 30, a sword 50/)
  })
})

describe('gameStateBlock', () => {
  it('lists the state under one heading, or gives nothing', () => {
    assert.equal(gameStateBlock(['Money: 1 gold.', 'Carrying: rope.']), 'Game state (keep the story consistent with it):\n- Money: 1 gold.\n- Carrying: rope.')
    assert.equal(gameStateBlock([]), undefined)
  })
})

describe('inventory storage', () => {
  it('starts with gold and the default price guide, and adds, counts and removes items', async () => {
    const mock = installMockApi()
    await initInventory()
    let inv = await readInventory()
    assert.deepEqual({ ...inv, items: inv.items.length }, { share: true, currency: 'gold', amount: 0, prices: DEFAULT_PRICES, items: 0 })

    const id = await addItem()
    mock.story.set(INV.item(id, 'name'), 'rope')
    await adjustCount(INV.item(id, 'quantity'), 1, 1)
    await adjustCount(INV.amount, -5)
    inv = await readInventory()
    assert.deepEqual(inv.items, [{ id, name: 'rope', quantity: 2, equipped: false, note: '' }])
    assert.equal(inv.amount, 0, 'money never goes below zero')

    // Inputs store what was typed: text is read as a number, and an emptied field falls back.
    mock.story.set(INV.amount, '12')
    mock.story.set(INV.item(id, 'quantity'), '')
    inv = await readInventory()
    assert.equal(inv.amount, 12)
    assert.equal(inv.items[0].quantity, 1)

    await removeItem(id)
    assert.deepEqual((await readInventory()).items, [])
    assert.ok(![...mock.story.keys()].some((key) => key.includes(id)), 'the item keys are cleaned up')
  })
})
