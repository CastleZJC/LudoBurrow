// AI Provider 适配层（技术架构 §14.2/§14.3）
// OpenAI 兼容 chat/completions 协议 + AbortController 超时。分层边界：本层只做「HTTP 进、
// 文本出」（请求封装与失败分类），JSON 解析与规范化归 engines/jigsaw-cutter/suggest。
// 密钥经 AiConfig 注入（localStorage 存储、导出默认脱敏，发布原则 F-16），本层不落盘。

import type { AiConfig } from '@/core/save'

export type ProviderId = AiConfig['provider']

/** 预设端点（§14.2）：qwen = 阿里 DashScope 兼容模式；glm = 智谱开放平台（一期模型口径 glm-5.3） */
export const PROVIDER_PRESETS: Record<ProviderId, { baseURL: string; model: string }> = {
  qwen: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-vl-max',
  },
  glm: {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.3',
  },
  custom: { baseURL: '', model: '' },
}

/** 解析后配置：预设项缺省由预设补全（用户显式填写优先）；custom 原样透传不套预设 */
export interface ResolvedProviderConfig {
  id: ProviderId
  baseURL: string
  model: string
  apiKey: string
}

export function resolveProviderConfig(ai: AiConfig): ResolvedProviderConfig {
  const preset = PROVIDER_PRESETS[ai.provider]
  return {
    id: ai.provider,
    baseURL: (ai.baseURL || preset.baseURL).trim(),
    model: (ai.model || preset.model).trim(),
    apiKey: ai.apiKey.trim(),
  }
}

/** 「已配置」判定（降级链入口 §14.4）：端点/模型/密钥三要素齐备才发起请求，否则本地算法 */
export function isProviderConfigured(ai: AiConfig | undefined): boolean {
  if (!ai) return false
  const c = resolveProviderConfig(ai)
  return c.baseURL !== '' && c.model !== '' && c.apiKey !== ''
}

/** Provider 失败分类（降级链提示与测试断言口径，§14.4） */
export type ProviderErrorKind = 'timeout' | 'network' | 'http-error' | 'no-content'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  readonly status?: number

  constructor(kind: ProviderErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
    this.status = status
  }
}

/** 目标网格（提示词注入：建议须尊重用户设定的切块数，只分配权重） */
export interface SuggestionGrid {
  rows: number
  cols: number
}

/** 视觉建议提示词：约定 JSON 输出形状与权重语义（细节区低权重 = 小块） */
function buildSuggestionMessages(imageDataUrl: string, grid: SuggestionGrid): unknown[] {
  const prompt = [
    '你是拼图切块设计师。分析这张图片的视觉复杂度分布，为拼图切块方案分配行列权重：',
    `- 目标网格：${grid.rows} 行 × ${grid.cols} 列（不得改变行列数）`,
    '- rowWeights 长度为 ' + grid.rows + '：每行块的相对高度权重；colWeights 长度为 ' + grid.cols + '：每列块的相对宽度权重',
    '- 权重为正数：平坦区域（天空/纯色）用大权重切大块，细节丰富区域（人脸/纹理）用小权重切小块',
    '- 只输出 JSON，不要任何解释：{"rows":' + grid.rows + ',"cols":' + grid.cols + ',"rowWeights":[...],"colWeights":[...]}',
  ].join('\n')
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ]
}

export interface CutSuggestionProvider {
  id: ProviderId
  /**
   * 请求切块建议：成功返回模型文本输出（期望为 JSON，解析归调用方）。
   * 失败抛 ProviderError（timeout/network/http-error/no-content）。
   */
  requestCutSuggestion(imageDataUrl: string, timeoutMs: number): Promise<string>
}

/** 从响应体提取首个 choice 的 content（不可用返回 null） */
function extractContent(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const choices = (body as Record<string, unknown>).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = choices[0] as unknown
  if (typeof first !== 'object' || first === null) return null
  const message = (first as Record<string, unknown>).message
  if (typeof message !== 'object' || message === null) return null
  const content = (message as Record<string, unknown>).content
  return typeof content === 'string' && content.trim() !== '' ? content : null
}

/** 构造建议 Provider（每次请求创建新实例；grid 变更时重建） */
export function createSuggestionProvider(ai: AiConfig, grid: SuggestionGrid): CutSuggestionProvider {
  const config = resolveProviderConfig(ai)
  return {
    id: config.id,
    async requestCutSuggestion(imageDataUrl: string, timeoutMs: number): Promise<string> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let res: Response
      try {
        res = await fetch(`${config.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: buildSuggestionMessages(imageDataUrl, grid),
          }),
          signal: controller.signal,
        })
      } catch (err) {
        // AbortController 超时先于 fetch 失败：DOMException(name=AbortError)
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new ProviderError('timeout', `AI 请求超时（>${timeoutMs}ms）`)
        }
        throw new ProviderError('network', `AI 网络错误：${(err as Error).message}`)
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) {
        throw new ProviderError('http-error', `AI 服务返回 HTTP ${res.status}`, res.status)
      }
      let body: unknown
      try {
        body = await res.json()
      } catch {
        throw new ProviderError('no-content', 'AI 响应体不是合法 JSON')
      }
      const content = extractContent(body)
      if (content === null) {
        throw new ProviderError('no-content', 'AI 响应无可用内容')
      }
      return content
    },
  }
}
