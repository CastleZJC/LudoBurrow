<script setup lang="ts">
// 拼图方案管理页（开发计划 3.6 预切块工作流 / 3.7 版本与进度隔离 / 3.11 素材上传闭环）
// 方案 = 一套切块规格 + 独立存档槽：新建即隔离、删除互不影响、切换即回滚续玩（F-17）。
// 重新切块确认（F-18）：同图已有方案在玩时保存需二次确认（新建平行方案，历史进度保留）。

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getEnvAdapter } from '@/services'
import type { JigsawSchemeData, JigsawSchemeSource } from '@/core/save'
import { getSettings } from '@/core/settings'
import { usePlatformStore } from '@/stores/platform'
import { suggestCutPlan } from '@/ai/suggest'
import { weightsToLines, type NormalizedSuggestion } from '@/engines/jigsaw-cutter/suggest'
import {
  activateScheme,
  activeScheme,
  createScheme,
  deactivateSchemes,
  deleteScheme,
  getSchemeUnlockedCount,
  listSchemes,
  SCHEME_TOTAL_LEVELS,
} from '@/games/jigsaw/schemes'
import { GALLERY, GALLERY_TOPICS, downscaleToAnalysis, loadSourceImage } from '@/games/jigsaw/gallery'
import { THUMBS } from '@/games/jigsaw/thumbs'

const { t } = useI18n()
const platform = usePlatformStore()

// ---- 方案列表（操作后刷新的响应式镜像） ----
const schemes = ref<JigsawSchemeData[]>([])
const activeId = ref<string | null>(null)

function refresh(): void {
  schemes.value = listSchemes()
  activeId.value = activeScheme()?.id ?? null
}

refresh()

// ---- 新建面板状态 ----
const panelOpen = ref(false)
const name = ref('')
const sourceKind = ref<'builtin' | 'custom'>('builtin')
const imageId = ref(GALLERY[0]!.id)
const customAssetId = ref('')
const customName = ref('')
const customPreviewUrl = ref('')
const rows = ref(4)
const cols = ref(4)
const tabDepth = ref(0.16)
const threshold = ref(18)
const seed = ref(Math.floor(Math.random() * 0x1_0000_0000))
const uploading = ref(false)
const uploadError = ref('')
const formError = ref('')
/** F-18：保存二次确认态（3 秒未确认自动复原） */
const saveConfirm = ref(false)
let saveConfirmTimer: ReturnType<typeof setTimeout> | null = null
// ---- AI 建议状态（M5.5：applied 后暂存权重，保存时随方案入档）----
const suggesting = ref(false)
const aiFeedback = ref('')
const appliedSuggestion = ref<NormalizedSuggestion | null>(null)

const PREVIEW_SIZE = 240

const previewSrc = computed(() =>
  sourceKind.value === 'builtin' ? (THUMBS[imageId.value] ?? '') : customPreviewUrl.value,
)

const topicGroups = GALLERY_TOPICS.map((topic) => ({
  labelKey: topic.labelKey,
  entries: GALLERY.filter((e) => e.topic === topic.id),
}))

function openPanel(): void {
  panelOpen.value = true
  formError.value = ''
  saveConfirm.value = false
  aiFeedback.value = ''
  appliedSuggestion.value = null
}

function closePanel(): void {
  panelOpen.value = false
  formError.value = ''
  saveConfirm.value = false
  aiFeedback.value = ''
  appliedSuggestion.value = null
  if (saveConfirmTimer) {
    clearTimeout(saveConfirmTimer)
    saveConfirmTimer = null
  }
}

function rerollSeed(): void {
  seed.value = Math.floor(Math.random() * 0x1_0000_0000)
  saveConfirm.value = false
}

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
  if (!Number.isInteger(threshold.value) || threshold.value < 0 || threshold.value > 100) return t('schemes.invalidParams')
  if (!Number.isInteger(seed.value) || seed.value < 0 || seed.value > 0xffffffff) return t('schemes.invalidParams')
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

