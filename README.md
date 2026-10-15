# Text Adventure+

A NovelAI user script for Text Adventure mode on Xialong or GLM 4.6:

- **Stops at your turn.** The AI writes what happens because of your action, then stops. It doesn't write your character's words, thoughts, decisions or new actions, and it never asks "What do you do?"
- **Party tab** in the bottom bar, fed into the story context. *(Phase 3)*
- **Inventory tab** in the bottom bar, fed into the story context. *(Phase 2)*

See [PLAN.md](PLAN.md) for the full design and roadmap.

## Status: v0.2.4, Phase 1 (the turn guard)

How each turn works:

1. **Rules for the AI.** Before every reply, your input is marked as the player's action and followed by numbered narration rules, and the system prompt says this is a text adventure where you play "you". You can see all of it in NovelAI's Context viewer.
2. **A check before anything appears.** The script holds the reply until the AI finishes. NovelAI shows replies all at once anyway, so this looks the same on screen. Then:
   - **pattern rules** catch the clear cases: your character speaking, thinking or deciding, and any form of "What do you do?";
   - **the referee**, a quick second AI call, catches the subtle ones, like an unattributed line of your speech or an unmarked thought.
3. **The cut.** Only the text before the first overstep reaches the editor. It's a normal generation, so Undo and Retry work as usual. If the very first sentence oversteps, nothing is added and the script asks the AI again automatically, up to twice.

The Party and Inventory tabs are still placeholders.

## Install

1. Download [`dist/text-adventure-plus.naiscript`](dist/text-adventure-plus.naiscript). On GitHub, open the file and use **Download raw file**.
2. In NovelAI, open **User Scripts** with Alt+X, or from the goose menu in the left sidebar.
3. **Import** the file as an **account script**.
4. Open a Text Adventure story. In the right sidebar, open the **"…"** tab, then **Text Adventure+**, and tick **Enable for this story**.

The story must use a chat-endpoint model (**Xialong** or **GLM 4.6**).

To update, import the new file the same way. It has the same script id, so it replaces the old version.

If a script ever makes NovelAI unusable, add `?noscript=true` to the end of the URL and reload. Scripts are skipped, so you can disable the bad one.

## Settings (right sidebar → Text Adventure+)

- **Enable for this story**: turns the script on for the open story.
- **Referee**: double-checks each reply with a quick AI call. It adds a second or two per turn and uses a small part of the script's AI allowance. On by default.
- **Strict**: also cuts your character's physical reactions (a flinch, a cough). Off by default.
- **Last turn**: what was kept, where the cut was and why. **Copy details** copies the whole reply sentence by sentence with the cut marked. Send it to Claude when a turn was cut wrongly or should have been cut.
- **Referee check**: **Test the referee** runs the referee once on a made-up turn, outside any reply, and shows whether it could reach the AI.

## Development

```sh
npm install
npm run check   # typecheck + tests + build
```

- `src/`: TypeScript source. `src/main.ts` is the entry point, and `src/guard/` holds the turn guard.
- `tests/`: unit tests (Node's built-in test runner). `tests/helpers/mockApi.ts` stands in for NovelAI's API, following what the Phase 0 tests showed about it, so whole turns can run outside NovelAI.
- `types/script-types.d.ts`: NovelAI's official API typings, from <https://novelai.net/scripting/types/script-types.d.ts>.
- `scripts/build.mjs`: bundles everything into `dist/text-adventure-plus.naiscript` and adds the script header (name, version, id) from `package.json`.
