// AI 建议编排与全链路降级单测（开发计划 5.4 / 技术架构 §14.4）
// 强制降级链：未配置/超时/网络/HTTP/无内容 → 本地算法（fallback，plan 恒可用）；
// 非法 JSON / 非法 schema / 质量低于本地（对比择优）→ 拒绝（rejected，plan = 本地算法产出）。
// provider 经 options.provider 注入（DI），不发真实请求。

import { describe, it, expect, afterEach, vi } from 'vitest'
import { createCutPlan, type CutParams, type ImageDataLike } from '@/engines/jigsaw-cutter'
import { createCutPlanFromSuggestion, normalizeSuggestion, type NormalizedSuggestion } from '@/engines/jigsaw-cutter/suggest'
import { DEFAULT_TIMEOUT_MS, suggestCutPlan } from '@/ai/suggest'
import { ProviderError, type CutSuggestionProvider } from '@/ai/provider'
import type { AiConfig } from '@/core/save'

const AI: AiConfig = { provider: 'glm', baseURL: '', model: '', apiKey: 'sk-test' }
const BASE: CutParams = { rows: 2, cols: 2 }

/** 棋盘图：黑白 8px 格（细节均匀 → 任意等分区分度一致，本地/AI 同划分） */
function checkerImage(size = 96, cell = 8): ImageDataLike {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dark = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0
      const v = dark ? 0 : 255
      const i = (y * size + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { width: size, height: size, data }
}

/** 左半粗条纹（周期 32）、右半纯白：列数决定纯白块的邻边对比（cols=2 右块贴条纹边=255；cols=3 最右块只贴白边=0）。验收返工二轮：切块全均匀，质量门槛比较的是不同块数网格 */
function stripeHalfImage(size = 96): ImageDataLike {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = x < size / 2 && x % 32 < 16 ? 0 : 255
      const i = (y * size + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { width: size, height: size, data }
}

/** 记录调用的成功 stub：返回预设文本 */
function stubProvider(text: string): CutSuggestionProvider & { calls: { url: string; timeoutMs: number }[] } {
  const calls: { url: string; timeoutMs: number }[] = []
  return {
    id: 'glm',
    async requestCutSuggestion(url, timeoutMs) {
      calls.push({ url, timeoutMs })
      return text
    },
    calls,
  }
}

/** 恒失败 stub：抛指定错误 */
function failingProvider(err: Error): CutSuggestionProvider {
  return {
    id: 'glm',
    async requestCutSuggestion() {
      throw err
    },
  }
}

/** 归一化合法建议（测试前置） */
function valid(text: string): NormalizedSuggestion {
  const parsed = JSON.parse(text) as unknown
  const r = normalizeSuggestion(parsed)
  if (!r.ok) throw new Error('测试前置：建议应合法')
  return r.suggestion
}

describe('suggestCutPlan 降级链（§14.4 强制顺序）', () => {
  it('未配置 → fallback not-configured：plan 为本地算法产出，不发请求', async () => {
    const img = checkerImage()
    const provider = stubProvider('{"rows":2,"cols":2,"rowWeights":[1,1],"colWeights":[1,1]}')
    const outcome = await suggestCutPlan(img, BASE, 42, 'data:image/png;base64,QUJD', undefined, {
      provider,
    })
    expect(outcome).toMatchObject({ kind: 'fallback', reason: 'not-configured' })
    expect(outcome.kind === 'fallback' && outcome.plan).toEqual(createCutPlan(img, BASE, 42))
    expect(provider.calls).toHaveLength(0) // 未配置不发起请求
  })

  it('ProviderError 四类（timeout/network/http-error/no-content）→ fallback 对应 reason，plan 恒为本地', async () => {
    const img = checkerImage()
    const cases: ProviderError[] = [
      new ProviderError('timeout', '超时'),
      new ProviderError('network', '断网'),
      new ProviderError('http-error', '401', 401),
      new ProviderError('no-content', '空内容'),
    ]
    for (const err of cases) {
      const outcome = await suggestCutPlan(img, BASE, 42, 'data:image/png;base64,QUJD', AI, {
        provider: failingProvider(err),
      })
      expect(outcome).toMatchObject({ kind: 'fallback', reason: err.kind })
      expect(outcome.kind === 'fallback' && outcome.plan).toEqual(createCutPlan(img, BASE, 42))
    }
  })

  it('默认超时透传：未传 timeoutMs → DEFAULT_TIMEOUT_MS 传入 provider', async () => {
    const img = checkerImage()
    const provider = stubProvider('{"rows":2,"cols":2,"rowWeights":[1,1],"colWeights":[1,1]}')
    await suggestCutPlan(img, BASE, 42, 'data:image/png;base64,QUJD', AI, { provider })
    expect(provider.calls[0]!.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
    expect(provider.calls[0]!.url).toBe('data:image/png;base64,QUJD')
  })
})

describe('suggestCutPlan 输出校验（rejected 分支）', () => {
  it('非法 JSON 文本 → rejected invalid-json，plan = 本地', async () => {
    const img = checkerImage()
    const outcome = await suggestCutPlan(img, BASE, 42, 'data:x', AI, {
      provider: stubProvider('抱歉，我无法分析这张图'),
    })
    expect(outcome).toMatchObject({ kind: 'rejected', reason: 'invalid-json' })
    expect(outcome.kind === 'rejected' && outcome.plan).toEqual(createCutPlan(img, BASE, 42))
  })

  it('合法 JSON 但 schema 非法（rows 越界/长度不符）→ rejected invalid-schema', async () => {
    const img = checkerImage()
    const outcome = await suggestCutPlan(img, BASE, 42, 'data:x', AI, {
      provider: stubProvider('{"rows":99,"cols":2,"rowWeights":[1,1],"colWeights":[1,1]}'),
    })
    expect(outcome).toMatchObject({ kind: 'rejected', reason: 'invalid-schema' })
  })

  it('质量门槛（对比择优）：建议 3 列切出只贴白边的纯白块（minScore 更低）→ rejected low-quality', async () => {
    const img = stripeHalfImage()
    // 本地 2×2：右块贴条纹边界（对比 255）→ minScore ≥ 40；建议 2×3：最右纯白块只贴白边（对比 0）→ minScore = 0
    const text = '{"rows":2,"cols":3,"rowWeights":[1,1],"colWeights":[1,1,1]}'
    const outcome = await suggestCutPlan(img, BASE, 42, 'data:x', AI, { provider: stubProvider(text) })
    expect(outcome).toMatchObject({ kind: 'rejected', reason: 'low-quality' })
    expect(outcome.kind === 'rejected' && outcome.plan).toEqual(createCutPlan(img, BASE, 42))
  })
})

describe('suggestCutPlan 应用分支（applied）', () => {
  const TEXT = '{"rows":2,"cols":2,"rowWeights":[1,1],"colWeights":[1,1]}'

  it('棋盘图均匀建议（与本地同划分，minScore 不低于本地）→ applied，plan 为建议链路产出', async () => {
    const img = checkerImage()
    const outcome = await suggestCutPlan(img, BASE, 42, 'data:x', AI, { provider: stubProvider(TEXT) })
    expect(outcome.kind).toBe('applied')
    if (outcome.kind !== 'applied') return
    const suggestion = valid(TEXT)
    expect(outcome.plan).toEqual(createCutPlanFromSuggestion(img, suggestion, BASE, 42))
    // 持久化形状：归一化权重（和为 1）
    const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
    expect(sum(outcome.suggestion.rowWeights)).toBeCloseTo(1, 12)
    expect(sum(outcome.suggestion.colWeights)).toBeCloseTo(1, 12)
  })
})

describe('suggestCutPlan 边界（provider 构造与意外错误）', () => {
  const TEXT = '{"rows":2,"cols":2,"rowWeights":[1,1],"colWeights":[1,1]}'
  afterEach(() => vi.unstubAllGlobals())

  it('未注入 provider：按配置构造真实 provider（fetch 全链路 → applied）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: TEXT } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const img = checkerImage()
    // 不传 options.provider → 内部走 createSuggestionProvider（棋盘图同划分 → applied）
    const outcome = await suggestCutPlan(img, BASE, 42, 'data:x', AI)
    expect(outcome.kind).toBe('applied')
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1)
  })

  it('provider 意外错误（非 ProviderError）→ 上抛不静默吞', async () => {
    const img = checkerImage()
    await expect(
      suggestCutPlan(img, BASE, 42, 'data:x', AI, { provider: failingProvider(new Error('bug')) }),
    ).rejects.toThrow('bug')
  })
})
