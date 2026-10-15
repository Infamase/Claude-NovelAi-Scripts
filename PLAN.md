# Text Adventure+ — Game Plan

*Working title. A NovelAI user script that makes Text Adventure mode stop when it is your turn, and adds Party and Inventory tabs that feed the story's context.*

Status: **Phase 0 built (v0.1.0)**. Waiting on the in-NovelAI checks (see README).

---

## 1. Goals

1. **Turn-aware output.** After you submit an action, the AI writes the consequences of that action (the world, NPCs, companions) and stops at the point where you need to act again. It must not invent your next speech, choices or actions.
2. **Party tab** in the bottom bar: who is travelling with you and how they're doing. It is injected into context automatically.
3. **Inventory tab** in the bottom bar: what you carry, what you have equipped, and how much money you have. It is injected into context automatically.

## 2. Decisions so far

| Topic | Decision |
|---|---|
| Model | **GLM 4.6**. This gives us the live streaming hooks, so the script can cut generation off mid-stream. |
| How much the AI may write about your character | Default: **reactions allowed**. Sensations and involuntary reactions are fine ("the ale burns your throat; you cough"). New speech, decisions and deliberate actions are cut. A toggle switches to **strict** (the world and NPCs only). |
| Inventory/Party updates | **Manual in v1.** You edit the tabs yourself. Auto-tracking is a later phase. |
| v1 tracking extras | Item **quantities**, **equipped** items, a **currency** counter, and per-member party **status** and **attitude**. |
| Companions | **Act freely.** They can speak and take actions on their own like any NPC. Only *your* character is protected. |
| "What do you do?" prompts | **Abolished.** The AI is told never to write them, and any that slip through are cut. |
| Name | **Text Adventure+** |

## 3. Assumptions (say so if any are wrong)

- **Account script.** It is imported once and available in every story, but stays inactive until you switch it on for a story. The API has no way to check "is this a Text Adventure story?", so a per-story toggle is the reliable option.
- **NovelAI's own Do/Say/Story input box stays.** The script hooks into it (`onTextAdventureInput`) instead of replacing it.
- **Manual edits are permanent.** If you add an item and then undo or retry a turn, the item stays. History-linked state comes in with auto-tracking later.
- **Second person** ("You…"), as in standard Text Adventure.

---

## 4. How "stop at your turn" works

This is the core feature. A model can't be given a "dynamic length" directly, so the script uses four layers. Each layer catches what the one before it misses.

### Layer 1 — Instruct (prevention)
Before every generation the script adds a short **narrator rules** message to the context (`onContextBuilt`, which only runs on GLM). The rules tell the AI to:
- narrate only the consequences of the player's latest action, including how NPCs and companions react;
- never write the player character's dialogue, decisions or deliberate actions (in strict mode, nothing about the player character at all);
- end the response at the first moment the player needs to decide something, and end it silently: never ask what the player does, never offer choices, never speak to the player directly.

The rules sit near the end of the context, where instructions carry the most weight. You can check the exact text in NovelAI's own Context viewer.

### Layer 2 — Watch (live cut-off)
The script watches the streamed text (`onResponse`):
- Text reaches the editor **one complete sentence at a time**. The unfinished sentence is held back (`seenData`), so an overstepping sentence never appears, even briefly.
- Each complete sentence goes through the **overstep detector** (below).
- When the detector fires, the script keeps everything before that sentence, drops the rest, and **stops generation** (`stopGeneration`).

**Overstep detector** (heuristic and tunable; this is pure code with unit tests):

| Signal | Example | Result |
|---|---|---|
| A new action marker | a line starting with `>` | cut |
| Player speech | `You say, "…"`, `"…," you reply` | cut |
| Player decision or deliberate action | `You decide to…`, `You draw your sword and…` | cut |
| Player sensation or involuntary reaction | `You feel warm.`, `You cough.` | allowed in *reactions* mode, cut in *strict* |
| End-of-turn prompt, in any form | `What do you do?`, `What's your next move?`, `The choice is yours.`, `Will you fight or flee?` | always cut, then stop |

Reactions mode works from a list of allowed verbs (feel, notice, hear, see, smell, taste, cough, wince, shiver, flinch…). Any other "You + verb" sentence counts as an action.

### Layer 3 — Cap (safety net)
A per-turn **maximum length** stops long rambles that never trip the detector. It is set right before generation and restored afterwards (`onGenerationRequested` → `generationParameters.update` → `onGenerationEnd`). The size depends on the input: a short cap for speech and simple actions, a longer one for travel, waiting or time skips. This layer has an on/off setting.

### Layer 4 — Clean (tidy-up)
After generation ends (`onGenerationEnd`), the script removes a trailing half-sentence if the length cap cut one off, and fixes leftover whitespace.

**Transparency:** a small status line ("Stopped: player speech detected — *'You say…'*") shows *why* each turn ended. If a cut came too early, press Send to continue, and tell me about it so I can tune the detector.

---

## 5. Party tab (bottom bar)

The tab is a NovelAI **Script Panel**. Script Panels sit just above the bottom controls and appear as tabs there; only one is open at a time.

