import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { recordResult, getLevelRecords } from '@/core/level-manager'
import LevelSelect from '@/components/LevelSelect.vue'
import { mountWithApp } from './helpers'

describe('debug', () => {
  it('assert directly', async () => {
    localStorage.clear()
    setActivePinia(createPinia())
    recordResult('keygame', { gameId: 'keygame', n: 1, elapsedMs: 12_300, mistakes: 2, stars: 2 })
    console.log('RECORDS_FROM_CORE:', JSON.stringify(getLevelRecords('keygame')))
    const wrapper = mountWithApp(LevelSelect, { props: { gameId: 'keygame' } })
    const cell = wrapper.find('[data-level="1"]')
    console.log('HAS_STARS_EL:', cell.find('.level-stars').exists())
    console.log('CELL_TEXT_LEN:', cell.text().length)
    expect(cell.find('.level-stars').exists()).toBe(true)
    wrapper.unmount()
  })
})
