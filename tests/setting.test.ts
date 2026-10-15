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
  changes: '',
  absent: '',
  cutAbsent: true,
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

  it('lists the changes from canon and who is not in the story on their own lines, overriding canon', () => {
    assert.deepEqual(
      settingLines(
        setting({
          world: 'the Naruto universe',
          changes: 'Naruto Uzumaki died as a baby in the Nine-Tails attack.\nTeam 7 is Sasuke, Sakura and Sai',
          absent: 'Naruto Uzumaki, the Nine-Tails jinchuriki',
        }),
      ),
      [
        'Setting: the Naruto universe. Keep to the established canon of this world (its lore, history, technology and characters), except for the changes listed here, which override it.',
        'Changes from canon: Naruto Uzumaki died as a baby in the Nine-Tails attack. Team 7 is Sasuke, Sakura and Sai. Everything that follows from these changes is different too, and the characters know only the world as it is now.',
        'Not in this story: Naruto Uzumaki. Leave them out entirely: they never appear, speak or act, and no one mentions them.',
      ],
    )
    assert.match(settingLines(setting({ absent: 'Naruto Uzumaki\nJiraiya' }))[0], /^Not in this story: Naruto Uzumaki; Jiraiya\. Leave all of them out/)
  })

  it('mentions canon only with a world', () => {
    assert.deepEqual(settingLines(setting({ location: 'a ruined abbey' })), ['Current location: a ruined abbey.'])
  })

  it('sends nothing when empty or when sharing is off', () => {
    assert.deepEqual(settingLines(setting()), [])
    assert.deepEqual(settingLines(setting({ world: 'Mass Effect', absent: 'Shepard', share: false })), [])
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
