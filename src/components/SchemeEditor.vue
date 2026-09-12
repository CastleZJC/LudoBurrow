<script setup lang="ts">
// 拼图方案编辑器（2026-09-12 就近编辑布局：自 SchemeManager 抽出为子组件）
// scheme=null 新建：父层置于列表顶部；scheme 给定编辑：父层内联于对应卡片下方。
// 每次打开 = 新实例，setup 按 props 一次性初始化（替代原 openPanel/openEditPanel 手工重置）。

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getEnvAdapter } from '@/services'
import type { JigsawSchemeData, JigsawSchemeMode, JigsawSchemeSource } from '@/core/save'
import { getSettings } from '@/core/settings'
import { getLevelRecord, progressSlotKey } from '@/core/level-manager'
import { suggestCutPlan } from '@/ai/suggest'
import type { ImageDataLike } from '@/engines/jigsaw-cutter'
import { buildAxisLines, buildTabSpecs, sampleEdgePoints } from '@/engines/jigsaw-cutter'
import { type NormalizedSuggestion } from '@/engines/jigsaw-cutter/suggest'
import { createScheme, topicOfSource, updateScheme } from '@/games/jigsaw/schemes'
import { pickBestSpec } from '@/games/jigsaw/optimize'
import { createRng } from '@/engines/rng'
import { GALLERY, GALLERY_TOPICS, downscaleToAnalysis, loadSourceImage } from '@/games/jigsaw/gallery'
import { THUMBS } from '@/games/jigsaw/thumbs'

const props = defineProps<{
  /** 编辑的方案；null = 新建 */
  scheme: JigsawSchemeData | null
  /** 当前方案清单：F-18 同图判定 + 默认名序号（父层响应式镜像） */
  schemes: JigsawSchemeData[]
}>()

const emit = defineEmits<{ saved: []; cancel: [] }>()

const { t } = useI18n()

// ---- 表单状态（实例化即初始化） ----
const s = props.scheme
const isNew = s === null
const name = ref(s ? s.name : '')
const sourceKind = ref<'builtin' | 'custom'>(s ? s.source.kind : 'builtin')
const imageId = ref(s && s.source.kind === 'builtin' ? s.source.imageId : GALLERY[0]!.id)
const customAssetId = ref(s && s.source.kind === 'custom' ? s.source.assetId : '')
const customName = ref('')
const customPreviewUrl = ref('')
// 默认 8×8 = 64 块（反馈三轮：默认切块量级 ≈60，旧 4×4 偏少）
const rows = ref(s ? s.params.rows : 8)
const cols = ref(s ? s.params.cols : 8)
const tabDepth = ref(s ? s.params.tabDepth : 0.16)
const seed = ref(s ? s.params.seed : Math.floor(Math.random() * 0x1_0000_0000))
// ---- 三分类模式（反馈 2）：custom 手动 / auto 自动最优 / ai AI 切块 ----
const mode = ref<JigsawSchemeMode>(s ? (s.mode ?? 'custom') : 'custom')
const difficulty = ref<'easy' | 'medium' | 'hard'>('medium')
/** 难度三档 → 复杂度档（块数窗口：简单 17-24 / 中等 36-48 / 困难 64-81） */
const DIFFICULTY_COMPLEXITY = { easy: 2, medium: 4, hard: 6 } as const
/** 分析失败回落：难度占位网格（与 schemes.ts builtinGrid 同档口径） */
const DIFFICULTY_FALLBACK = {
  easy: { rows: 4, cols: 5 },
  medium: { rows: 6, cols: 7 },
  hard: { rows: 8, cols: 9 },
} as const
/** 唯一性阈值固定值（反馈 2：不再 UI 外露；保存/AI 请求/批量导入统一口径） */
const DEFAULT_UNIQUENESS_THRESHOLD = 18
const uploading = ref(false)
const uploadError = ref('')
const formError = ref('')
/** F-18：保存二次确认态（3 秒未确认自动复原） */
const saveConfirm = ref(false)
let saveConfirmTimer: ReturnType<typeof setTimeout> | null = null
// ---- AI 建议状态（M5.5：applied 后暂存权重，保存时随方案入档）----
const suggesting = ref(false)
const aiFeedback = ref('')
const appliedSuggestion = ref<NormalizedSuggestion | null>(
  s && s.params.suggestion
    ? {
        rows: s.params.rows,
        cols: s.params.cols,
        rowWeights: [...s.params.suggestion.rowWeights],
        colWeights: [...s.params.suggestion.colWeights],
      }
    : null,
)
// ---- 自动最优状态（模式 auto：难度档 → 复杂度窗口，按图内容选规格，仅回填表单不直接建方案）----
const autoRunning = ref(false)
const autoFeedback = ref('')
/** 本次面板会话内自动最优是否真实推导过（savedMode 依据：未推导不误标 auto） */
const autoDerived = ref(s ? (s.mode ?? 'custom') === 'auto' : false)
/** latest-wins 令牌：难度/图源在分析在途时切换，旧触发的结果整体丢弃 */
let autoToken = 0

