import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installMockApi } from './helpers/mockApi.ts'
import { PLAYER, initPlayer, playerLines, readPlayer, type Player } from '../src/state/player.ts'

const player = (more: Partial<Player> = {}): Player => ({
  share: true,
  name: '',
  pronouns: '',
  role: '',
  appearance: '',
  status: 'Healthy',
  abilities: '',
  notes: '',
  ...more,
})

describe('playerLines', () => {
  it('describes the protagonist on one line', () => {
    assert.deepEqual(
      playerLines(
        player({
          name: 'Hunter',
          pronouns: 'he/him',
          role: 'human ranger, 24',
          appearance: 'tall, scar over the left eye',
          status: 'Wounded',
          abilities: 'tracking, archery',
          notes: 'Distrusts mages.\nLooking for his sister',
        }),
      ),
      [
        'The protagonist ("you"): Hunter (he/him), human ranger, 24. Appearance: tall, scar over the left eye. Status: Wounded. Skills and abilities: tracking, archery. Notes: Distrusts mages. Looking for his sister.',
      ],
    )
  })

  it('works with any of the fields alone', () => {
    assert.deepEqual(playerLines(player({ role: 'a thief' })), ['The protagonist ("you"): a thief. Status: Healthy.'])
    assert.deepEqual(playerLines(player({ pronouns: 'she/her', notes: 'Afraid of water' })), [
      'The protagonist ("you"): pronouns she/her. Status: Healthy. Notes: Afraid of water.',
    ])
  })

  it('sends nothing when empty, when only the status is set, or when sharing is off', () => {
    assert.deepEqual(playerLines(player()), [])
    assert.deepEqual(playerLines(player({ pronouns: 'he/him', status: 'Wounded' })), [])
    assert.deepEqual(playerLines(player({ name: 'Hunter', share: false })), [])
  })
})

describe('player storage', () => {
  it('starts empty and healthy, and reads typed values trimmed', async () => {
    const mock = installMockApi()
    await initPlayer()
    assert.deepEqual(await readPlayer(), player())
    mock.story.set(PLAYER.field('name'), '  Hunter ')
    mock.story.set(PLAYER.share, false)
    assert.deepEqual(await readPlayer(), player({ name: 'Hunter', share: false }))
  })
})
