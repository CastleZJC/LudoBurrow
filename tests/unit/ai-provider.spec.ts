// AI Provider 适配层单测（开发计划 5.1 / 技术架构 §14.2-§14.3）
// OpenAI 兼容请求封装：预设补全 / 配置判定 / 成功路径请求体 / 失败分类（超时/网络/HTTP/无内容）。
// fetch 全局 stub：HTTP 层单测不发真实请求。

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  PROVIDER_PRESETS,
  ProviderError,
  createSuggestionProvider,
  isProviderConfigured,
  resolveProviderConfig,
} from '@/ai/provider'
import type { AiConfig } from '@/core/save'

const GLM: AiConfig = { provider: 'glm', baseURL: '', model: '', apiKey: 'sk-test' }
const GRID = { rows: 3, cols: 3 }

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('resolveProviderConfig（预设补全，§14.3）', () => {
  it('glm 空 baseURL/model → 预设补全（一期模型口径 glm-5.3）', () => {
    const c = resolveProviderConfig(GLM)
    expect(c.id).toBe('glm')
    expect(c.baseURL).toBe(PROVIDER_PRESETS.glm.baseURL)
    expect(c.model).toBe('glm-5.3')
  })

  it('显式 baseURL/model 优先于预设；custom 不套预设原样透传', () => {
    const c = resolveProviderConfig({
      provider: 'glm',
      baseURL: 'https://my-proxy.example/v1',
      model: 'glm-5.3-air',
      apiKey: 'k',
    })
    expect(c.baseURL).toBe('https://my-proxy.example/v1')
    expect(c.model).toBe('glm-5.3-air')
    const custom = resolveProviderConfig({
      provider: 'custom',
      baseURL: 'http://localhost:8000/v1',
      model: 'local-vlm',
      apiKey: 'k',
    })
    expect(custom).toMatchObject({ baseURL: 'http://localhost:8000/v1', model: 'local-vlm' })
  })
})

describe('isProviderConfigured（降级链入口判定，§14.4）', () => {
  it('未定义 / 缺 apiKey / custom 缺 baseURL → false；预设项齐备 → true', () => {
    expect(isProviderConfigured(undefined)).toBe(false)
    expect(isProviderConfigured({ provider: 'glm', baseURL: '', model: '', apiKey: '' })).toBe(false)
    expect(isProviderConfigured({ provider: 'custom', baseURL: '', model: 'm', apiKey: 'k' })).toBe(false)
    expect(isProviderConfigured(GLM)).toBe(true)
  })
})

describe('createSuggestionProvider（OpenAI 兼容请求）', () => {
  it('成功：POST {baseURL}/chat/completions + Bearer 鉴权 + 视觉消息体 → 返回 content 文本', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ choices: [{ message: { content: '{"rows":3,"cols":3}' } }] }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createSuggestionProvider(GLM, GRID)
    const text = await provider.requestCutSuggestion('data:image/png;base64,QUJD', 30_000)

    expect(text).toBe('{"rows":3,"cols":3}')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe(`${PROVIDER_PRESETS.glm.baseURL}/chat/completions`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body as string) as { model: string; messages: { content: unknown[] }[] }
    expect(body.model).toBe('glm-5.3')
    expect(body.messages).toHaveLength(1)
    const parts = body.messages[0]!.content as Array<Record<string, unknown>>
    const textPart = parts.find((p) => p.type === 'text') as { text: string } | undefined
    const imgPart = parts.find((p) => p.type === 'image_url') as { image_url: { url: string } } | undefined
    expect(textPart?.text).toContain('rowWeights') // 提示词约定权重字段形状
    expect(textPart?.text).toContain('3') // 目标网格数注入提示词
    expect(imgPart?.image_url.url).toBe('data:image/png;base64,QUJD')
  })

  it('HTTP 非 2xx → ProviderError http-error（含 status）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"bad key"}', { status: 401 })))
    const provider = createSuggestionProvider(GLM, GRID)
    await expect(provider.requestCutSuggestion('data:image/png;base64,QUJD', 1000)).rejects.toMatchObject({
      name: 'ProviderError',
      kind: 'http-error',
      status: 401,
    })
  })

  it('超时（timeoutMs 内未响应，AbortController 中止）→ ProviderError timeout', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )
    const provider = createSuggestionProvider(GLM, GRID)
    await expect(provider.requestCutSuggestion('data:image/png;base64,QUJD', 20)).rejects.toMatchObject({
      kind: 'timeout',
    })
  })

  it('网络错误（fetch reject）→ ProviderError network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const provider = createSuggestionProvider(GLM, GRID)
    await expect(provider.requestCutSuggestion('data:image/png;base64,QUJD', 1000)).rejects.toMatchObject({
      kind: 'network',
    })
  })

  it('200 但无可用内容（空 choices / content 空白 / 响应体非 JSON）→ ProviderError no-content', async () => {
    const provider = createSuggestionProvider(GLM, GRID)
    const call = async (res: Response): Promise<void> => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res))
      await expect(provider.requestCutSuggestion('data:image/png;base64,QUJD', 1000)).rejects.toMatchObject({
        kind: 'no-content',
      })
    }
    await call(okResponse({ choices: [] }))
    await call(okResponse({ choices: [{ message: { content: '   ' } }] }))
    await call(new Response('not-json', { status: 200 }))
  })

  it('ProviderError 可 instanceof 判别（降级链 catch 分类口径）', () => {
    const e = new ProviderError('timeout', '请求超时')
    expect(e).toBeInstanceOf(ProviderError)
    expect(e).toBeInstanceOf(Error)
    expect(e.kind).toBe('timeout')
    expect(e.message).toBe('请求超时')
  })
})
