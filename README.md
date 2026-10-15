# Text Adventure+

A NovelAI user script for Text Adventure mode on GLM 4.6:

- **Stops at your turn.** The AI writes what happens because of your action, then stops. It doesn't write your next words or moves, and it never asks "What do you do?" *(Phase 1)*
- **Party tab** in the bottom bar, fed into the story context. *(Phase 3)*
- **Inventory tab** in the bottom bar, fed into the story context. *(Phase 2)*

See [PLAN.md](PLAN.md) for the full design and roadmap.

## Status: v0.1.0, Phase 0 preview

This version is the shell: a settings panel, placeholder Party and Inventory tabs, and a **stop test** that checks how NovelAI handles the script cutting a response short.

## Install

1. Download [`dist/text-adventure-plus.naiscript`](dist/text-adventure-plus.naiscript). On GitHub, open the file and use **Download raw file**.
2. In NovelAI, open **User Scripts** with Alt+X, or from the goose menu in the left sidebar.
3. **Import** the file as an **account script**.
4. Open a Text Adventure story. In the right sidebar, open the **"…"** tab, then **Text Adventure+**, and tick **Enable for this story**.

The story's model must be **GLM 4.6** and streaming should be on.

To update, import the new file the same way. It has the same script id, so it replaces the old version.

If a script ever makes NovelAI unusable, add `?noscript=true` to the end of the URL and reload. Scripts are skipped, so you can disable the bad one.

## Phase 0 checks

1. After you tick **Enable for this story**, **Party** and **Inventory** tabs appear just above the bottom controls. Untick it and they disappear.
2. Run the stop test:
   1. In the Text Adventure+ sidebar panel, open **Diagnostics: stop test** and tick **Run the stop test on my next turn**.
   2. Take one normal turn with an action that should get several sentences back.
   3. Press **Copy report** and send the report to Claude.

## Development

```sh
npm install
npm run check   # typecheck + tests + build
```

- `src/`: TypeScript source. `src/main.ts` is the entry point.
- `tests/`: unit tests (Node's built-in test runner). `tests/helpers/mockApi.ts` emulates NovelAI's hooks so the script's logic can run outside NovelAI.
- `types/script-types.d.ts`: NovelAI's official API typings, from <https://novelai.net/scripting/types/script-types.d.ts>.
- `scripts/build.mjs`: bundles everything into `dist/text-adventure-plus.naiscript` and adds the script header (name, version, id) from `package.json`.
