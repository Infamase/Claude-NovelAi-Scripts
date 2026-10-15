// Pieces shared by the bottom-bar tabs.

import { logError } from '../keys.ts'

export const MUTED = { opacity: 0.7, fontSize: '0.85em' }

/**
 * Wraps `run` so that a burst of calls (an edit per keystroke) runs it once, shortly after, by
 * which time the input has saved its value to storage.
 */
export function debounced(run: () => Promise<void>, delay = 300): () => void {
  let pending = false
  return () => {
    if (pending) return
    pending = true
    api.v1.timers
      .setTimeout(() => {
        pending = false
        run().catch(logError)
      }, delay)
      .catch(logError)
  }
}

/** A collapsed "What the AI sees" section showing the text stored under `key`. */
export function previewSection(key: string): UIPart {
  return {
    type: 'collapsibleSection',
    title: 'What the AI sees',
    iconId: 'eye',
    initialCollapsed: true,
    content: [{ type: 'text', text: `{{story:${key}}}`, style: { whiteSpace: 'pre-wrap', fontSize: '0.9em' } }],
  }
}

/** Text for a {{storage}} template, so typed text can't be mistaken for one. */
export function forTemplate(value: string): string {
  return value.replace(/\{\{/g, '{ {')
}