// ---- 实时预览：底图（缩略 data URI / 上传 objectURL）+ 网格线 + 锯齿深度示意 ----
const previewCanvas = ref<HTMLCanvasElement | null>(null)
let previewToken = 0

watch([previewSrc, rows, cols, tabDepth, panelOpen, appliedSuggestion], () => {
  // 手动改网格数使建议权重长度失效 → 回退均匀示意（防入档长度不符）
  if (
    appliedSuggestion.value &&
    (appliedSuggestion.value.rowWeights.length !== rows.value ||
      appliedSuggestion.value.colWeights.length !== cols.value)
  ) {
    appliedSuggestion.value = null
  }
  if (panelOpen.value) redrawPreview()
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

/** 线位置：有建议权重按累计等分（非均匀），否则均匀等分 */
function linePositions(weights: number[] | undefined, count: number, size: number): number[] {
  return weights
    ? weightsToLines(weights, size)
    : Array.from({ length: count + 1 }, (_, i) => (i * size) / count)
}

function segsOf(lines: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < lines.length; i += 1) out.push(lines[i]! - lines[i - 1]!)
  return out
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
    // 无图占位：棋盘格（M3.9 缩略表就绪前内置图暂无预览底图）
    const cell = 24
    for (let gy = 0; gy < S / cell; gy++) {
      for (let gx = 0; gx < S / cell; gx++) {
        ctx.fillStyle = (gx + gy) % 2 === 0 ? '#e8eaee' : '#d8dbe2'
        ctx.fillRect(gx * cell, gy * cell, cell, cell)
      }
    }
  }
  // 切割线示意（无建议 = 均匀直线；applied 后按建议权重累计等分；真实引擎保证同口径）
  ctx.strokeStyle = 'rgba(58,110,165,0.85)'
  ctx.lineWidth = 1.5
  const rowLines = linePositions(appliedSuggestion.value?.rowWeights, rows.value, rect.h)
  const colLines = linePositions(appliedSuggestion.value?.colWeights, cols.value, rect.w)
  const minSeg = Math.min(...segsOf(rowLines), ...segsOf(colLines))
  const tabR = Math.min((tabDepth.value * minSeg) / 2, 10)
  for (let i = 1; i < rows.value; i++) {
    const y = rect.y + rowLines[i]!
    ctx.beginPath()
    ctx.moveTo(rect.x, y)
    ctx.lineTo(rect.x + rect.w, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(rect.x + rect.w / 2, y, tabR, Math.PI, 0, i % 2 === 0)
    ctx.stroke()
  }
  for (let j = 1; j < cols.value; j++) {
    const x = rect.x + colLines[j]!
    ctx.beginPath()
    ctx.moveTo(x, rect.y)
    ctx.lineTo(x, rect.y + rect.h)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, rect.y + rect.h / 2, tabR, Math.PI / 2, -Math.PI / 2, j % 2 === 0)
    ctx.stroke()
  }
  ctx.strokeStyle = '#3a6ea5'
  ctx.lineWidth = 2
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
}

// ---- 方案操作 ----
function sourceLabel(scheme: JigsawSchemeData): string {
  return scheme.source.kind === 'builtin' ? scheme.source.imageId : t('schemes.customImage')
}

function unlockedOf(scheme: JigsawSchemeData): number {
  return getSchemeUnlockedCount(scheme.id)
}

function playScheme(scheme: JigsawSchemeData): void {
  activateScheme(scheme.id)
  refresh()
  platform.openGameSelect('jigsaw')
}

function backToBuiltin(): void {
  deactivateSchemes()
  refresh()
}

// 删除二次确认（首次点按弹确认态，3 秒未确认自动复原；有进度的方案同样保留该确认门槛）
const confirmDeleteId = ref<string | null>(null)
let confirmDeleteTimer: ReturnType<typeof setTimeout> | null = null

function askDelete(schemeId: string): void {
  if (confirmDeleteId.value !== schemeId) {
    confirmDeleteId.value = schemeId
    if (confirmDeleteTimer) clearTimeout(confirmDeleteTimer)
    confirmDeleteTimer = setTimeout(() => (confirmDeleteId.value = null), 3000)
    return
  }
  deleteScheme(schemeId)
  confirmDeleteId.value = null
  if (confirmDeleteTimer) {
    clearTimeout(confirmDeleteTimer)
    confirmDeleteTimer = null
  }
  refresh()
}

