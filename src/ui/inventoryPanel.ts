// The Inventory tab in the bottom bar: money with its currency and price guide, and items.
//
// Inputs bind straight to story storage, so typing and the −/+ buttons update live without
// rebuilding the tab. The tab is only rebuilt when items are added or removed.

import { IDS, logError } from '../keys.ts'
import { gameStateBlock } from '../state/gameState.ts'
import { INV, addItem, adjustCount, inventoryLines, readInventory, removeItem, type Inventory, type Item } from '../state/inventory.ts'
import { MUTED, debounced, forTemplate, previewSection } from './common.ts'

const schedulePreview = debounced(() => updatePreview())

export async function inventoryPanel(rebuild: () => Promise<void>): Promise<UIExtensionScriptPanel & { id: string }> {
  const inv = await readInventory()
  updatePreview(inv).catch(logError)
  const edited = () => schedulePreview()
  return {
    type: 'scriptPanel',
    id: IDS.inventoryPanel,
    name: 'Inventory',
    iconId: 'package',
    content: [
      {
        type: 'checkboxInput',
        label: 'Tell the AI about my inventory',
        storageKey: `story:${INV.share}`,
        onChange: edited,
      },
      moneySection(edited),
      itemsSection(inv, rebuild, edited),
      previewSection(INV.preview),
    ],
  }
}

function moneySection(edited: () => void): UIPart {
  return {
    type: 'box',
    content: [
      { type: 'text', markdown: true, text: '**Money**' },
      {
        type: 'row',
        wrap: true,
        spacing: 'start',
        alignment: 'end',
        content: [
          { type: 'numberInput', label: 'Amount', storageKey: `story:${INV.amount}`, onChange: edited, style: { width: '7em' } },
          stepButton('−', INV.amount, -1, edited),
          stepButton('+', INV.amount, 1, edited),
          {
            type: 'textInput',
            label: 'Currency',
            placeholder: 'gold',
            storageKey: `story:${INV.currency}`,
            onChange: edited,
            style: { width: '12em' },
          },
        ],
      },
      {
        type: 'collapsibleSection',
        title: 'Price guide',
        iconId: 'tag',
        initialCollapsed: true,
        content: [
          {
            type: 'text',
            text: 'Typical prices in your currency, one per line, like "a hot meal: 2". The AI is told to keep every price in the story in line with these, so it knows what your money is worth.',
            style: MUTED,
          },
          { type: 'multilineTextInput', storageKey: `story:${INV.prices}`, onChange: edited },
        ],
      },
    ],
  }
}

function itemsSection(inv: Inventory, rebuild: () => Promise<void>, edited: () => void): UIPart {
  return {
    type: 'box',
    content: [
      { type: 'text', markdown: true, text: '**Items**' },
      ...(inv.items.length > 0
        ? inv.items.map((item) => itemPart(item, rebuild, edited))
        : [{ type: 'text' as const, text: 'Nothing yet.', style: MUTED }]),
      {
        type: 'button',
        text: 'Add item',
        iconId: 'plus',
        disabledWhileCallbackRunning: true,
        callback: () => addItem().then(rebuild).catch(logError),
      },
    ],
  }
}

function itemPart(item: Item, rebuild: () => Promise<void>, edited: () => void): UIPart {
  const key = (field: 'name' | 'quantity' | 'equipped' | 'note') => `story:${INV.item(item.id, field)}`
  return {
    type: 'column',
    id: `tap-item-${item.id}`,
    style: { gap: '4px', paddingBottom: '8px' },
    content: [
      {
        type: 'row',
        wrap: true,
        spacing: 'start',
        alignment: 'end',
        content: [
          { type: 'textInput', label: 'Item', placeholder: 'Item name', storageKey: key('name'), onChange: edited, style: { flex: '1 1 10em' } },
          { type: 'numberInput', label: 'Qty', storageKey: key('quantity'), onChange: edited, style: { width: '5em' } },
          stepButton('−', INV.item(item.id, 'quantity'), -1, edited, 1),
          stepButton('+', INV.item(item.id, 'quantity'), 1, edited, 1),
          { type: 'checkboxInput', label: 'Equipped', storageKey: key('equipped'), onChange: edited },
          {
            type: 'button',
            text: 'Remove',
            iconId: 'trash-2',
            callback: () => removeItem(item.id).then(rebuild).catch(logError),
          },
        ],
      },
      {
        type: 'textInput',
        placeholder: 'Note for the AI while equipped (optional), e.g. "notched blade"',
        storageKey: key('note'),
        onChange: edited,
      },
    ],
  }
}

function stepButton(text: string, key: string, delta: number, edited: () => void, fallback = 0): UIPart {
  return {
    type: 'button',
    text,
    callback: () =>
      adjustCount(key, delta, fallback)
        .then(edited)
        .catch(logError),
  }
}

export async function updatePreview(inv?: Inventory): Promise<void> {
  const current = inv ?? (await readInventory())
  const block = gameStateBlock(inventoryLines(current))
  const text = !current.share
    ? 'Nothing: sending the inventory is turned off above.'
    : (block ?? 'Nothing yet. Add money or an item, and it will be sent with every turn.')
  await api.v1.storyStorage.set(INV.preview, forTemplate(text))
}
