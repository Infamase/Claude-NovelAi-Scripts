# Text Adventure+ — Game Plan

*Working title. A NovelAI user script that makes Text Adventure mode stop when it is your turn, and adds Party and Inventory tabs that feed the story's context.*

Status: **Phase 1 (v0.2.1)**: the turn guard, second round after the first playtest.

---

## 1. Goals

1. **Turn-aware output.** After you submit an action, the AI writes the consequences of that action (the world, NPCs, companions) and stops at the point where you need to act again. It must not invent your next speech, choices or actions.
2. **Party tab** in the bottom bar: who is travelling with you and how they're doing. It is injected into context automatically.
3. **Inventory tab** in the bottom bar: what you carry, what you have equipped, and how much money you have. It is injected into context automatically.

## 2. Decisions so far

| Topic | Decision |
|---|---|
| Model | **Xialong** (`xialong-v1`), as the stop test showed. Like GLM 4.6 it uses the chat endpoint, so every hook the guard needs works. |
| How much the AI may write about your character | Default: **reactions allowed**. Sensations and involuntary reactions are fine ("the ale burns your throat; you cough"). New speech, thoughts, decisions and deliberate actions are cut. A toggle switches to **strict** (no physical reactions either). |
| Your character's thoughts | **Cut, all of them.** |
| Checking replies | **Pattern rules plus a referee**, a quick second AI call. The referee is a setting, on by default. |
| How replies appear | NovelAI shows a reply all at once, so the script holds it until it has been checked. |
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

This is the core feature. A script can't give the model a "dynamic length", and it can't stop a reply early either: Phase 0 showed that NovelAI then throws the whole reply away. So the guard lets the AI finish, checks the reply, and lets through only the part before it starts writing for your character. NovelAI shows replies all at once, so holding a reply until it is checked looks no different on screen.

### Layer 1 — Instruct (prevention)
Before every reply the script marks your latest input in the context as **the player's action** and follows it with numbered **narration rules** (`onContextBuilt`). It also adds one line to the system prompt: this is a text adventure, the user plays "you", and the reply must never write for them. The rules tell the AI to:
- write only what happens because of your input: how the world, the other characters and companions respond, and what your character sees and hears;
- never write your character's speech, thoughts, conclusions, decisions or deliberate actions beyond what you typed (involuntary physical reactions are fine, except in strict mode);
- stop as soon as your character would need to speak, act or decide, and never continue a conversation on your behalf;
- end on the world: never ask what you do, offer choices or address you;
- keep it short: one to three short paragraphs.

The first playtest showed why the wording matters: the model copies the story's own style far more than it follows a bracketed note, and a prose intro that narrates the player character a lot teaches it to keep doing that.

Space for the rules is reserved first (`contextLimitReduction` in `onBeforeContextBuild`), so they can't push the context over its limit. They also show in NovelAI's Context viewer.

### Layer 2 — Check (pattern rules, then the referee)
The script holds every streamed chunk back (`seenData: 0`) and decides on the final `onResponse` call, while it can still shorten the text:
1. **Pattern rules** check each sentence's narration. They never look inside quotes, so an NPC may still ask "Will you help me?".
2. **The referee** (a setting, on by default) is a tiny second AI call. It sees the story just before your turn, what you typed, and the numbered sentences before any rule cut. It answers with the number of the first sentence that writes for your character, or 0. It catches what patterns can't, such as an unattributed line of your speech or an unmarked thought.
3. The reply is cut before the earliest flagged sentence.

| Signal | Example | Caught by |
|---|---|---|
| A new action marker | a line starting with `>` | rules |
| Your character speaking | `"…," you say`, `You ask her name.` | rules |
| Your character's thoughts or decisions | `You wonder if…`, `You realize…`, `You decide to…` | rules |
| End-of-turn prompts, in any form | `What do you do?`, `The choice is yours.`, `Will you fight or flee?` | rules |
| Unattributed speech, unmarked thoughts | `"First... guest?"`, `Her? The dragon is... a woman?` | referee |
| Deliberate actions you didn't type | `You nod and slide your mug over.` | referee (the rules, when it's off or unavailable) |
| Physical reactions | `You cough.`, `You flinch.` | allowed; cut in strict mode |

Carrying out what you typed is allowed: after "You approach the dragon", the line "As you approach, she lifts her head" stays.

