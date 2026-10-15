# NovelAI scripts

Two NovelAI user scripts for chat-endpoint models (**Xialong** or **GLM 4.6**). They share the Party and Inventory tabs:

| | **Text Adventure+** | **Story Adventure+** |
|---|---|---|
| Mode | Text Adventure | Story |
| File | [`dist/text-adventure-plus.naiscript`](dist/text-adventure-plus.naiscript) | [`dist/story-adventure-plus.naiscript`](dist/story-adventure-plus.naiscript) |
| What it does to replies | Stops at your turn: no writing for your character, no "What do you do?" | Keeps the story in second person, present tense, written to a guide against AI clichés |
| Bottom-bar tabs | Party, Inventory | Setting, Player, Party, Inventory |

See [PLAN.md](PLAN.md) for the design and roadmap.

---

## Text Adventure+ (v0.4.1)

- **Stops at your turn.** The AI writes what happens because of your action, then stops. It doesn't write your character's words, thoughts, decisions or new actions, and it never asks "What do you do?"
- **Party** and **Inventory** tabs in the bottom bar, fed into the story context.

How each turn works:

1. **Rules for the AI.** Before every reply, your input is marked as the player's action and followed by numbered narration rules, and the system prompt says this is a text adventure where you play "you". You can see all of it in NovelAI's Context viewer.
2. **A check before anything appears.** The script holds the reply until the AI finishes. NovelAI shows replies all at once anyway, so this looks the same on screen. Then:
   - **pattern rules** catch the clear cases: your character speaking, thinking or deciding, and any form of "What do you do?";
   - **the referee**, a quick second AI call, catches the subtle ones, like an unattributed line of your speech or an unmarked thought.
3. **The cut.** Only the text before the first overstep reaches the editor. It's a normal generation, so Undo and Retry work as usual. If the very first sentence oversteps, nothing is added and the script asks the AI again automatically, up to twice.

### Settings (right sidebar → Text Adventure+)

- **Enable for this story**: turns the script on for the open story.
- **Referee**: double-checks each reply with a quick AI call. It adds a second or two per turn and uses a small part of the script's AI allowance. On by default.
- **Strict**: also cuts your character's physical reactions (a flinch, a cough). Off by default.
- **Last turn**: what was kept, where the cut was and why. **Copy details** copies the whole reply sentence by sentence with the cut marked. Send it to Claude when a turn was cut wrongly or should have been cut.
- **Referee check**: **Test the referee** runs the referee once on a made-up turn, outside any reply, and shows whether it could reach the AI.

---

## Story Adventure+ (v0.2.0)

For Story mode: you and the AI write the story together, and the AI may write what "you" do. There is no turn guard.

- **Second person, present tense.** The system prompt gets a point-of-view rule, and a one-line reminder goes just before the story, where the AI reads it last.
- **Catch slips.** Each reply is checked as it comes in. It's cut where its narration slips into the past tense ("You stepped inside. The room was dark."), the first person ("I step back") or your character's name ("Hunter steps back"). If nothing is left, the script asks the AI again, up to twice. Dialogue and *italic thoughts* may use any person and tense. A memory ("You remember the night…") or a bit of backstory that returns to the present is not a slip.
- **A writing guide** in the system prompt: concrete detail, plain strong verbs, varied rhythm, dialogue that sounds like people, characters with their own wants, no summarizing or moralizing endings, and a list of stock phrases to avoid ("a breath you didn't know you were holding", "barely above a whisper", "a testament to"…). You can edit it in the sidebar.
- **Setting**, **Player**, **Party** and **Inventory** tabs in the bottom bar, fed into the story context.

### Settings (right sidebar → Story Adventure+)

- **Enable for this story**: turns the script on for the open story and shows its tabs.
- **Second person, present tense**: the point-of-view rule and reminder. On by default.
- **Catch slips**: the check described above (only while Second person, present tense is on). On by default. Sentences that look like they might slip wait until the reply is finished, so if your replies stream in word by word, they may arrive a few sentences at a time instead.
- **Use the writing guide**, and **Writing guide**: the guide's text. Edit it as you like; **Reset to default** brings back the original. If you never edit it, it updates with new versions of the script.
- **Last reply**: what was kept, where the cut was and why. **Copy details** copies the reply sentence by sentence, with the tense count for each. Send it to Claude when a reply was cut wrongly or a slip got through.

