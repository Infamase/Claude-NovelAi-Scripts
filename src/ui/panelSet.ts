// A set of bottom-bar tabs that are shown together, only in stories where the script is enabled.

export type ScriptPanel = UIExtensionScriptPanel & { id: string }

/** Builds a tab. `rebuild` re-renders the whole set, for when rows are added, removed or reordered. */
export type PanelBuilder = (rebuild: () => Promise<void>) => Promise<ScriptPanel>

export function panelSet(builders: PanelBuilder[], ids: string[]): { setVisible: (show: boolean) => Promise<void> } {
  let visible = false

  const build = async (): Promise<ScriptPanel[]> => {
    const panels: ScriptPanel[] = []
    for (const builder of builders) panels.push(await builder(rebuild))
    return panels
  }

  async function rebuild(): Promise<void> {
    if (visible) await api.v1.ui.update(await build())
  }

  return {
    async setVisible(show: boolean): Promise<void> {
      if (show === visible) return
      // ui.register replaces every extension the script has (it would remove the sidebar panel), so
      // panels added later go through ui.update, which adds extensions alongside the existing ones.
      if (show) await api.v1.ui.update(await build())
      else await api.v1.ui.remove(ids)
      visible = show
    },
  }
}

