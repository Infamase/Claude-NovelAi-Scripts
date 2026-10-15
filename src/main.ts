// Text Adventure+ entry point.

import { initDiagnostics, registerDiagnosticsHooks } from './diagnostics/stopTest.ts'
import { KEYS, logError } from './keys.ts'
import { registerSettingsPanel } from './ui/settingsPanel.ts'
import { setStoryPanelsVisible } from './ui/storyPanels.ts'

async function init(): Promise<void> {
  await initDiagnostics()
  await registerSettingsPanel()
  const enabled = (await api.v1.storyStorage.get(KEYS.enabled)) === true
  await setStoryPanelsVisible(enabled)
  api.v1.log(`Text Adventure+ v${api.v1.script.version} loaded (enabled for this story: ${enabled})`)
}

registerDiagnosticsHooks()
init().catch(logError)
