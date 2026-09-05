// 平台级状态（技术架构 §16.2）：视图切换 / 当前游戏与关卡 / 设置快照 / 结算数据
// 游戏内部状态不进 store（留在 GameInstance 内部）
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BaseLevelConfig, LevelResult } from '@/core/types'
import { getSettings, updateSettings } from '@/core/settings'
import type { Settings } from '@/core/settings'
import { applyLocale, type SupportedLocale } from '@/i18n'
import type { TimeLimitData } from '@/core/save'

export type PlatformView = 'menu' | 'select' | 'game' | 'settings' | 'schemes'

/** 结算面板数据（过关/失败共用） */
export interface SettleInfo {
  result: LevelResult
  isNewBest: boolean
  isFail: boolean
}

export const usePlatformStore = defineStore('platform', () => {
  // ---- 视图状态机 ----
  const view = ref<PlatformView>('menu')
  const currentGameId = ref<string | null>(null)
  const currentLevelN = ref(1)
  const currentLevelConfig = ref<BaseLevelConfig | null>(null)
  const settleInfo = ref<SettleInfo | null>(null)

  // ---- 设置快照（响应式；写经 core/settings 持久化后同步刷新） ----
  const settings = ref<Settings>(getSettings())

  function refreshSettings(): void {
    settings.value = getSettings()
  }

  function patchSettings(patch: Partial<Settings>): void {
    updateSettings(patch)
    refreshSettings()
  }

  /** 切换语言：写设置 + 立即生效（F-24） */
  function changeLocale(locale: SupportedLocale): void {
    patchSettings({ locale })
    applyLocale(locale)
  }

  const timeLimit = computed<TimeLimitData>(() => settings.value.timeLimit)

  // ---- 视图导航 ----
  function goMenu(): void {
    view.value = 'menu'
    currentGameId.value = null
    settleInfo.value = null
  }

  function openGameSelect(gameId: string): void {
    currentGameId.value = gameId
    view.value = 'select'
  }

  function openSettings(): void {
    view.value = 'settings'
  }

  /** 拼图方案管理页（§11.8；currentGameId 保留供返回选关） */
  function openSchemes(): void {
    view.value = 'schemes'
  }

  function openLevel(config: BaseLevelConfig): void {
    currentGameId.value = config.gameId
    currentLevelN.value = config.n
    currentLevelConfig.value = config
    settleInfo.value = null
    view.value = 'game'
  }

  /** 游戏结束回选关页（结算面板出口） */
  function exitToSelect(): void {
    if (!currentGameId.value) return goMenu()
    settleInfo.value = null
    view.value = 'select'
  }

  function setSettle(info: SettleInfo): void {
    settleInfo.value = info
  }

  return {
    view, currentGameId, currentLevelN, currentLevelConfig, settleInfo,
    settings, timeLimit,
    refreshSettings, patchSettings, changeLocale,
    goMenu, openGameSelect, openSettings, openSchemes, openLevel, exitToSelect, setSettle,
  }
})