const PREVIEW_SIZE = 240

// 自定义图源预览：经素材仓库取 blob 转 dataUrl（异步；失败留空不阻断编辑）
if (s && s.source.kind === 'custom') {
  void getEnvAdapter()
    .assetRepo.loadImage({ id: s.source.assetId })
    .then((blob) => blobToDataUrl(blob))
    .then((url) => {
      if (sourceKind.value === 'custom') customPreviewUrl.value = url
    })
    .catch(() => {})
}

const previewSrc = computed(() =>
  sourceKind.value === 'builtin' ? (THUMBS[imageId.value] ?? '') : customPreviewUrl.value,
)

const topicGroups = GALLERY_TOPICS.map((topic) => ({
  labelKey: topic.labelKey,
  entries: GALLERY.filter((e) => e.topic === topic.id),
}))

// 就近滚动（2026-09-12 布局优化）：挂载后若不在视口内滚至可见；可选调用守卫兼容 happy-dom
const rootEl = ref<HTMLElement | null>(null)
onMounted(() => {
  redrawPreview() // 原实现靠 watch(panelOpen) 首绘；子组件改为挂载即绘
  void nextTick(() => rootEl.value?.scrollIntoView?.({ block: 'nearest' }))
})

// ---- 参数校验（与 save.ts validateJigsawSchemeParams 同口径） ----
function currentSource(): JigsawSchemeSource {
  return sourceKind.value === 'builtin'
    ? { kind: 'builtin', imageId: imageId.value }
    : { kind: 'custom', assetId: customAssetId.value }
}

function validateForm(): string {
  if (!Number.isInteger(rows.value) || rows.value < 2 || rows.value > 12) return t('schemes.invalidParams')
  if (!Number.isInteger(cols.value) || cols.value < 2 || cols.value > 12) return t('schemes.invalidParams')
  if (tabDepth.value < 0.08 || tabDepth.value > 0.25) return t('schemes.invalidParams')
  if (sourceKind.value === 'custom' && !customAssetId.value) return t('schemes.needImage')
  return ''
}

// ---- 上传（M3.11：图片经 services/ 素材仓库存 IndexedDB，方案只存引用） ----
async function onUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    uploadError.value = t('schemes.notImage')
    return
  }
  uploading.value = true
  uploadError.value = ''
  try {
    const assetRef = await getEnvAdapter().assetRepo.saveImage(file, {
      name: file.name,
      size: file.size,
      type: file.type,
      addedAt: Date.now(),
    })
    customAssetId.value = assetRef.id
    customName.value = file.name
    sourceKind.value = 'custom'
    if (customPreviewUrl.value) URL.revokeObjectURL(customPreviewUrl.value)
    customPreviewUrl.value = URL.createObjectURL(file)
  } catch {
    uploadError.value = t('schemes.uploadFail')
  } finally {
    uploading.value = false
  }
}

// ---- 实时预览：底图（缩略 data URI / 上传 objectURL）+ 真实锯齿切割线（引擎同源采样）----
const previewCanvas = ref<HTMLCanvasElement | null>(null)
let previewToken = 0

// 模式联动：进 auto 即按当前图与难度自动选规格（换图/换难度重算）；离开 ai 清除建议权重（防跨模式误带）
// 打开既有 auto 方案不自动重算：预填保留存量参数（改难度/换图才重推导，open→save 不再随机漂移 tabDepth）
// （实例仅在面板打开时存在，原 watch 数组中的 panelOpen 维度随抽取移除）
watch([mode, difficulty, imageId, customAssetId], async () => {
  if (mode.value !== 'ai' && appliedSuggestion.value) appliedSuggestion.value = null
  if (mode.value === 'auto') await runAutoSpec()
})

