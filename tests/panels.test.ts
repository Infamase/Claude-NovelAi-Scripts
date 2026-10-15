import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { installMockApi } from './helpers/mockApi.ts'
import { IDS, KEYS } from '../src/keys.ts'
import { registerSettingsPanel } from '../src/ui/settingsPanel.ts'
import { setStoryPanelsVisible } from '../src/ui/storyPanels.ts'

/** Finds the "Enable for this story" checkbox in the registered sidebar panel. */
function enableCheckbox(mock: ReturnType<typeof installMockApi>) {
  const panel = mock.extensions.get(IDS.settingsPanel)
  return panel.content.find((part: any) => part.storageKey === `story:${KEYS.enabled}`)
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('panels', () => {
  afterEach(() => setStoryPanelsVisible(false))

  it('keeps the sidebar panel when the story panels are switched on', async () => {
    const mock = installMockApi()
    await registerSettingsPanel()
    enableCheckbox(mock).onChange(true)
    await settle()
    assert.deepEqual([...mock.extensions.keys()].sort(), [IDS.inventoryPanel, IDS.partyPanel, IDS.settingsPanel].sort())
  })

  it('removes only the story panels when switched off', async () => {
    const mock = installMockApi()
    await registerSettingsPanel()
    enableCheckbox(mock).onChange(true)
    await settle()
    enableCheckbox(mock).onChange(false)
    await settle()
    assert.deepEqual([...mock.extensions.keys()], [IDS.settingsPanel])
  })

  it('keeps the sidebar panel when a story loads already enabled', async () => {
    const mock = installMockApi()
    await registerSettingsPanel()
    await setStoryPanelsVisible(true)
    assert.ok(mock.extensions.has(IDS.settingsPanel))
    assert.equal(mock.extensions.get(IDS.partyPanel).type, 'scriptPanel')
  })
})
