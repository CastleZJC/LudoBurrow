// 关卡管理：每游戏 50 关序列 + 顺序解锁 + 星级/最佳成绩（技术架构 §13.3）
// 读写一律经 save（load → 新建 → persist，不可变风格）。

import { loadSave, persistSave, defaultGameSave } from './save'
import type { SaveData, GameSaveData } from './save'
import type { LevelRecord, LevelResult } from './types'

/**
 * 每游戏固定总关数（单轨游戏与固定多轨游戏每轨一致，50 关）。
 * 动态关卡游戏（拼图按切片方案数）经 GameModule.levelCount 读取，仅在缺省时回退本常量。
 */
export const TOTAL_LEVELS = 50

/**
 * 进度槽键：单轨游戏 = gameId；多轨游戏（有 track）= `${gameId}:${track}`，各轨独立解锁/星级。
 * games 存档表以此为键，故 level-manager 全部读写函数传入的 gameId 实为进度槽键。
 */
export function progressSlotKey(gameId: string, track?: string): string {
  return track ? `${gameId}:${track}` : gameId
}

function readGame(save: SaveData, gameId: string): GameSaveData {
  return save.games[gameId] ?? defaultGameSave()
}

/**
 * 已解锁关数（1-based：解锁 n 关 = 第 1..n 关可玩）。
 * total：轨内总关数（动态关卡游戏传实际值，如拼图按方案数；缺省固定 50）。
 * 存档解锁数可能高于当前总数（如方案被删）——读取时收敛，不回写。
 */
export function getUnlockedCount(gameId: string, total: number = TOTAL_LEVELS): number {
  const game = readGame(loadSave(), gameId)
  return Math.min(Math.max(1, game.unlockedCount), total)
}

/** 第 n 关是否解锁 */
export function isUnlocked(gameId: string, n: number, total: number = TOTAL_LEVELS): boolean {
  return n >= 1 && n <= getUnlockedCount(gameId, total)
}

/**
 * 单关最佳成绩（未玩过返回 undefined）。
 * key：存档记录键，缺省关卡号；拼图方案关卡传方案 id（方案删除重排不错位）。
 */
export function getLevelRecord(gameId: string, key: string): LevelRecord | undefined {
  return readGame(loadSave(), gameId).levels[key]
}

/** 全部成绩表（关卡选择页渲染） */
export function getLevelRecords(gameId: string): Record<string, LevelRecord> {
  return readGame(loadSave(), gameId).levels
}

/** 合并一次成绩到历史（星级取高 / 用时取低 / 失误取低）；内置进度与拼图方案进度共用同一口径 */
export function mergeLevelRecord(prev: LevelRecord | undefined, result: LevelResult): LevelRecord {
  return {
    stars: Math.max(prev?.stars ?? 0, result.stars),
    bestMs: Math.min(prev?.bestMs ?? Number.POSITIVE_INFINITY, result.elapsedMs),
    bestMistakes: Math.min(prev?.bestMistakes ?? Number.POSITIVE_INFINITY, result.mistakes),
  }
}

/**
 * 记录一次过关成绩：星级取高 / 用时取低 / 失误取低；解锁 n+1。
 * opts.total：轨内总关数（动态关卡游戏传实际值）；opts.recordKey：存档记录键
 * （拼图方案关卡传方案 id，缺省关卡号）。
 */
export function recordResult(
  gameId: string,
  result: LevelResult,
  opts?: { total?: number; recordKey?: string },
): LevelRecord {
  const save = loadSave()
  const game = readGame(save, gameId)
  const key = opts?.recordKey ?? String(result.n)
  const next: LevelRecord = mergeLevelRecord(game.levels[key], result)
  const nextUnlocked = Math.min(Math.max(game.unlockedCount, result.n + 1), opts?.total ?? TOTAL_LEVELS)
  const nextSave: SaveData = {
    ...save,
    games: {
      ...save.games,
      [gameId]: {
        unlockedCount: nextUnlocked,
        levels: { ...game.levels, [key]: next },
      },
    },
  }
  persistSave(nextSave)
  return next
}
