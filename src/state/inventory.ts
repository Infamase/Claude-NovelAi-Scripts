// The player's inventory: money, a price guide, and items. Kept in the story, one storage key per
// field, so the Inventory tab's inputs can bind to them directly and update live.

import { count, idList, text } from './store.ts'

export type Item = { id: string; name: string; quantity: number; equipped: boolean; note: string }

export type Inventory = {
  /** Whether the inventory is sent to the AI. */
  share: boolean
  currency: string
  amount: number
  prices: string
  items: Item[]
}

type ItemField = 'name' | 'quantity' | 'equipped' | 'note'

export const INV = {
  share: 'tap.inv.share',
  currency: 'tap.inv.currency',
  amount: 'tap.inv.amount',
  prices: 'tap.inv.prices',
  /** The item ids, in the order shown. */
  items: 'tap.inv.items',
  /** What the AI sees, for the tab's preview. */
  preview: 'tap.inv.preview',
  item: (id: string, field: ItemField) => `tap.inv.item.${id}.${field}`,
} as const

/** A starting price guide in a typical fantasy economy, for the player to adjust. */
export const DEFAULT_PRICES = [
  'bread or a mug of ale: 1',
  'a hot meal: 2',
  'a night at an inn: 5',
  'a rug or simple tools: 30',
  'a sword: 50',
  'a horse: 300',
].join('\n')

const ITEM_FIELDS: ItemField[] = ['name', 'quantity', 'equipped', 'note']

export async function initInventory(): Promise<void> {
  const s = api.v1.storyStorage
  await s.setIfAbsent(INV.share, true)
  await s.setIfAbsent(INV.currency, 'gold')
  await s.setIfAbsent(INV.amount, 0)
  await s.setIfAbsent(INV.prices, DEFAULT_PRICES)
  await s.setIfAbsent(INV.items, [])
}

export async function readInventory(): Promise<Inventory> {
  const s = api.v1.storyStorage
  const items = await Promise.all(
    (await itemIds()).map(async (id) => ({
      id,
      name: text(await s.get(INV.item(id, 'name'))),
      quantity: count(await s.get(INV.item(id, 'quantity')), 1),
      equipped: (await s.get(INV.item(id, 'equipped'))) === true,
      note: text(await s.get(INV.item(id, 'note'))),
    })),
  )
  return {
    share: (await s.get(INV.share)) !== false,
    currency: text(await s.get(INV.currency)).trim() || 'gold',
    amount: count(await s.get(INV.amount), 0),
    prices: text(await s.get(INV.prices)),
    items,
  }
}

export async function addItem(): Promise<string> {
  const id = api.v1.uuid()
  const s = api.v1.storyStorage
  await s.set(INV.item(id, 'name'), '')
  await s.set(INV.item(id, 'quantity'), 1)
  await s.set(INV.item(id, 'equipped'), false)
  await s.set(INV.item(id, 'note'), '')
  await s.set(INV.items, [...(await itemIds()), id])
  return id
}

export async function removeItem(id: string): Promise<void> {
  const s = api.v1.storyStorage
  await s.set(INV.items, (await itemIds()).filter((other) => other !== id))
  for (const field of ITEM_FIELDS) await s.remove(INV.item(id, field))
}

/** Adds `delta` to a stored count, never going below zero. */
export async function adjustCount(key: string, delta: number, fallback = 0): Promise<void> {
  const s = api.v1.storyStorage
  await s.set(key, Math.max(0, count(await s.get(key), fallback) + delta))
}

/** The inventory as lines for the AI's game state, or none if it isn't shared or nothing is in it. */
export function inventoryLines(inv: Inventory): string[] {
  const items = inv.items.filter((item) => item.name.trim() !== '' && item.quantity > 0)
  if (!inv.share || (inv.amount === 0 && items.length === 0)) return []

  const lines = [`Money: ${inv.amount} ${inv.currency}.`]
  const prices = priceList(inv.prices)
  if (prices) lines.push(`Typical prices in ${inv.currency}: ${prices}. Keep every price in the story in line with these.`)

  const named = (item: Item) => (item.quantity > 1 ? `${item.name.trim()} ×${item.quantity}` : item.name.trim())
  const equipped = items.filter((item) => item.equipped)
  const carried = items.filter((item) => !item.equipped)
  if (equipped.length > 0) {
    lines.push(`Equipped: ${equipped.map((item) => (item.note.trim() ? `${named(item)} (${item.note.trim()})` : named(item))).join(', ')}.`)
  }
  lines.push(carried.length > 0 ? `Carrying: ${carried.map(named).join(', ')}.` : `Carrying: nothing${equipped.length ? ' else' : ''}.`)
  return lines
}

/** Turns the price guide's lines ("a hot meal: 2") into one list ("a hot meal 2, …"). */
export function priceList(guide: string): string {
  return guide
    .split('\n')
    .map((line) => line.trim().replace(/\s*[:=–—-]\s*(?=[\d.,]+\s*\S*$)/, ' '))
    .filter((line) => line !== '')
    .join(', ')
}

function itemIds(): Promise<string[]> {
  return idList(INV.items)
}
