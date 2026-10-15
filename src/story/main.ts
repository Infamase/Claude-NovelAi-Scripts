// Story Adventure+ entry point.

import { logError } from '../keys.ts'
import { initInventory } from '../state/inventory.ts'
import { initParty } from '../state/party.ts'
import { initPlayer } from '../state/player.ts'
import { KEYS } from './keys.ts'
import { setStoryPanelsVisible } from './panels.ts'
import { initGuide, registerSettingsPanel } from './settingsPanel.ts'
import { registerStoryHooks } from './storyGuard.ts'

async function init(): Promise<void> {
  await api.v1.storage.setIfAbsent(KEYS.pov, true)
  await api.v1.storage.setIfAbsent(KEYS.check, true)
  await api.v1.storage.setIfAbsent(KEYS.useGuide, true)
  await initGuide()
  await api.v1.storyStorage.setIfAbsent(KEYS.lastReplyStatus, 'No reply checked yet.')
  await initPlayer()
  await initParty()
  await initInventory()
  await registerSettingsPanel()
  const enabled = (await api.v1.storyStorage.get(KEYS.enabled)) === true
  await setStoryPanelsVisible(enabled)
  api.v1.log(`Story Adventure+ v${api.v1.script.version} loaded (enabled for this story: ${enabled})`)
}

registerStoryHooks()
init().catch(logError)
