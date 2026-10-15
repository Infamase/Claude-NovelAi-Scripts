// Text Adventure+ entry point.

import { registerTurnGuard } from './guard/turnGuard.ts'
import { KEYS, OLD_STORY_KEYS, logError } from './keys.ts'
import { registerSettingsPanel } from './ui/settingsPanel.ts'
import { setStoryPanelsVisible } from './ui/storyPanels.ts'

async function init(): Promise<void> {
  await api.v1.storage.setIfAbsent(KEYS.referee, true)
  await api.v1.storyStorage.setIfAbsent(KEYS.lastTurnStatus, 'No turn checked yet.')
  await api.v1.storyStorage.setIfAbsent(KEYS.refereeTest, 'Not run yet.')
  for (const key of OLD_STORY_KEYS) await api.v1.storyStorage.remove(key)
  await registerSettingsPanel()
  const enabled = (await api.v1.storyStorage.get(KEYS.enabled)) === true
  await setStoryPanelsVisible(enabled)
  api.v1.log(`Text Adventure+ v${api.v1.script.version} loaded (enabled for this story: ${enabled})`)
}

registerTurnGuard()
init().catch(logError)
