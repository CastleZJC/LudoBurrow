// 词库引擎（技术架构 §15.2 / §10）：英文分级词表 + 拼音词表 + 字符序列生成
// 纯逻辑：随机性一律经注入 Rng（确定性生成纪律）；词表为 TS 内嵌（file:// 兼容）

import type { Rng } from '../rng'

// ---- 英文分级词表（按词长分级；开源常用词表整理，剔除专有名词与不适龄词） ----

export const WORDS_L3: readonly string[] = [
  'cat', 'dog', 'sun', 'bus', 'map', 'red', 'big', 'hot', 'cup', 'pen',
  'box', 'hat', 'bed', 'egg', 'pig', 'fox', 'jam', 'key', 'leg', 'nut',
  'owl', 'bee', 'ant', 'arm', 'art', 'bag', 'car', 'day', 'eat', 'fun',
]

export const WORDS_L4: readonly string[] = [
  'book', 'fish', 'bird', 'cake', 'star', 'tree', 'frog', 'duck', 'milk', 'rain',
  'snow', 'wind', 'blue', 'gray', 'glad', 'jump', 'play', 'read', 'sing', 'walk',
  'door', 'room', 'food', 'game', 'hand', 'home', 'king', 'lamp', 'moon', 'nose',
]

export const WORDS_L5: readonly string[] = [
  'apple', 'candy', 'beach', 'bread', 'chair', 'dance', 'dream', 'eagle', 'field', 'frost',
  'fruit', 'grass', 'heart', 'horse', 'house', 'light', 'money', 'music', 'night', 'ocean',
  'party', 'plant', 'queen', 'river', 'sheep', 'smile', 'snake', 'table', 'tiger', 'water',
]

export const WORDS_L6: readonly string[] = [
  'animal', 'banana', 'bottle', 'bridge', 'candle', 'cherry', 'dinner', 'family', 'forest', 'garden',
  'guitar', 'island', 'jacket', 'kitten', 'letter', 'monkey', 'orange', 'pencil', 'pocket', 'rabbit',
  'school', 'spider', 'spring', 'summer', 'window', 'winter', 'yellow', 'castle', 'dragon', 'puzzle',
]

export const WORDS_L7: readonly string[] = [
  'animals', 'balloon', 'blanket', 'chicken', 'dolphin', 'evening', 'factory', 'giraffe', 'airport', 'journey',
  'kitchen', 'library', 'morning', 'octopus', 'penguin', 'picture', 'present', 'rainbow', 'sailing', 'teacher',
  'village', 'weather', 'bicycle', 'brother', 'monster', 'problem', 'student', 'victory', 'weekend', 'holiday',
]

/** 8+ 字母词（长词挑战级） */
export const WORDS_L8: readonly string[] = [
  'beautiful', 'breakfast', 'butterfly', 'chocolate', 'dangerous', 'different', 'difficult', 'direction', 'dishwasher', 'electricity',
  'everything', 'furniture', 'grandmother', 'grandfather', 'helicopter', 'playground', 'restaurant', 'strawberry', 'television', 'umbrella',
  'understand', 'vacation', 'wonderful', 'adventure', 'sandwiches', 'swimming', 'spaceship', 'snowflake', 'toothbrush', 'watermelon',
]

/** 按目标词长取词表（len >= 8 归 L8；未知级别抛错） */
export function getWordsByLength(len: number): readonly string[] {
  switch (len) {
    case 3: return WORDS_L3
    case 4: return WORDS_L4
    case 5: return WORDS_L5
    case 6: return WORDS_L6
    case 7: return WORDS_L7
    default:
      if (len >= 8) return WORDS_L8
      throw new RangeError(`wordbank: 非法词长 ${len}`)
  }
}

// ---- 拼音词表（{word, pinyin} 分级：识字起步 → 常用词 → 扩展词） ----

export interface PinyinEntry {
  word: string
  /** 空格分隔音节，如 'xue xiao'；目标序列 = 去空格字母串 */
  pinyin: string
}

/** 一级：识字起步（单字） */
export const PINYIN_BASIC: readonly PinyinEntry[] = [
  { word: '大', pinyin: 'da' }, { word: '小', pinyin: 'xiao' }, { word: '上', pinyin: 'shang' },
  { word: '下', pinyin: 'xia' }, { word: '人', pinyin: 'ren' }, { word: '口', pinyin: 'kou' },
  { word: '手', pinyin: 'shou' }, { word: '日', pinyin: 'ri' }, { word: '月', pinyin: 'yue' },
  { word: '水', pinyin: 'shui' }, { word: '火', pinyin: 'huo' }, { word: '山', pinyin: 'shan' },
  { word: '木', pinyin: 'mu' }, { word: '天', pinyin: 'tian' }, { word: '地', pinyin: 'di' },
  { word: '花', pinyin: 'hua' }, { word: '鸟', pinyin: 'niao' }, { word: '虫', pinyin: 'chong' },
  { word: '鱼', pinyin: 'yu' }, { word: '马', pinyin: 'ma' }, { word: '牛', pinyin: 'niu' },
  { word: '羊', pinyin: 'yang' }, { word: '车', pinyin: 'che' }, { word: '门', pinyin: 'men' },
]