If the very first sentence oversteps, nothing is added and the script asks the AI again automatically, up to twice. (NovelAI's Retry button would re-roll the previous turn here, because nothing new was added.)

### Layer 3 — Cap (Phase 4)
Because a reply can't be stopped early, the AI keeps writing (out of sight) after an overstep until it finishes. A per-turn **maximum length** keeps that wait short.

### Layer 4 — Clean
If the length limit cut the reply off mid-sentence, the unfinished last sentence is removed.

**Transparency:** the sidebar's **Last turn** section says what was kept, where the cut was and why. **Copy details** copies the whole reply, sentence by sentence, with the cut marked. Send those for turns that were cut wrongly.

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
- Phase 2 decides which of the two keeps the AI more consistent.
- Neither method touches your Memory, Author's Note or Lorebook.

## 8. Settings

Settings live in a **right-sidebar panel**, which keeps the bottom bar for Party and Inventory:
- Enable for this story
- Referee: on/off
- Strict: on/off
- Last turn: what was kept and why, plus **Copy details**
- Referee check: **Test the referee** runs it once on a made-up turn, outside any reply
- Length cap: on/off, plus short and long sizes (Phase 4)

---

## 9. Project setup

```
src/
  main.ts                  entry: registers hooks and UI
  keys.ts                  storage keys and UI ids
  guard/text.ts            sentence splitting, quote tracking, chunk helpers
  guard/detector.ts        the pattern rules
  guard/rules.ts           the narration rules, and where they go in the context
  guard/referee.ts         the referee's prompt, answer parsing and call
  guard/turnGuard.ts       hook wiring: hold, check, cut, report
  ui/settingsPanel.ts      the sidebar panel
  ui/storyPanels.ts        Party and Inventory tabs (placeholders until Phases 2–3)
  state/…                  Party and Inventory data (Phases 2–3)
types/script-types.d.ts    NovelAI's official API typings
scripts/build.mjs          bundles src/ into one file + adds the .naiscript header
tests/                     unit tests; helpers/mockApi.ts is a stand-in for NovelAI's API
dist/text-adventure-plus.naiscript   ← the file you import
```

- **TypeScript**, type-checked against NovelAI's official typings.
- **esbuild** bundles the modules into a single script, and the build writes the `.naiscript` header (name, version, author, description).
- **Unit tests** cover the pattern rules (with real replies from playtesting), the referee prompt, and whole turns run against the stand-in API.
- **Installing:** User Scripts (Alt+X) → Import → `dist/text-adventure-plus.naiscript`, as an account script. It asks for clipboard access the first time you press Copy details. The length cap (Phase 4) will need the `storyEdit` permission.

## 10. Milestones

| Phase | Deliverable | You test |
|---|---|---|
| **0 — Scaffold** (done) | Repo tooling, typings, build, test runner. A stub script that registers empty Party and Inventory tabs and a settings panel. Also a test of how `stopGeneration` behaves together with trimmed text in `onResponse`. | Import it and confirm the tabs show up where you expect. |
| **1 — Turn guard** (built, v0.2.0) | Narration rules, hold-and-check with the pattern rules and the referee, and the Last turn report. | Play a few scenes and send me any turns that were cut too early or too late. |
| **2 — Inventory** | The Inventory tab, its context injection, and the preview. | Check that the AI respects what you carry and have equipped. |
| **3 — Party** | The Party tab, its context injection, and the preview. | Check that companions act in character. |
| **4 — Polish → v1.0** | The length cap, settings, detector tuning from your feedback, a README, and the v1.0 release. | Final playtest. |

**Later ideas:** auto-tracking ("you pick up the key" → a suggested inventory change), linking party members to existing Lorebook entries, simple stats, and state that follows undo/redo.

### Phase 0 findings

- **`api.v1.ui.register` replaces all of the script's UI.** Panels added later must go through `api.v1.ui.update`. (This caused the "UI callback failed" bug, fixed in v0.1.1.)
- **Xialong fires every hook** the plan relies on: `onTextAdventureInput`, `onGenerationRequested`, `onContextBuilt`, `onResponse` and `onGenerationEnd`.
- **Context layout on Xialong:** `system` (the model's prompt) → `user` (memory and tags, ending in "Write.") → `assistant` (the story so far) → `user` (your latest Do/Say input, e.g. `You ask "Speak…with?"`) → an empty `assistant` (the reply to write). Each input is its own user message, so the narrator rules can sit right next to it.
- **Inputs are stored as their own paragraphs** marked `dialogue`/`action` with origin `user`, without the `>`.
- **Stopping a reply loses it.** When a script stops generation, NovelAI throws the whole reply away and records no history entry, whether the stop comes with text or on a later call. Hiding the text after the cut (blanking it) without stopping works, and keeps a normal history entry.
- **Replies reach the document only when the generation ends**, and NovelAI shows them all at once.
- **The final `onResponse` call is empty.** It doesn't resend the reply.

### Phase 1 findings

- **First playtest (v0.2.0):** the AI ignored the bracketed rules and wrote a whole conversation for the player character, copying the intro's style. The referee's AI call failed with an error the script showed as `[object Object]`. With Strict on, the first sentence ("You swallow hard…") was a reaction, so nothing was kept.
- **v0.2.1 response:** plain numbered rules after the input marked as the player's action, plus a system-prompt line; readable referee errors; the referee tries the story's model, then GLM 4.6 (the API notes say script generation officially supports only GLM 4.6); a **Test the referee** button; automatic re-asking when nothing can be kept; swallowing, gulping, tensing and similar count as reactions.

## 11. Risks

- **Hidden extra writing.** The AI keeps writing after an overstep until it finishes, so a long overstep means a longer wait. Layer 1 makes oversteps rarer, and Layer 3's cap (Phase 4) limits the wait.
- **The referee hasn't worked inside NovelAI yet.** Its first call failed. If calling the AI from inside a reply turns out to be impossible, the fallback is to run the referee after the reply lands and trim the document (needs the `documentEdit` permission). Meanwhile, if it fails or takes over 10 seconds, the pattern rules take over and the Last turn report says why. Each check uses about 8 of the script's 2048 output tokens per 4 minutes.
- **Accuracy.** The rules and the referee will sometimes cut too early or too late. The Last turn report shows exactly what was cut and why, and copied details become test cases.
- **Persisted settings.** `generationParameters.update` saves into the story's settings, so the script always restores the original value, including on the next load if something went wrong mid-turn.
- **Chat-endpoint models only** (Xialong, GLM 4.6). On models that use the older endpoint, these hooks don't run, so the guard does nothing there.
- **Token cost.** The injected state takes up context space, so the format stays compact.

## 12. Open questions (answer whenever)

1. **Bad turns (whenever you hit them):** press **Copy details** in the sidebar's Last turn section and paste the result. Each one becomes a test case.