/** 同图方案（F-18 判定：重新切块 = 同图新建平行方案） */
function sameSourceScheme(): JigsawSchemeData | undefined {
  const source = currentSource()
  return schemes.value.find((s) => {
    if (s.source.kind !== source.kind) return false
    if (source.kind === 'builtin') {
      return s.source.kind === 'builtin' && s.source.imageId === source.imageId
    }
    return s.source.kind === 'custom' && s.source.assetId === source.assetId
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
  // F-18：同图已有方案在玩 → 二次确认后才新建（历史方案与进度不受影响）
  const existing = sameSourceScheme()
  if (existing && existing.progress.unlockedCount > 1 && !saveConfirm.value) {
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
  const finalName = name.value.trim() || t('schemes.defaultName', { n: listSchemes().length + 1 })
  createScheme(finalName, currentSource(), {
    rows: rows.value,
    cols: cols.value,
    tabDepth: tabDepth.value,
    uniquenessThreshold: threshold.value,
    seed: seed.value,
    ...(suggestion ? { suggestion } : {}),
  })
  closePanel()
  refresh()
}

// ---- AI 切块建议（M5.5 / §14：降级链非阻断，表单参数不受损）----
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader 失败'))
    reader.readAsDataURL(blob)
  })
}

async function onAiSuggest(): Promise<void> {
  if (suggesting.value) return
  suggesting.value = true
  aiFeedback.value = ''
  try {
    // 图源：内置缩略 data URI 直用；自定义素材经仓库取 blob 转 dataUrl
    let dataUrl: string
    if (sourceKind.value === 'builtin') {
      dataUrl = THUMBS[imageId.value] ?? ''
    } else {
      const blob = await getEnvAdapter().assetRepo.loadImage({ id: customAssetId.value })
      dataUrl = await blobToDataUrl(blob)
    }
    if (!dataUrl) throw new Error('AI 建议：无可用图源')
    const img = await loadSourceImage(dataUrl)
    const analysis = downscaleToAnalysis(img)
    const outcome = await suggestCutPlan(
      analysis,
      { rows: rows.value, cols: cols.value, tabDepth: tabDepth.value, uniquenessThreshold: threshold.value },
      seed.value,
      dataUrl,
      getSettings().ai,
    )
    if (outcome.kind === 'applied') {
      rows.value = outcome.suggestion.rows
      cols.value = outcome.suggestion.cols
      appliedSuggestion.value = outcome.suggestion
      aiFeedback.value = t('schemes.aiApplied', { rows: rows.value, cols: cols.value })
    } else if (outcome.kind === 'rejected') {
      aiFeedback.value =
        outcome.reason === 'low-quality' ? t('schemes.aiRejectedQuality') : t('schemes.aiRejectedInvalid')
    } else {
      aiFeedback.value =
        outcome.reason === 'not-configured' ? t('schemes.aiNotConfigured') : t('schemes.aiFallback')
    }
  } catch {
    // 意外异常同样非阻断：本地算法永远可用（§14.4）
    aiFeedback.value = t('schemes.aiFallback')
  } finally {
    suggesting.value = false
  }
}

onBeforeUnmount(() => {
  if (customPreviewUrl.value) URL.revokeObjectURL(customPreviewUrl.value)
  if (saveConfirmTimer) clearTimeout(saveConfirmTimer)
  if (confirmDeleteTimer) clearTimeout(confirmDeleteTimer)
})
</script>