Each member has:
- **Name** and a **short description** (race/class/role)
- **Status**: free text, plus quick buttons (Healthy / Wounded / Exhausted / Unconscious)
- **Attitude toward you**: a slider from Hostile to Devoted
- **Notes** (personality, goals); these are only injected when filled in
- an **In party** checkbox, so benched members are remembered but not injected

Plus Add, Remove and Move up/down buttons, and a collapsible **"What the AI sees"** preview.

What gets injected (kept compact to save tokens):
```
[ Party: Lyra (elf ranger; wounded; trusts you), Bram (dwarf smith; healthy; wary of you) ]
```

## 6. Inventory tab (bottom bar)

- A **currency** counter at the top (number field with +/− buttons; the currency name can be changed)
- For each item: **name**, **quantity** (with +/−), an **equipped** checkbox, and a **description** (optional; injected only for equipped items, to save tokens)
- Equipped items are listed first. Add and Remove buttons. A "What the AI sees" preview.

What gets injected:
```
[ Equipped: iron sword, leather armor ]
[ Carrying: healing potion ×3, rope, torch ×2; 45 gold ]
```

## 7. Getting state into the context

- **Preferred:** add the party and inventory lines next to the narrator rules in `onContextBuilt`, close to the most recent story text. Space is reserved in advance (`contextLimitReduction` in `onBeforeContextBuild`) so the context never overflows.
- **Fallback:** temporary always-on lorebook entries (`onBeforeContextBuild` → `temporaryLorebookEntries`). These are never saved into your real Lorebook.
- The Phase 1 test decides which of the two keeps GLM more consistent.
- Neither method touches your Memory, Author's Note or Lorebook.

## 8. Settings

Settings live in a **right-sidebar panel**, which keeps the bottom bar for Party and Inventory:
- Enable for this story
- Player-character rule: Reactions / Strict
- Length cap: on/off, plus short and long sizes
- Debug log, to help with tuning

---

## 9. Project setup

```
src/
  main.ts                  entry: registers hooks and UI
  guard/detector.ts        pure functions: sentence splitting, overstep detection
  guard/hooks.ts           onTextAdventureInput / onResponse / onGenerationEnd wiring
  state/party.ts           data model + storage
  state/inventory.ts
  context/inject.ts        formats state + narrator rules, context hooks
  ui/partyPanel.ts
  ui/inventoryPanel.ts
  ui/settingsPanel.ts
types/script-types.d.ts    NovelAI's official API typings
scripts/build.mjs          bundles src/ into one file + adds the .naiscript header
tests/detector.test.ts     real GLM outputs → expected cut points
dist/text-adventure-plus.naiscript   ← the file you import
```

- **TypeScript**, type-checked against NovelAI's official typings.
- **esbuild** bundles the modules into a single script, and the build writes the `.naiscript` header (name, version, author, description).
- **Unit tests** cover the detector, using a sample collection of real overstepping outputs.
- **Installing:** User Scripts (Alt+X) → Import → `dist/text-adventure-plus.naiscript`, as an account script. It asks once for the `storyEdit` permission, which the length cap needs.

## 10. Milestones

| Phase | Deliverable | You test |
|---|---|---|
| **0 — Scaffold** | Repo tooling, typings, build, test runner. A stub script that registers empty Party and Inventory tabs and a settings panel. Also a test of how `stopGeneration` behaves together with trimmed text in `onResponse`. | Import it and confirm the tabs show up where you expect. |
| **1 — Turn guard** | Narrator rules, the live cut-off, the detector with tests, and the "why it stopped" status line. | Play a few scenes and send me any turns that were cut too early or too late. |
| **2 — Inventory** | The Inventory tab, its context injection, and the preview. | Check that the AI respects what you carry and have equipped. |
| **3 — Party** | The Party tab, its context injection, and the preview. | Check that companions act in character. |
| **4 — Polish → v1.0** | The length cap, settings, detector tuning from your feedback, a README, and the v1.0 release. | Final playtest. |

**Later ideas:** auto-tracking ("you pick up the key" → a suggested inventory change), linking party members to existing Lorebook entries, simple stats, and state that follows undo/redo.

## 11. Risks

- **Trim plus stop in one step.** It isn't documented whether trimmed text that comes with `stopGeneration` still reaches the editor. Phase 0 tests this. The fallback is to hold text back with `seenData` and then remove the extra through the Document API.
- **Detector accuracy.** A heuristic will sometimes cut too early or too late. It is tunable and covered by tests, and the status line shows exactly what it caught.
- **Persisted settings.** `generationParameters.update` saves into the story's settings, so the script always restores the original value, including on the next load if something went wrong mid-turn.
- **GLM only.** On models that use the older endpoint, the streaming hooks don't run. The script detects this and shows a notice rather than failing silently.
- **Token cost.** The injected state takes up context space, so the format stays compact.

## 12. Open questions (answer whenever)

1. **Bad examples (when you have them):** paste 3–5 real turns where the AI overstepped, with your input. These become the first test cases.
