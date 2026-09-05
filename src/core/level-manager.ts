// 关卡管理：每游戏 50 关序列 + 顺序解锁 + 星级/最佳成绩（技术架构 §13.3）
// 读写一律经 save（load → 新建 → persist，不可变风格）。

import { loadSave, persistSave, defaultGameSave } from './save'
import type { SaveData, GameSaveData } from './save'
import type { LevelRecord, LevelResult } from './types'

/** 每游戏总关数（三游戏一致，50 关） */
export const TOTAL_LEVELS = 50

function readGame(save: SaveData, gameId: string): GameSaveData {
  return save.games[gameId] ?? defaultGameSave()
}

/** 已解锁关数（1-based：解锁 n 关 = 第 1..n 关可玩） */
export function getUnlockedCount(gameId: string): number {
  const game = readGame(loadSave(), gameId)
  return Math.min(Math.max(1, game.unlockedCount), TOTAL_LEVELS)
}

/** 第 n 关是否解锁 */
export function isUnlocked(gameId: string, n: number): boolean {
  return n >= 1 && n <= getUnlockedCount(gameId)
}

/** 单关最佳成绩（未玩过返回 undefined） */
export function getLevelRecord(gameId: string, n: number): LevelRecord | undefined {
  return readGame(loadSave(), gameId).levels[String(n)]
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

/** 记录一次过关成绩：星级取高 / 用时取低 / 失误取低；解锁 n+1（封顶 50） */
export function recordResult(gameId: string, result: LevelResult): LevelRecord {
  const save = loadSave()
  const game = readGame(save, gameId)
  const key = String(result.n)
  const next: LevelRecord = mergeLevelRecord(game.levels[key], result)
  const nextUnlocked = Math.min(Math.max(game.unlockedCount, result.n + 1), TOTAL_LEVELS)
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
