import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installMockApi, tokenize } from '../helpers/mockApi.ts'
import { INV, initInventory } from '../../src/state/inventory.ts'
import { initParty } from '../../src/state/party.ts'
import { PLAYER, initPlayer } from '../../src/state/player.ts'
import { SETTING, initSetting } from '../../src/state/setting.ts'
import { parseAbsent } from '../../src/state/absent.ts'
import { KEYS } from '../../src/story/keys.ts'
import { DEFAULT_GUIDE, POV_REMINDER, POV_RULE } from '../../src/story/prompt.ts'
import { decideReply, registerStoryHooks, releasable } from '../../src/story/storyGuard.ts'

type Mock = ReturnType<typeof installMockApi>

const OPENING = 'You stand at the edge of the clearing. The fire is low.'

async function setup(settings: { enabled?: boolean; pov?: boolean; check?: boolean; guide?: string | false } = {}) {
  const mock = installMockApi()
  registerStoryHooks()
  await initSetting()
  await initPlayer()
  await initParty()
  await initInventory()
  mock.story.set(KEYS.enabled, settings.enabled ?? true)
  mock.account.set(KEYS.pov, settings.pov ?? true)
  mock.account.set(KEYS.check, settings.check ?? true)
  mock.account.set(KEYS.useGuide, settings.guide !== false)
  mock.account.set(KEYS.guide, settings.guide || DEFAULT_GUIDE)
  mock.sections.push({ text: OPENING, source: 'story', origin: [{ data: 'user' }] })
  return mock
}

/** Generates a reply in story mode and returns what reached the editor. */
async function continueStory(mock: Mock, reply: string, options: { batchSize?: number; scriptInitiated?: boolean } = {}) {
  await mock.playStory(tokenize(reply), options)
  await mock.settle()
  return mock.placed()
}

const status = (mock: Mock) => String(mock.story.get(KEYS.lastReplyStatus))

