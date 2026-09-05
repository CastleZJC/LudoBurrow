import { describe, it, expect } from 'vitest'
import { createTimer, formatElapsed } from '@/core/timer'

/** 受控时钟：手动推进，保证测试确定性 */
function controlledClock() {
  let t = 0
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

describe('timer', () => {
  it('正计时准确：elapsed 随时钟推进增长', () => {
    const clock = controlledClock()
    const timer = createTimer({ now: clock.now })
    timer.start()
    clock.advance(1000)
    expect(timer.getElapsedMs()).toBe(1000)
    clock.advance(500)
    expect(timer.getElapsedMs()).toBe(1500)
  })

  it('暂停期间不计时，恢复后继续累计', () => {
    const clock = controlledClock()
    const timer = createTimer({ now: clock.now })
    timer.start()
    clock.advance(2000)
    timer.pause()
    clock.advance(5000) // 暂停段不计
    expect(timer.getElapsedMs()).toBe(2000)
    timer.resume()
    clock.advance(1000)
    expect(timer.getElapsedMs()).toBe(3000)
  })

  it('stop 返回最终累计用时并可重复调用幂等', () => {
    const clock = controlledClock()
    const timer = createTimer({ now: clock.now })
    timer.start()
    clock.advance(1234)
    timer.pause()
    clock.advance(999)
    const final = timer.stop()
    expect(final).toBe(1234)
    expect(timer.stop()).toBe(1234)
    expect(timer.getElapsedMs()).toBe(1234)
  })

  it('竞赛模式：达到上限 checkLimit 返回 reached', () => {
    const clock = controlledClock()
    const timer = createTimer({ now: clock.now, limit: { mode: 'competition', limitMs: 10_000 } })
    timer.start()
    expect(timer.checkLimit()).toBe('ok')
    clock.advance(9999)
    expect(timer.checkLimit()).toBe('ok')
    clock.advance(1)
    expect(timer.checkLimit()).toBe('reached')
  })

  it('防沉迷模式：同样按上限检测（到时提醒由平台处理）', () => {
    const clock = controlledClock()
    const timer = createTimer({ now: clock.now, limit: { mode: 'antiAddiction', limitMs: 5000 } })
    timer.start()
    clock.advance(5000)
    expect(timer.checkLimit()).toBe('reached')
  })

  it('暂停段不计入上限检测', () => {
    const clock = controlledClock()
    const timer = createTimer({ now: clock.now, limit: { mode: 'competition', limitMs: 5000 } })
    timer.start()
    clock.advance(4000)
    timer.pause()
    clock.advance(6000) // 暂停段不计
    expect(timer.checkLimit()).toBe('none') // paused 状态不检测
    timer.resume()
    clock.advance(1000)
    expect(timer.checkLimit()).toBe('reached')
  })

  it('无上限配置时 checkLimit 返回 none', () => {
    const clock = controlledClock()
    const timer = createTimer({ now: clock.now })
    timer.start()
    clock.advance(100_000)
    expect(timer.checkLimit()).toBe('none')
  })

  it('非法状态转换被拒绝（编程错误立即暴露）', () => {
    const timer = createTimer({ now: () => 0 })
    expect(() => timer.pause()).toThrow()
    expect(() => timer.resume()).toThrow()
    timer.start()
    expect(() => timer.start()).toThrow()
    expect(() => timer.resume()).toThrow()
  })
})

describe('formatElapsed', () => {
  it('毫秒格式化为 mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(59_999)).toBe('00:59')
    expect(formatElapsed(60_000)).toBe('01:00')
    expect(formatElapsed(754_000)).toBe('12:34')
  })
})