/** 二级：常用词（双字词） */
export const PINYIN_COMMON: readonly PinyinEntry[] = [
  { word: '学校', pinyin: 'xue xiao' }, { word: '朋友', pinyin: 'peng you' },
  { word: '老师', pinyin: 'lao shi' }, { word: '爸爸', pinyin: 'ba ba' },
  { word: '妈妈', pinyin: 'ma ma' }, { word: '太阳', pinyin: 'tai yang' },
  { word: '月亮', pinyin: 'yue liang' }, { word: '星星', pinyin: 'xing xing' },
  { word: '白云', pinyin: 'bai yun' }, { word: '大树', pinyin: 'da shu' },
  { word: '小河', pinyin: 'xiao he' }, { word: '花园', pinyin: 'hua yuan' },
  { word: '动物', pinyin: 'dong wu' }, { word: '水果', pinyin: 'shui guo' },
  { word: '米饭', pinyin: 'mi fan' }, { word: '牛奶', pinyin: 'niu nai' },
  { word: '书包', pinyin: 'shu bao' }, { word: '铅笔', pinyin: 'qian bi' },
  { word: '雨伞', pinyin: 'yu san' }, { word: '台灯', pinyin: 'tai deng' },
  { word: '沙发', pinyin: 'sha fa' }, { word: '窗户', pinyin: 'chuang hu' },
  { word: '早晨', pinyin: 'zao chen' }, { word: '晚上', pinyin: 'wan shang' },
]

/** 三级：扩展词（三字及以上） */
export const PINYIN_EXT: readonly PinyinEntry[] = [
  { word: '图书馆', pinyin: 'tu shu guan' }, { word: '动物园', pinyin: 'dong wu yuan' },
  { word: '游泳池', pinyin: 'you yong chi' }, { word: '幼儿园', pinyin: 'you er yuan' },
  { word: '体育场', pinyin: 'ti yu chang' }, { word: '电影院', pinyin: 'dian ying yuan' },
  { word: '音乐会', pinyin: 'yin yue hui' }, { word: '生日蛋糕', pinyin: 'sheng ri dan gao' },
  { word: '彩虹桥', pinyin: 'cai hong qiao' }, { word: '白雪公主', pinyin: 'bai xue gong zhu' },
  { word: '自行车', pinyin: 'zi xing che' }, { word: '飞机票', pinyin: 'fei ji piao' },
  { word: '向日葵', pinyin: 'xiang ri kui' }, { word: '北极星', pinyin: 'bei ji xing' },
  { word: '大熊猫', pinyin: 'da xiong mao' }, { word: '长颈鹿', pinyin: 'chang jing lu' },
  { word: '帆船赛', pinyin: 'fan chuan sai' }, { word: '风筝节', pinyin: 'feng zheng jie' },
  { word: '机器人', pinyin: 'ji qi ren' }, { word: '宇航员', pinyin: 'yu hang yuan' },
]

/** 按等级取拼音词表（1=起步 2=常用 3=扩展） */
export function getPinyinByGrade(grade: 1 | 2 | 3): readonly PinyinEntry[] {
  switch (grade) {
    case 1: return PINYIN_BASIC
    case 2: return PINYIN_COMMON
    case 3: return PINYIN_EXT
  }
}

/** 拼音目标序列：去空格字母串（'xue xiao' → 'xuexiao'） */
export function pinyinToSequence(entry: PinyinEntry): string[] {
  return entry.pinyin.replace(/\s+/g, '').toUpperCase().split('')
}

// ---- 字母数字随机序列（模式 1/2） ----

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'

/**
 * 生成字母数字混合序列（确定性）。
 * digitRatio：数字占比（0-1，默认约 1/4，模拟键盘输入中字母为主）。
 * avoidRepeat：相邻位去重（避免 'AAA' 类误导性序列），默认开启。
 */
export function randomCharSequence(
  rng: Rng,
  length: number,
  options: { digitRatio?: number; avoidRepeat?: boolean } = {},
): string[] {
  const { digitRatio = 0.25, avoidRepeat = true } = options
  if (length < 1) throw new RangeError(`wordbank: 非法序列长度 ${length}`)
  const out: string[] = []
  while (out.length < length) {
    const pool = rng.next() < digitRatio ? DIGITS : ALPHABET
    const ch = pool[rng.int(0, pool.length)]
    if (avoidRepeat && out.length > 0 && out[out.length - 1] === ch) continue
    out.push(ch)
  }
  return out
}