describe('story hooks', () => {
  it('do nothing in stories where the script is off', async () => {
    const mock = await setup({ enabled: false })
    const reply = ' I stepped back. The fire was dying.'
    assert.equal(await continueStory(mock, reply), reply)
    assert.equal(mock.last.context?.[0].content, 'You are Xialong.')
    assert.equal(mock.last.contextLimitReduction, undefined)
  })

  it('add the rule and the guide to the system prompt, the reminder before the story, and make room', async () => {
    const mock = await setup()
    await continueStory(mock, ' A twig snaps.')
    assert.equal(mock.last.context?.[0].content, `You are Xialong.\n\n${POV_RULE}\n\n${DEFAULT_GUIDE}`)
    assert.equal(mock.last.context?.[1].content, `Relevant persistent information:\n[ Genre: fantasy ]\n***\n\n${POV_REMINDER}\n\nWrite.`)
    assert.equal(mock.last.context?.[2].content, OPENING)
    assert.ok((mock.last.contextLimitReduction ?? 0) > 300)
  })

  it('send the setting, player, party and inventory before the reminder', async () => {
    const mock = await setup()
    mock.story.set(SETTING.field('world'), 'the Mass Effect universe')
    mock.story.set(SETTING.field('location'), 'Illium')
    mock.story.set(PLAYER.field('name'), 'Hunter')
    mock.story.set(PLAYER.field('role'), 'human ranger')
    mock.story.set(INV.amount, 12)
    await continueStory(mock, ' A twig snaps.')
    assert.match(
      mock.last.context?.[1].content ?? '',
      /\*\*\*\n\nGame state \(keep the story consistent with it\):\n- Setting: the Mass Effect universe\. Current location: Illium\. Keep to the established canon of this world \(its lore, history, technology and characters\)\.\n- The protagonist \("you"\): Hunter, human ranger\. Status: Healthy\.\n- Money: 12 gold\.\n.*\n- Carrying: nothing\.\n\nContinue the story from where it stops, in second person, present tense\.\n\nWrite\.$/,
    )
  })

  it('leave out what is switched off', async () => {
    const mock = await setup({ pov: false, guide: false })
    const reply = ' I stepped back. The fire was dying.'
    assert.equal(await continueStory(mock, reply), reply, 'no point of view, so no check either')
    assert.equal(mock.last.context?.[0].content, 'You are Xialong.')
    assert.doesNotMatch(mock.last.context?.[1].content ?? '', /Continue the story/)
  })

  it('use an edited guide', async () => {
    const mock = await setup({ guide: 'Write like Le Guin.' })
    await continueStory(mock, ' A twig snaps.')
    assert.equal(mock.last.context?.[0].content, `You are Xialong.\n\n${POV_RULE}\n\nWrite like Le Guin.`)
  })

  it('let a clean reply through untouched, as it streams', async () => {
    const mock = await setup()
    const reply = ' A twig snaps somewhere behind you. You turn. A fox watches from the ferns, then slips away.'
    assert.equal(await continueStory(mock, reply), reply)
    assert.ok((mock.last.placements?.filter(Boolean).length ?? 0) > 2, 'sentences are let through before the end')
    assert.equal(status(mock), 'Last reply: nothing to cut (3 sentences).')
  })

  it('cut a reply where it slips into the past', async () => {
    const mock = await setup()
    const kept = ' A twig snaps somewhere behind you.'
    const reply = `${kept} You turned. A fox was watching from the ferns. It slipped away.`
    assert.equal(await continueStory(mock, reply), kept)
    assert.equal(
      status(mock),
      'Last reply: kept 1 of 4 sentences. Cut from: "You turned."\nWhy: it slips into past tense ("you turned").',
    )
  })

  it('cut first person and the protagonist by name', async () => {
    const mock = await setup()
    mock.story.set(PLAYER.field('name'), 'Hunter')
    assert.equal(await continueStory(mock, ' The fox stares. I stare back.'), ' The fox stares.')
    assert.equal(await continueStory(mock, ' The fox stares. Hunter stares back.'), ' The fox stares.')
    assert.match(status(mock), /Why: it calls you by name \("Hunter stares"\)/)
  })

  it('hold back sentences that might slip until the reply is finished', () => {
    const start = ' A twig snaps. You turned.'
    assert.equal(releasable(`${start} The fox`), ' A twig snaps.'.length)
    assert.equal(releasable(' A twig snaps. You turn. The fox'), ' A twig snaps. You turn.'.length, 'the unfinished sentence waits')
  })

  it('ask again when nothing is left, up to twice, and start over when you ask', async () => {
    const mock = await setup()
    const bad = ' You turned. The fox was gone.'
    assert.equal(await continueStory(mock, bad), '')
    await mock.runTimers()
    assert.equal(mock.counts.editorGenerate, 1)
    assert.match(mock.toasts[0], /Asking again \(1 of 2\)/)

    await continueStory(mock, bad, { scriptInitiated: true })
    await mock.runTimers()
    await continueStory(mock, bad, { scriptInitiated: true })
    await mock.runTimers()
    assert.equal(mock.counts.editorGenerate, 2, 'no third retry')
    assert.match(mock.toasts[2], /still no usable reply after 3 tries/)

    // Pressing Send yourself starts the count again.
    await continueStory(mock, bad)
    await mock.runTimers()
    assert.equal(mock.counts.editorGenerate, 3)
  })

  it('cut a reply before the first mention of someone who is not in the story', async () => {
    const mock = await setup()
    mock.story.set(SETTING.field('absent'), 'Naruto Uzumaki')
    const kept = ' Kakashi looks up from his book.'
    assert.equal(await continueStory(mock, `${kept} "Where's Naruto?" Sakura asks. Nobody answers.`), kept)
    assert.equal(
      status(mock),
      'Last reply: kept 1 of 4 sentences. Cut from: "\\"Where\'s Naruto?\\""\nWhy: it mentions "Naruto" (Naruto Uzumaki), who is not in this story.',
    )
  })

  it('cut mentions even with the tense check off, unless the Setting tab says not to', async () => {
    const mock = await setup({ pov: false })
    mock.story.set(SETTING.field('absent'), 'Naruto Uzumaki')
    assert.equal(await continueStory(mock, ' Kakashi waits. Naruto is late again.'), ' Kakashi waits.')
    assert.equal(await continueStory(mock, ' Kakashi waited. The bridge was empty.'), ' Kakashi waited. The bridge was empty.', 'no tense check')

    mock.story.set(SETTING.cutAbsent, false)
    assert.equal(await continueStory(mock, ' Kakashi waits. Naruto is late again.'), ' Kakashi waits. Naruto is late again.')
    mock.story.set(SETTING.cutAbsent, true)
    mock.story.set(SETTING.share, false)
    assert.equal(await continueStory(mock, ' Kakashi waits. Naruto is late again.'), ' Kakashi waits. Naruto is late again.', 'not shared, not cut')
  })

  it('ask again when the first sentence mentions them, with advice if it keeps happening', async () => {
    const mock = await setup()
    mock.story.set(SETTING.field('absent'), 'Naruto Uzumaki')
    const bad = ' Naruto grins at you.'
    assert.equal(await continueStory(mock, bad), '')
    await mock.runTimers()
    assert.match(mock.toasts[0], /the reply's first sentence mentions "Naruto" \(Naruto Uzumaki\), who is not in this story, so it was dropped\. Asking again \(1 of 2\)/)
    await continueStory(mock, bad, { scriptInitiated: true })
    await mock.runTimers()
    await continueStory(mock, bad, { scriptInitiated: true })
    assert.match(mock.toasts[2], /steer it elsewhere, or untick "Cut replies that mention them"/)
  })

  it('hold back a sentence that mentions them while the reply streams, and cut at whichever comes first', () => {
    const absent = parseAbsent('Naruto Uzumaki')
    assert.equal(releasable(' Kakashi waits. Naruto is late. Sakura sighs. The', { absent }), ' Kakashi waits.'.length)
    const reply = ' Kakashi waits. You waited too. Naruto was late. The bridge was empty.'
    assert.equal(decideReply(reply, { absent }).cut?.reason, 'slips into past tense ("you waited")')
    assert.equal(decideReply(reply, { absent, slips: false }).cut?.kind, 'absent')
  })

  it('show the additions in dry runs, such as the Context viewer', async () => {
    const mock = await setup()
    const result = await mock.hooks.onContextBuilt({
      continuityId: 'viewer',
      model: 'xialong-v1',
      dryRun: true,
      messages: [{ role: 'system', content: 'S' }],
    })
    assert.match(result.messages[0].content, /second person, present tense/)
  })
})
