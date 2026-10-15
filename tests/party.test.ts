import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installMockApi } from './helpers/mockApi.ts'
import { PARTY, addMember, initParty, moveMember, partyLines, readParty, removeMember, type Party } from '../src/state/party.ts'

const member = (name: string, more: Partial<Party['members'][number]> = {}) => ({
  id: name,
  name,
  role: '',
  status: '',
  attitude: '',
  notes: '',
  present: true,
  ...more,
})

describe('partyLines', () => {
  it('describes each companion travelling with you on its own line', () => {
    const party: Party = {
      share: true,
      members: [
        member('Lyra', { role: 'elf ranger, your guide', status: 'Wounded', attitude: 'Friendly', notes: 'Quick-tempered.\nLooking for her brother' }),
        member('Bram', { role: 'dwarf smith', status: 'Healthy', attitude: 'loyal but resentful!' }),
        member('Zylith'),
      ],
    }
    assert.deepEqual(partyLines(party), [
      'Companion: Lyra, elf ranger, your guide. Status: Wounded. Attitude toward you: Friendly. Notes: Quick-tempered. Looking for her brother.',
      'Companion: Bram, dwarf smith. Status: Healthy. Attitude toward you: loyal but resentful!',
      'Companion: Zylith.',
    ])
  })

  it('leaves out companions who are away or unnamed, and everyone when sharing is off', () => {
    const party: Party = { share: true, members: [member('Lyra', { present: false }), member('  '), member('Bram')] }
    assert.deepEqual(partyLines(party), ['Companion: Bram.'])
    assert.deepEqual(partyLines({ ...party, share: false }), [])
    assert.deepEqual(partyLines({ share: true, members: [] }), [])
  })
})

describe('party storage', () => {
  it('adds companions in a healthy, neutral state, reorders and removes them', async () => {
    const mock = installMockApi()
    await initParty()
    const first = await addMember()
    const second = await addMember()
    let party = await readParty()
    assert.deepEqual(party.members[0], { id: first, name: '', role: '', status: 'Healthy', attitude: 'Neutral', notes: '', present: true })

    await moveMember(second, -1)
    assert.deepEqual(mock.story.get(PARTY.members), [second, first])
    await moveMember(second, -1)
    assert.deepEqual(mock.story.get(PARTY.members), [second, first], 'the first stays first')

    await removeMember(second)
    party = await readParty()
    assert.deepEqual(party.members.map((m) => m.id), [first])
    assert.ok(![...mock.story.keys()].some((key) => key.includes(second)), 'the removed companion is cleaned up')
  })
})
