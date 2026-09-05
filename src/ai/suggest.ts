// AI 建议编排与全链路降级（技术架构 §14.4）
// 强制顺序：本地算法先算（兜底基准）→ 未配置/失败/超时/无内容 → fallback（plan 恒为本地产出）；
// 输出经规范化器（§14.5）→ 建议 plan 与本地 plan 对比择优（minScore 不低于本地才应用）。
// 任何分支调用方都拿到可用 plan —— 离线 file:// 与在线体验同构。

import { createCutPlan, normalizeCutParams, type CutParams, type CutPlan, type ImageDataLike } from '@/engines/jigsaw-cutter'
import {
  createCutPlanFromSuggestion,
  normalizeSuggestion,
  parseSuggestionText,
  type NormalizedSuggestion,
} from '@/engines/jigsaw-cutter/suggest'
import type { AiConfig } from '@/core/save'
import { createSuggestionProvider, isProviderConfigured, ProviderError, type CutSuggestionProvider } from './provider'

/** 默认请求超时（视觉模型分析较慢，30s 上限） */
export const DEFAULT_TIMEOUT_MS = 30_000

export type SuggestOutcome =
  | { kind: 'applied'; plan: CutPlan; suggestion: NormalizedSuggestion }
  /** AI 输出不可用：invalid-json / invalid-schema / low-quality（对比择优落败）；plan = 本地算法产出 */
  | { kind: 'rejected'; reason: 'invalid-json' | 'invalid-schema' | 'low-quality'; plan: CutPlan }
  /** 请求层不可用：not-configured / timeout / network / http-error / no-content；plan = 本地算法产出 */
  | { kind: 'fallback'; reason: 'not-configured' | 'timeout' | 'network' | 'http-error' | 'no-content'; plan: CutPlan }

export interface SuggestOptions {
  timeoutMs?: number
  /** 依赖注入（测试替换；缺省按配置构造真实 provider） */
  provider?: CutSuggestionProvider
}

/**
 * 请求 AI 切块建议并走完降级链。返回的 plan 在任何分支下都可直接使用：
 * applied 为建议方案；rejected/fallback 为本地算法方案（非阻断，UI 层提示原因即可）。
 */
export async function suggestCutPlan(
  image: ImageDataLike,
  base: CutParams,
  seed: number,
  imageDataUrl: string,
  ai: AiConfig | undefined,
  options: SuggestOptions = {},
): Promise<SuggestOutcome> {
  // 本地方案永远先算：降级兜底 + 质量对比基准
  const localPlan = createCutPlan(image, base, seed)

  if (!isProviderConfigured(ai)) {
    return { kind: 'fallback', reason: 'not-configured', plan: localPlan }
  }

  const provider =
    options.provider ?? createSuggestionProvider(ai!, {
      rows: normalizeCutParams(base).rows,
      cols: normalizeCutParams(base).cols,
    })

  let text: string
  try {
    text = await provider.requestCutSuggestion(imageDataUrl, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  } catch (err) {
    if (err instanceof ProviderError) {
      return { kind: 'fallback', reason: err.kind, plan: localPlan }
    }
    // provider 契约只抛 ProviderError；意外错误上抛（开发期暴露，不静默吞）
    throw err
  }

  const parsed = parseSuggestionText(text)
  if (!parsed.ok) return { kind: 'rejected', reason: 'invalid-json', plan: localPlan }

  const normalized = normalizeSuggestion(parsed.suggestion)
  if (!normalized.ok) return { kind: 'rejected', reason: 'invalid-schema', plan: localPlan }

  const plan = createCutPlanFromSuggestion(image, normalized.suggestion, base, seed)
  // 对比择优：建议方案唯一性最低分低于本地 → 质量不达标，拒绝（plan 仍可用本地）
  if (plan.minScore < localPlan.minScore) {
    return { kind: 'rejected', reason: 'low-quality', plan: localPlan }
  }
  return { kind: 'applied', plan, suggestion: normalized.suggestion }
}