The model copies the story's own style strongly, so start the story in second person, present tense, and fix any slip that gets into the story by hand.

---

## The tabs (bottom bar)

The tabs appear only in stories where the script is enabled. Update them yourself as things change in the story; nothing is tracked automatically yet. With each reply, the filled-in tabs are sent as one "Game state" block. Each tab has a **What the AI sees** preview and a switch to stop sending it.

### Setting (Story Adventure+)

- **World**: the world or universe ("the Mass Effect universe", or your own world's name and a few words about it).
- **Current location** ("Illium, the Nos Astra trading floor"). Update it as you travel.
- **Time period** ("2186, during the events of Mass Effect 3").
- **Keep to the world's canon** (on by default): for a world from a book, game, film or show, the AI is told to keep to its lore, history, technology and characters, except where your notes say otherwise. It's only sent when World is filled in.
- **Notes**: tone, rules of the world, what has happened so far, and anything that differs from canon.

It goes first in the game state, so the AI reads where and when before who.

### Player (Story Adventure+)

- **Name** and **Pronouns** (with he/him, she/her, they/them quick picks).
- **Who you are** ("human ranger, 24, exiled from the capital"), **Appearance**, **Status** (with quick picks), **Skills and abilities**, and **Notes** for personality, backstory, goals and secrets.
- Everything is optional. Nothing is sent until a name or a description is filled in. The name also lets Catch slips spot narration that calls you by name.

### Party

- **Add companion**, then fill in their **Name** and **Who they are** ("elf ranger, your guide").
- **Status** and **Attitude toward you**: type anything, or use the quick picks (Healthy, Wounded…; Hostile, Wary, Neutral, Friendly, Loyal).
- **Notes**: personality, goals, secrets. Sent only when filled in.
- **In party**: untick for someone who is away. They stay listed but aren't sent.
- **Move up** / **Move down** / **Remove**.

Companions speak and act for themselves.

### Inventory

- **Money**: the amount (type it or use − and +) and the **currency** name your world uses.
- **Price guide**: typical prices in your currency, one per line, like `a hot meal: 2`. It starts with a typical fantasy scale; adjust it to your world. The AI is told to keep every price in line with it, so a rug costs about 30, not 300.
- **Items**: name, quantity, **Equipped**, and an optional note that the AI sees while the item is equipped (`notched blade`).

Where the block goes: in Text Adventure+, right after your action, before the narration rules. In Story Adventure+, just before the story, after the memory, in the order Setting, Player, Party, Inventory.

---

## Install

1. Download the script's file from `dist/` (links in the table above). On GitHub, open the file and use **Download raw file**.
2. In NovelAI, open **User Scripts** with Alt+X, or from the goose menu in the left sidebar.
3. **Import** the file as an **account script**.
4. Open a story (Text Adventure for Text Adventure+, a normal story for Story Adventure+). In the right sidebar, open the **"…"** tab, then the script's panel, and tick **Enable for this story**.

The story must use a chat-endpoint model (**Xialong** or **GLM 4.6**). Enable only one of the two scripts in a story. Each script keeps its own tabs' contents, so a story's party and inventory don't carry over from one script to the other.

To update, import the new file the same way. It has the same script id, so it replaces the old version.

If a script ever makes NovelAI unusable, add `?noscript=true` to the end of the URL and reload. Scripts are skipped, so you can disable the bad one.

## Development

```sh
npm install
npm run check   # typecheck + tests + build both scripts
node scripts/build.mjs "Story Adventure+"   # build just one
```

- `src/main.ts`: Text Adventure+'s entry point. `src/guard/` holds its turn guard.
- `src/story/`: Story Adventure+: entry point, prompt and guide, slip check, hooks, sidebar panel.
- `src/state/` and `src/ui/`: the tabs and their state, shared by both scripts.
- `tests/`: unit tests (Node's built-in test runner). `tests/helpers/mockApi.ts` stands in for NovelAI's API, following what the playtests showed about it, so whole turns can run outside NovelAI.
- `types/script-types.d.ts`: NovelAI's official API typings, from <https://novelai.net/scripting/types/script-types.d.ts>.
- `scripts/build.mjs`: bundles each script listed under `naiscripts` in `package.json` into its `dist/` file, with the script header (name, version, id).
