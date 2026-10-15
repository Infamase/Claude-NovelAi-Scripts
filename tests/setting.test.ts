import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installMockApi } from './helpers/mockApi.ts'
import { SETTING, initSetting, readSetting, settingLines, type Setting } from '../src/state/setting.ts'

const setting = (more: Partial<Setting> = {}): Setting => ({
  share: true,
  world: '',
  location: '',
  time: '',
  canon: true,
  notes: '',
  ...more,
})

describe('settingLines', () => {
  it('describes the world, the place and the time on one line, keeping to canon', () => {
    assert.deepEqual(
      settingLines(
        setting({
          world: 'the Mass Effect universe',
          location: 'Illium, the Nos Astra trading floor',
          time: '2186, during the events of Mass Effect 3',
        }),
      ),
      [
        'Setting: the Mass Effect universe. Current location: Illium, the Nos Astra trading floor. Time: 2186, during the events of Mass Effect 3. Keep to the established canon of this world (its lore, history, technology and characters).',
      ],
    )
  })

  it('lets the notes override canon, or leaves canon out', () => {
    assert.deepEqual(settingLines(setting({ world: 'Mass Effect', notes: 'Shepard is dead.\nThe Reapers won' })), [
      'Setting: Mass Effect. Keep to the established canon of this world (its lore, history, technology and characters), except where the notes say otherwise. Notes: Shepard is dead. The Reapers won.',
    ])
    assert.deepEqual(settingLines(setting({ world: 'Aerth, an original world', canon: false })), ['Setting: Aerth, an original world.'])
  })

  it('mentions canon only with a world', () => {
    assert.deepEqual(settingLines(setting({ location: 'a ruined abbey' })), ['Current location: a ruined abbey.'])
  })

  it('sends nothing when empty or when sharing is off', () => {
    assert.deepEqual(settingLines(setting()), [])
    assert.deepEqual(settingLines(setting({ world: 'Mass Effect', share: false })), [])
  })
})

describe('setting storage', () => {
  it('starts empty, keeping to canon, and reads typed values trimmed', async () => {
    const mock = installMockApi()
    await initSetting()
    assert.deepEqual(await readSetting(), setting())
    mock.story.set(SETTING.field('world'), ' Mass Effect ')
    mock.story.set(SETTING.canon, false)
    assert.deepEqual(await readSetting(), setting({ world: 'Mass Effect', canon: false }))
  })
})
