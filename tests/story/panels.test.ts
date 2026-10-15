import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { installMockApi } from '../helpers/mockApi.ts'
import { IDS } from '../../src/keys.ts'
import { initInventory } from '../../src/state/inventory.ts'
import { initParty } from '../../src/state/party.ts'
import { PLAYER, initPlayer } from '../../src/state/player.ts'
import { KEYS, STORY_IDS } from '../../src/story/keys.ts'
import { STORY_PARTY_NOTE, setStoryPanelsVisible } from '../../src/story/panels.ts'
import { DEFAULT_GUIDE } from '../../src/story/prompt.ts'
import { initGuide, registerSettingsPanel } from '../../src/story/settingsPanel.ts'

type Mock = ReturnType<typeof installMockApi>

/** All UI parts in an extension, depth first. */
function parts(mock: Mock, id: string): any[] {
  const out: any[] = []
  const walk = (list: any[]) => {
    for (const part of list ?? []) {
      out.push(part)
      walk(part.content)
    }
  }
  walk(mock.extensions.get(id).content)
  return out
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

async function setup() {
  const mock = installMockApi()
  await initPlayer()
  await initParty()
  await initInventory()
  await registerSettingsPanel()
  return mock
}

describe('Story Adventure+ panels', () => {
  afterEach(() => setStoryPanelsVisible(false))

  it('shows Player, Party and Inventory tabs when enabled, keeping the sidebar panel', async () => {
    const mock = await setup()
    const enable = parts(mock, STORY_IDS.settingsPanel).find((p) => p.storageKey === `story:${KEYS.enabled}`)
    enable.onChange(true)
    await settle()
    assert.deepEqual([...mock.extensions.keys()], [STORY_IDS.settingsPanel, IDS.playerPanel, IDS.partyPanel, IDS.inventoryPanel])
    assert.ok(parts(mock, IDS.partyPanel).some((p) => p.text === STORY_PARTY_NOTE), 'the party note fits story mode')

    enable.onChange(false)
    await settle()
    assert.deepEqual([...mock.extensions.keys()], [STORY_IDS.settingsPanel])
  })

  it('has the settings and a writing guide that can be reset', async () => {
    const mock = await setup()
    const all = parts(mock, STORY_IDS.settingsPanel)
    for (const key of [KEYS.pov, KEYS.check, KEYS.useGuide, KEYS.guide]) {
      assert.ok(all.some((p) => p.storageKey === key), key)
    }
    mock.account.set(KEYS.guide, 'mine')
    await all.find((p) => p.text === 'Reset to default').callback()
    await settle()
    assert.equal(mock.account.get(KEYS.guide), DEFAULT_GUIDE)
  })

  it('has the Player tab fields, with quick picks', async () => {
    const mock = await setup()
    await setStoryPanelsVisible(true)
    const labels = parts(mock, IDS.playerPanel).map((p) => p.label ?? p.title ?? p.text)
    for (const label of ['Tell the AI about my character', 'Name', 'Pronouns', 'Who you are', 'Appearance', 'Status', 'Skills and abilities', 'Notes', 'she/her', 'Wounded', 'What the AI sees']) {
      assert.ok(labels.includes(label), label)
    }
    mock.story.set(PLAYER.field('name'), 'Hunter')
    await parts(mock, IDS.playerPanel).find((p) => p.text === 'he/him').callback()
    await settle()
    assert.equal(mock.story.get(PLAYER.field('pronouns')), 'he/him')
    await mock.runTimers()
    assert.equal(
      mock.story.get(PLAYER.preview),
      'Game state (keep the story consistent with it):\n- The protagonist ("you"): Hunter (he/him). Status: Healthy.',
    )
  })
})

describe('initGuide', () => {
  it('stores the default, upgrades an untouched one, and keeps an edited one', async () => {
    const mock = installMockApi()
    await initGuide()
    assert.equal(mock.account.get(KEYS.guide), DEFAULT_GUIDE)

    // An older default, never edited: replaced by the new one.
    mock.account.set(KEYS.guide, 'old default')
    mock.account.set(KEYS.guideDefault, 'old default')
    await initGuide()
    assert.equal(mock.account.get(KEYS.guide), DEFAULT_GUIDE)

    // Edited (even emptied): kept.
    for (const edited of ['my own guide', '']) {
      mock.account.set(KEYS.guide, edited)
      mock.account.set(KEYS.guideDefault, 'old default')
      await initGuide()
      assert.equal(mock.account.get(KEYS.guide), edited)
    }
  })
})