// seed 纳入重绘依赖 —— 花样随面板打开内部随机，预览与保存所见即所得
watch([previewSrc, rows, cols, tabDepth, seed, appliedSuggestion], () => {
  // 手动改网格数使建议权重长度失效 → 回退均匀示意（防入档长度不符）
  if (
    appliedSuggestion.value &&
    (appliedSuggestion.value.rowWeights.length !== rows.value ||
      appliedSuggestion.value.colWeights.length !== cols.value)
  ) {
    appliedSuggestion.value = null
  }
  redrawPreview()
})

function redrawPreview(): void {
  const token = ++previewToken
  const src = previewSrc.value
  if (src) {
    const img = new Image()
    img.onload = () => {
      if (token === previewToken) paintPreview(img)
    }
    img.onerror = () => {
      if (token === previewToken) paintPreview(null)
    }
    img.src = src
  } else {
    paintPreview(null)
  }
}

function paintPreview(img: HTMLImageElement | null): void {
  const canvas = previewCanvas.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return // happy-dom 等无 2D 实现时静默跳过（预览非关键路径）
  const S = PREVIEW_SIZE
  ctx.clearRect(0, 0, S, S)
  let rect = { x: 20, y: 20, w: S - 40, h: S - 40 }
  if (img && img.width > 0 && img.height > 0) {
    const k = Math.min(rect.w / img.width, rect.h / img.height)
    const w = img.width * k
    const h = img.height * k
    rect = { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h }
    ctx.drawImage(img, rect.x, rect.y, w, h)
  } else {
    // 无图占位：棋盘格
    const cell = 24
    for (let gy = 0; gy < S / cell; gy++) {
      for (let gx = 0; gx < S / cell; gx++) {
        ctx.fillStyle = (gx + gy) % 2 === 0 ? '#e8eaee' : '#d8dbe2'
        ctx.fillRect(gx * cell, gy * cell, cell, cell)
      }
    }
  }
  // 真实锯齿切割线（引擎同源采样：buildTabSpecs + sampleEdgePoints；seed/tabDepth/rows/cols 全联动所见即所得）
  const imgW = img && img.width > 0 ? img.width : rect.w
  const imgH = img && img.height > 0 ? img.height : rect.h
  const kx = rect.w / imgW
  const ky = rect.h / imgH
  const kMin = Math.min(kx, ky) // 块形等比 → 锯齿偏移取两轴较小缩放，形态不失真
  const rowLines = buildAxisLines(imgH, rows.value)
  const colLines = buildAxisLines(imgW, cols.value)
  // 与 instance.ts buildPieceBitmaps 同式：tabPx = tabDepth × (min 边 / max(rows, cols))
  const tabPx = (tabDepth.value * Math.min(imgW, imgH)) / Math.max(rows.value, cols.value)
  const rng = createRng(seed.value)
  ctx.strokeStyle = 'rgba(58,110,165,0.85)'
  ctx.lineWidth = 1.5
  for (const spec of buildTabSpecs('h', rowLines, colLines, rng, tabDepth.value)) {
    const pts = sampleEdgePoints(spec, imgW, 'before', tabPx)
    ctx.beginPath()
    pts.forEach((p, i) => {
      const x = rect.x + p.along * kx
      const y = rect.y + spec.at * ky + p.offset * kMin
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
  for (const spec of buildTabSpecs('v', colLines, rowLines, rng, tabDepth.value)) {
    const pts = sampleEdgePoints(spec, imgH, 'before', tabPx)
    ctx.beginPath()
    pts.forEach((p, i) => {
      const y = rect.y + p.along * ky
      const x = rect.x + spec.at * kx + p.offset * kMin
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
  ctx.strokeStyle = '#3a6ea5'
  ctx.lineWidth = 2
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
}

/** 同图方案（F-18 判定：重新切块 = 同图新建平行方案） */
function sameSourceScheme(): JigsawSchemeData | undefined {
  const source = currentSource()
  return props.schemes.find((sc) => {
    if (sc.source.kind !== source.kind) return false
    if (source.kind === 'builtin') {
      return sc.source.kind === 'builtin' && sc.source.imageId === source.imageId
    }
    return sc.source.kind === 'custom' && sc.source.assetId === source.assetId
  })
}

function saveScheme(): void {
  const err = validateForm()
  if (err) {
    formError.value = err
    saveConfirm.value = false
    return
  }
  formError.value = ''
  // F-18：同图已有方案在玩（专题轨有该方案成绩）→ 二次确认后才新建（历史方案与成绩不受影响）；
  // 编辑本就是在玩方案，不适用此门（调整不改 id/进度）
  const existing = sameSourceScheme()
  const inPlay =
    existing !== undefined &&
    getLevelRecord(progressSlotKey('jigsaw', topicOfSource(existing.source)), existing.id) !== undefined
  if (isNew && inPlay && !saveConfirm.value) {
    saveConfirm.value = true
    if (saveConfirmTimer) clearTimeout(saveConfirmTimer)
    saveConfirmTimer = setTimeout(() => (saveConfirm.value = false), 3000)
    return
  }
  saveConfirm.value = false
  if (saveConfirmTimer) {
    clearTimeout(saveConfirmTimer)
    saveConfirmTimer = null
  }
  // AI 建议权重随方案入档（长度与表单一致才带，防手动改网格后失效）
  const suggestion =
    appliedSuggestion.value &&
    appliedSuggestion.value.rowWeights.length === rows.value &&
    appliedSuggestion.value.colWeights.length === cols.value
      ? {
          rowWeights: [...appliedSuggestion.value.rowWeights],
          colWeights: [...appliedSuggestion.value.colWeights],
        }
      : undefined
  // 空名兜底 key 化（M6.6：英文界面不再出现中文默认名；纯层 createScheme 内部兜底仅作防御）
  const finalName = name.value.trim() || t('schemes.defaultName', { n: props.schemes.length + 1 })
  const savedMode: JigsawSchemeMode =
    suggestion && mode.value === 'ai' ? 'ai' : autoDerived.value ? 'auto' : 'custom'
  const params = {
    rows: rows.value,
    cols: cols.value,
    tabDepth: tabDepth.value,
    uniquenessThreshold: DEFAULT_UNIQUENESS_THRESHOLD,
    seed: seed.value,
    ...(suggestion ? { suggestion } : {}),
  }
  if (s) {
    updateScheme(s.id, { name: finalName, source: currentSource(), params, mode: savedMode })
  } else {
    createScheme(finalName, currentSource(), params, savedMode)
  }
  emit('saved') // 父层关面板 + refresh（实例卸载触发 onBeforeUnmount 清理）
}

// ---- 图源取图（AI 建议与自动最优共用同一口径） ----
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader 失败'))
    reader.readAsDataURL(blob)
  })
}

async function currentDataUrl(): Promise<string> {
  if (sourceKind.value === 'builtin') {
    const dataUrl = THUMBS[imageId.value] ?? ''
    if (!dataUrl) throw new Error('jigsaw: 无可用图源')
    return dataUrl
  }
  const blob = await getEnvAdapter().assetRepo.loadImage({ id: customAssetId.value })
  const dataUrl = await blobToDataUrl(blob)
  if (!dataUrl) throw new Error('jigsaw: 无可用图源')
  return dataUrl
}

async function currentAnalysis(): Promise<{ dataUrl: string; image: ImageDataLike }> {
  const dataUrl = await currentDataUrl()
  const img = await loadSourceImage(dataUrl)
  return { dataUrl, image: downscaleToAnalysis(img) }
}

async function onAiSuggest(): Promise<void> {
  if (suggesting.value) return
  suggesting.value = true
  aiFeedback.value = ''
  try {
    const { dataUrl, image: analysis } = await currentAnalysis()
    const outcome = await suggestCutPlan(
      analysis,
      { rows: rows.value, cols: cols.value, tabDepth: tabDepth.value, uniquenessThreshold: DEFAULT_UNIQUENESS_THRESHOLD },
      seed.value,
      dataUrl,
      getSettings().ai,
    )
    if (outcome.kind === 'applied') {
      if (mode.value !== 'ai') return // 在途切换模式：丢弃过期建议（防 AI 权重写入其它模式表单）
      rows.value = outcome.suggestion.rows
      cols.value = outcome.suggestion.cols
      appliedSuggestion.value = outcome.suggestion
      aiFeedback.value = t('schemes.aiApplied', { rows: rows.value, cols: cols.value })
      return
    }
  } catch {
    // 意外异常同降级链（§14.4 非阻断：本地算法永远可用）
  } finally {
    suggesting.value = false
  }
  if (mode.value !== 'ai') return // 已离开 ai 模式：降级回填不再劫持其它模式表单
  // 未配置/超时/被拒 → 自动执行自动最优回填 + 降级提示（三分类降级链）
  await runAutoSpec()
  aiFeedback.value = t('schemes.aiDegradedAuto', { rows: rows.value, cols: cols.value })
}

// ---- 自动最优（模式 auto：难度档 → 复杂度窗口，按图内容选规格；失败回落难度占位网格）----
// 无按钮：进 auto 模式 / 换难度 / 换图时由 watch 触发；仅回填表单，用户仍可保存。
// latest-wins：在途时新触发不丢弃，旧触发的结果按令牌整体作废（难度快切不残留旧规格）。
async function runAutoSpec(): Promise<void> {
  const token = ++autoToken
  autoRunning.value = true
  autoFeedback.value = ''
  try {
    const { image } = await currentAnalysis()
    if (token !== autoToken) return
    const best = pickBestSpec(image, DIFFICULTY_COMPLEXITY[difficulty.value])
    rows.value = best.spec.rows
    cols.value = best.spec.cols
    tabDepth.value = Math.round((0.1 + Math.random() * 0.1) * 100) / 100 // 0.10-0.20 推荐带（与滑杆步长对齐）
    saveConfirm.value = false
    autoDerived.value = true
    autoFeedback.value = t('schemes.autoBestDone', { rows: best.spec.rows, cols: best.spec.cols })
  } catch {
    if (token !== autoToken) return
    const fb = DIFFICULTY_FALLBACK[difficulty.value]
    rows.value = fb.rows
    cols.value = fb.cols
    autoDerived.value = true // 占位网格也是自动推导产物（降级但仍属 auto 语义）
    autoFeedback.value = t('schemes.autoBestFail')
  } finally {
    if (token === autoToken) autoRunning.value = false
  }
}

onBeforeUnmount(() => {
  if (customPreviewUrl.value) URL.revokeObjectURL(customPreviewUrl.value)
  if (saveConfirmTimer) clearTimeout(saveConfirmTimer)
})
</script>

<template>
  <section ref="rootEl" class="sm-editor" data-role="scheme-editor">
    <h3>{{ isNew ? t('schemes.newScheme') : t('schemes.editScheme') }}</h3>

    <label class="sm-field">
      <span>{{ t('schemes.name') }}</span>
      <input v-model="name" type="text" :placeholder="t('schemes.namePlaceholder')" data-field="name" />
    </label>

    <div class="sm-field">
      <span>{{ t('schemes.mode') }}</span>
      <div class="sm-seg">
        <button
          type="button"
          :class="{ 'is-on': mode === 'custom' }"
          data-role="mode-custom"
          @click="mode = 'custom'"
        >
          {{ t('schemes.modeCustom') }}
        </button>
        <button
          type="button"
          :class="{ 'is-on': mode === 'auto' }"
          data-role="mode-auto"
          @click="mode = 'auto'"
        >
          {{ t('schemes.modeAuto') }}
        </button>
        <button
          type="button"
          :class="{ 'is-on': mode === 'ai' }"
          data-role="mode-ai"
          @click="mode = 'ai'"
        >
          {{ t('schemes.modeAi') }}
        </button>
      </div>
    </div>

    <div class="sm-field">
      <span>{{ t('schemes.source') }}</span>
      <div class="sm-seg">
        <button
          type="button"
          :class="{ 'is-on': sourceKind === 'builtin' }"
          data-role="source-builtin"
          @click="sourceKind = 'builtin'"
        >
          {{ t('schemes.sourceBuiltin') }}
        </button>
        <button
          type="button"
          :class="{ 'is-on': sourceKind === 'custom' }"
          data-role="source-custom"
          @click="sourceKind = 'custom'"
        >
          {{ t('schemes.sourceCustom') }}
        </button>
      </div>
    </div>

    <div v-if="sourceKind === 'builtin'" class="sm-field">
      <span>{{ t('schemes.pickImage') }}</span>
      <select v-model="imageId" data-field="imageId">
        <optgroup v-for="group in topicGroups" :key="group.labelKey" :label="t(group.labelKey)">
          <option v-for="entry in group.entries" :key="entry.id" :value="entry.id">
            {{ entry.id }}
          </option>
        </optgroup>
      </select>
    </div>

    <div v-else class="sm-field">
      <span>{{ t('schemes.upload') }}</span>
      <label class="primary-btn sm-file-label">
        {{ uploading ? t('schemes.uploading') : t('schemes.upload') }}
        <input type="file" accept="image/*" data-field="upload" @change="onUpload" />
      </label>
      <span v-if="customName" class="sm-upload-ok" data-role="upload-ok">
        {{ t('schemes.uploadOk') }}：{{ customName }}
      </span>
      <span v-if="uploadError" class="sm-error" data-role="upload-error">{{ uploadError }}</span>
    </div>

    <div v-if="mode === 'custom'" class="sm-params">
      <label class="sm-field">
        <span>{{ t('schemes.rows') }}</span>
        <input v-model.number="rows" type="number" min="2" max="12" data-field="rows" />
      </label>
      <label class="sm-field">
        <span>{{ t('schemes.cols') }}</span>
        <input v-model.number="cols" type="number" min="2" max="12" data-field="cols" />
      </label>
      <label class="sm-field sm-field-wide">
        <span>{{ t('schemes.tabDepth') }}（{{ tabDepth.toFixed(2) }}）</span>
        <input v-model.number="tabDepth" type="range" min="0.08" max="0.25" step="0.01" data-field="tabDepth" />
      </label>
    </div>

    <div v-else-if="mode === 'auto'" class="sm-field">
      <span>{{ t('schemes.difficulty') }}</span>
      <div class="sm-seg">
        <button
          type="button"
          :class="{ 'is-on': difficulty === 'easy' }"
          data-role="difficulty-easy"
          @click="difficulty = 'easy'"
        >
          {{ t('schemes.difficultyEasy') }}
        </button>
        <button
          type="button"
          :class="{ 'is-on': difficulty === 'medium' }"
          data-role="difficulty-medium"
          @click="difficulty = 'medium'"
        >
          {{ t('schemes.difficultyMedium') }}
        </button>
        <button
          type="button"
          :class="{ 'is-on': difficulty === 'hard' }"
          data-role="difficulty-hard"
          @click="difficulty = 'hard'"
        >
          {{ t('schemes.difficultyHard') }}
        </button>
      </div>
      <span v-if="autoFeedback" class="sm-ai-feedback" data-role="auto-feedback">{{ autoFeedback }}</span>
    </div>

    <div v-else class="sm-suggest-row">
      <button
        type="button"
        class="secondary-btn"
        :disabled="suggesting || (sourceKind === 'custom' && !customAssetId)"
        data-role="ai-suggest"
        @click="onAiSuggest"
      >
        {{ suggesting ? t('schemes.aiThinking') : t('schemes.modeAi') }}
      </button>
      <span v-if="aiFeedback" class="sm-ai-feedback" data-role="ai-feedback">{{ aiFeedback }}</span>
    </div>

    <div class="sm-preview">
      <span>{{ t('schemes.preview') }}</span>
      <canvas
        ref="previewCanvas"
        class="sm-canvas"
        :width="PREVIEW_SIZE"
        :height="PREVIEW_SIZE"
        data-role="scheme-preview"
      ></canvas>
    </div>

    <p v-if="formError" class="sm-error" data-role="scheme-error">{{ formError }}</p>

    <div class="sm-editor-actions">
      <button
        class="primary-btn"
        :data-role="saveConfirm ? 'save-confirm' : 'save-scheme'"
        :data-confirm="saveConfirm ? 'yes' : 'no'"
        @click="saveScheme"
      >
        {{ saveConfirm ? t('schemes.recutConfirm') : t('schemes.save') }}
      </button>
      <button class="secondary-btn" data-role="cancel-scheme" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.sm-editor {
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 560px;
}
.sm-editor h3 {
  margin: 0;
}
.sm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}
.sm-field > span {
  color: var(--color-text-secondary);
}
.sm-field input[type='text'],
.sm-field input[type='number'],
.sm-field select {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-bg, #fff);
  font-size: 14px;
}
.sm-field input[type='range'] {
  width: 100%;
}
.sm-field-wide {
  flex: 1;
  min-width: 200px;
}
.sm-seg {
  display: inline-flex;
  gap: 0;
}
.sm-seg button {
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  font-size: 14px;
}
.sm-seg button:first-child {
  border-radius: var(--radius-sm, 4px) 0 0 var(--radius-sm, 4px);
}
.sm-seg button:last-child {
  border-radius: 0 var(--radius-sm, 4px) var(--radius-sm, 4px) 0;
  border-left: none;
}
.sm-seg button.is-on {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.sm-params {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
}
.sm-params .sm-field {
  flex: 1;
  min-width: 120px;
}
.sm-file-label {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  align-self: flex-start;
}
.sm-file-label input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.sm-upload-ok {
  font-size: 13px;
  color: var(--color-text-secondary);
}
.sm-error {
  margin: 0;
  color: #c0392b;
  font-size: 13px;
}
.sm-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-secondary);
}
.sm-suggest-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.sm-ai-feedback {
  font-size: 13px;
  color: var(--color-text-secondary);
}
.sm-canvas {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-surface);
}
.sm-editor-actions {
  display: flex;
  gap: 12px;
}
</style>
