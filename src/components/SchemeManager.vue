<script setup lang="ts">
// 拼图方案管理页（验收返工「方案 = 关卡」模型；2026-09-12 就近编辑布局）
// 方案 = 专题轨内一个关卡：新建即在该专题末尾追加关卡（无需激活）；删除即收敛关卡数。
// 编辑器抽为 SchemeEditor 子组件（就近内联）：新建 = 列表顶部；编辑 = 被编辑卡片正下方。
// 重新切块确认（F-18）在子组件内部处理：同图已有方案在玩时保存需二次确认。

import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getEnvAdapter } from '@/services'
import type { JigsawSchemeData } from '@/core/save'
import { usePlatformStore } from '@/stores/platform'
import { createScheme, deleteScheme, listSchemes } from '@/games/jigsaw/schemes'
import { pickBestSpec } from '@/games/jigsaw/optimize'
import { levelSeed } from '@/engines/rng'
import { downscaleToAnalysis, loadSourceImage, type ComplexityLevel } from '@/games/jigsaw/gallery'
import SchemeEditor from '@/components/SchemeEditor.vue'

const { t } = useI18n()
const platform = usePlatformStore()

// ---- 方案列表（操作后刷新的响应式镜像） ----
const schemes = ref<JigsawSchemeData[]>([])

function refresh(): void {
  schemes.value = listSchemes()
}

refresh()

// ---- 编辑器开合（表单状态在 SchemeEditor 实例内；每次打开 = 新实例，无手工重置） ----
const panelOpen = ref(false)
/** 编辑中的方案 id（null = 新建） */
const editingId = ref<string | null>(null)

function openPanel(): void {
  editingId.value = null
  panelOpen.value = true
}

/** 编辑方案：面板预填由子组件 setup 完成（id/进度不变，原位更新） */
function openEditPanel(s: JigsawSchemeData): void {
  editingId.value = s.id
  panelOpen.value = true
}

function closePanel(): void {
  panelOpen.value = false
  editingId.value = null
}

function onEditorSaved(): void {
  closePanel()
  refresh()
}

// ---- 卡片展示 ----
function sourceLabel(scheme: JigsawSchemeData): string {
  return scheme.source.kind === 'builtin' ? scheme.source.imageId : t('schemes.customImage')
}

/** 卡片类型标签（反馈 2：旧档缺省 = 自定义） */
function modeLabel(scheme: JigsawSchemeData): string {
  return t(
    scheme.mode === 'auto' ? 'schemes.modeAuto' : scheme.mode === 'ai' ? 'schemes.modeAi' : 'schemes.modeCustom',
  )
}

// 删除二次确认（首次点按弹确认态，3 秒未确认自动复原；有成绩的方案同样保留该确认门槛）
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

// ---- 批量导入（本地图片 → 解析像素 → 按最优切块直接建档为可玩方案）----
// 每张：入素材仓库 → 真实像素分析 → pickBestSpec（难度档随导入序轮转 1/2/3）
// → 建方案（确定性 seed）；单张失败跳过不阻断整批；建完即出现在 custom 专题可开玩。
const batchImporting = ref(false)
const batchFeedback = ref('')
const batchInput = ref<HTMLInputElement | null>(null)

function triggerBatchImport(): void {
  if (batchImporting.value) return
  batchInput.value?.click()
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader 失败'))
    reader.readAsDataURL(blob)
  })
}

async function onBatchImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = '' // 清空选择，允许重复导入同一批文件
  if (files.length === 0) return
  batchImporting.value = true
  batchFeedback.value = t('schemes.batchBusy')
  const adapter = getEnvAdapter()
  let ok = 0
  let failed = 0
  let idx = 0
  for (const file of files) {
    const level = ((idx % 3) + 1) as ComplexityLevel // 轮转难度档（成败都推进，序号即多样性来源）
    idx += 1
    try {
      const ref = await adapter.assetRepo.saveImage(file, {
        name: file.name,
        size: file.size,
        type: file.type,
        addedAt: Date.now(),
      })
      const blob = await adapter.assetRepo.loadImage({ id: ref.id })
      const img = await loadSourceImage(await blobToDataUrl(blob))
      const best = pickBestSpec(downscaleToAnalysis(img), level)
      createScheme(
        file.name.replace(/\.[^.]+$/, '') || file.name,
        { kind: 'custom', assetId: ref.id },
        {
          rows: best.spec.rows,
          cols: best.spec.cols,
          tabDepth: 0.16,
          uniquenessThreshold: 18,
          seed: levelSeed(`auto:${ref.id}`, 1),
        },
        'auto',
      )
      ok += 1
    } catch {
      failed += 1
    }
  }
  batchImporting.value = false
  batchFeedback.value =
    failed === 0 ? t('schemes.batchDone', { n: ok }) : t('schemes.batchPartial', { ok, failed })
  refresh()
}

// 选关页空态「导入本地图片」直达：进入即自动开文件选择器（标志一次性，自清零）
onMounted(() => {
  if (platform.schemesAutoBatch) {
    platform.schemesAutoBatch = false
    triggerBatchImport()
  }
})

onBeforeUnmount(() => {
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
      <div v-if="!panelOpen" class="sm-header-actions">
        <button class="primary-btn" data-role="batch-import" :disabled="batchImporting" @click="triggerBatchImport">
          {{ batchImporting ? t('schemes.batchBusy') : t('schemes.batchImport') }}
        </button>
        <button class="primary-btn" data-role="new-scheme" @click="openPanel">
          {{ t('schemes.newScheme') }}
        </button>
        <input
          ref="batchInput"
          type="file"
          accept="image/*"
          multiple
          hidden
          data-role="batch-input"
          @change="onBatchImport"
        />
      </div>
    </header>

    <p v-if="batchFeedback" class="sm-batch-feedback" data-role="batch-feedback">{{ batchFeedback }}</p>

    <section class="sm-list">
      <!-- 新建：编辑器 = 列表第一个元素（最顶） -->
      <SchemeEditor
        v-if="panelOpen && !editingId"
        key="new"
        :scheme="null"
        :schemes="schemes"
        @saved="onEditorSaved"
        @cancel="closePanel"
      />
      <p v-if="schemes.length === 0" class="sm-empty">{{ t('schemes.empty') }}</p>
      <template v-for="s in schemes" :key="s.id">
        <div class="sm-card" :data-scheme="s.id">
          <div class="sm-card-main">
            <span class="sm-name">{{ s.name }}</span>
          </div>
          <p class="sm-meta">
            {{ sourceLabel(s) }} · {{ s.params.rows }}×{{ s.params.cols }} · {{ modeLabel(s) }}
          </p>
          <div class="sm-actions">
            <button
              class="secondary-btn"
              data-role="edit-scheme"
              @click="openEditPanel(s)"
            >
              {{ t('schemes.edit') }}
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
        <!-- 编辑：编辑器 = 被编辑卡片正下方（key=方案 id，换目标即重挂载重新预填） -->
        <SchemeEditor
          v-if="panelOpen && editingId === s.id"
          :key="s.id"
          :scheme="s"
          :schemes="schemes"
          @saved="onEditorSaved"
          @cancel="closePanel"
        />
      </template>
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
.sm-header-actions {
  display: flex;
  gap: 10px;
}
.sm-batch-feedback {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
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
.sm-card {
  padding: 12px 16px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sm-card-main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sm-name {
  font-weight: 600;
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
</style>
