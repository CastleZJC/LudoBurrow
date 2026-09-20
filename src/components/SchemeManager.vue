<script setup lang="ts">
// 拼图方案管理页（验收返工「方案 = 关卡」模型；2026-09-12 就近编辑布局）
// 方案 = 专题轨内一个关卡：新建即在该专题末尾追加关卡（无需激活）；删除即收敛关卡数。
// 编辑器抽为 SchemeEditor 子组件（就近内联）：新建 = 列表顶部；编辑 = 被编辑卡片正下方。
// 重新切块确认（F-18）在子组件内部处理：同图已有方案在玩时保存需二次确认。

import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getEnvAdapter } from '@/services'
import type { JigsawSchemeData } from '@/core/save'
import { usePlatformStore } from '@/stores/platform'
import { createScheme, deleteScheme, listSchemes } from '@/games/jigsaw/schemes'
import { pickBestSpec } from '@/games/jigsaw/optimize'
import { levelSeed } from '@/engines/rng'
import { downscaleToAnalysis, loadSourceImage, type ComplexityLevel } from '@/games/jigsaw/gallery'
import { blobToDataUrl, persistImageFile } from '@/games/jigsaw/assets'
import PageHeader from '@/components/PageHeader.vue'
import FilePickButton from '@/components/FilePickButton.vue'
import ConfirmButton from '@/components/ConfirmButton.vue'
import FeedbackLine from '@/components/FeedbackLine.vue'
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

// 删除二次确认（ConfirmButton 首击武装/3 秒未确认自动复原/二击执行；正在编辑的方案被删时同步关面板）
function onDeleteConfirm(schemeId: string): void {
  deleteScheme(schemeId)
  if (editingId.value === schemeId) closePanel()
  refresh()
}

// ---- 批量导入（本地图片 → 解析像素 → 按最优切块直接建档为可玩方案）----
// 每张：入素材仓库 → 真实像素分析 → pickBestSpec（难度档随导入序轮转 1/2/3）
// → 建方案（确定性 seed）；单张失败跳过不阻断整批；建完即出现在 custom 专题可开玩。
const batchImporting = ref(false)
const batchFeedback = ref('')
const batchPicker = ref<InstanceType<typeof FilePickButton> | null>(null)

async function onBatchFiles(files: File[]): Promise<void> {
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
      const ref = await persistImageFile(file)
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
    batchPicker.value?.open()
  }
})
</script>

<template>
  <div class="scheme-manager" data-view="schemes">
    <PageHeader :title="t('schemes.title')" @back="platform.exitToSelect()">
      <template v-if="!panelOpen" #actions>
        <FilePickButton
          ref="batchPicker"
          variant="primary"
          accept="image/*"
          multiple
          data-role="batch-input"
          :disabled="batchImporting"
          @files="onBatchFiles"
        >
          {{ batchImporting ? t('schemes.batchBusy') : t('schemes.batchImport') }}
        </FilePickButton>
        <button class="primary-btn" data-role="new-scheme" @click="openPanel">
          {{ t('schemes.newScheme') }}
        </button>
      </template>
    </PageHeader>

    <FeedbackLine v-if="batchFeedback" data-role="batch-feedback">{{ batchFeedback }}</FeedbackLine>

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
            <ConfirmButton
              :label="t('schemes.delete')"
              :confirm-label="t('schemes.deleteConfirm')"
              variant="danger"
              role="delete-scheme"
              confirm-role="delete-confirm"
              @confirm="onDeleteConfirm(s.id)"
            />
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
.sm-empty {
  color: var(--color-text-secondary);
  margin: 0;
}
</style>