<template>
  <div class="scheme-manager" data-view="schemes">
    <header class="sm-header">
      <button class="secondary-btn" data-nav="back" @click="platform.exitToSelect()">
        {{ t('common.back') }}
      </button>
      <h2 class="sm-title">{{ t('schemes.title') }}</h2>
      <button v-if="!panelOpen" class="primary-btn" data-role="new-scheme" @click="openPanel">
        {{ t('schemes.newScheme') }}
      </button>
    </header>

    <section class="sm-list">
      <div class="builtin-row" :class="{ 'is-active': activeId === null }" data-role="builtin-track">
        <span class="builtin-name">{{ t('schemes.builtinTrack') }}</span>
        <span v-if="activeId === null" class="sm-badge">{{ t('schemes.activeBadge') }}</span>
        <button v-else class="secondary-btn" data-role="use-builtin" @click="backToBuiltin">
          {{ t('schemes.useBuiltin') }}
        </button>
      </div>

      <p v-if="schemes.length === 0" class="sm-empty">{{ t('schemes.empty') }}</p>

      <div
        v-for="s in schemes"
        :key="s.id"
        class="sm-card"
        :class="{ 'is-active': activeId === s.id }"
        :data-scheme="s.id"
      >
        <div class="sm-card-main">
          <span class="sm-name">{{ s.name }}</span>
          <span v-if="activeId === s.id" class="sm-badge">{{ t('schemes.activeBadge') }}</span>
        </div>
        <p class="sm-meta">
          {{ sourceLabel(s) }} · {{ s.params.rows }}×{{ s.params.cols }} ·
          {{ t('schemes.progress', { done: unlockedOf(s), total: SCHEME_TOTAL_LEVELS }) }}
        </p>
        <div class="sm-actions">
          <button class="secondary-btn" data-role="play-scheme" @click="playScheme(s)">
            {{ t('schemes.play') }}
          </button>
          <button
            class="secondary-btn sm-danger"
            :data-role="confirmDeleteId === s.id ? 'delete-confirm' : 'delete-scheme'"
            @click="askDelete(s.id)"
          >
            {{ confirmDeleteId === s.id ? t('schemes.deleteConfirm') : t('schemes.delete') }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="panelOpen" class="sm-editor" data-role="scheme-editor">
      <h3>{{ t('schemes.newScheme') }}</h3>

      <label class="sm-field">
        <span>{{ t('schemes.name') }}</span>
        <input v-model="name" type="text" :placeholder="t('schemes.namePlaceholder')" data-field="name" />
      </label>

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

      <div class="sm-params">
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
        <label class="sm-field">
          <span>{{ t('schemes.threshold') }}</span>
          <input v-model.number="threshold" type="number" min="0" max="100" data-field="threshold" />
        </label>
        <label class="sm-field">
          <span>{{ t('schemes.seed') }}</span>
          <input v-model.number="seed" type="number" min="0" data-field="seed" />
        </label>
        <button type="button" class="secondary-btn" data-role="reroll" @click="rerollSeed">
          {{ t('schemes.reroll') }}
        </button>
      </div>

      <div class="sm-ai-row">
        <button
          type="button"
          class="secondary-btn"
          :disabled="suggesting || (sourceKind === 'custom' && !customAssetId)"
          data-role="ai-suggest"
          @click="onAiSuggest"
        >
          {{ suggesting ? t('schemes.aiThinking') : t('schemes.aiSuggest') }}
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
        <button class="secondary-btn" data-role="cancel-scheme" @click="closePanel">
          {{ t('common.cancel') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.scheme-manager {
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sm-header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.sm-title {
  margin: 0;
  font-size: 24px;
  flex: 1;
}
.sm-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 720px;
}
.builtin-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.builtin-row.is-active {
  border-color: var(--color-primary);
}
.builtin-name {
  font-weight: 600;
}
.sm-card {
  padding: 12px 16px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sm-card.is-active {
  border-color: var(--color-primary);
}
.sm-card-main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sm-name {
  font-weight: 600;
}
.sm-badge {
  font-size: 12px;
  color: var(--color-accent);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm, 4px);
  padding: 1px 8px;
}
.sm-meta {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}
.sm-actions {
  display: flex;
  gap: 10px;
}
.sm-danger:hover {
  border-color: #c0392b;
  color: #c0392b;
}
.sm-empty {
  color: var(--color-text-secondary);
  margin: 0;
}
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
.sm-ai-row {
  display: flex;
  align-items: center;
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
