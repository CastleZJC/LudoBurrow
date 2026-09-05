<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlatformStore } from '@/stores/platform'
import { LOCALE_OPTIONS, type SupportedLocale } from '@/i18n'
import { exportJson, importJson } from '@/core/save'
import type { AiConfig } from '@/core/save'
import type { TimeLimitMode } from '@/core/settings'
import { PROVIDER_PRESETS } from '@/ai/provider'

const { t } = useI18n()
const platform = usePlatformStore()

/** 反馈条（导入结果等，一句话 + 下一步动作） */
const feedback = ref('')

const locale = computed<SupportedLocale>(() => platform.settings.locale)
const soundEnabled = computed(() => platform.settings.soundEnabled)
const timeLimitMode = computed<TimeLimitMode>(() => platform.settings.timeLimit.mode)
const limitMinutes = computed(() => Math.round(platform.settings.timeLimit.limitMs / 60_000))
const lockMinutes = computed(() => Math.round(platform.settings.timeLimit.lockMs / 60_000))

function onLocaleChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as SupportedLocale
  platform.changeLocale(value)
}

function onSoundToggle(event: Event): void {
  platform.patchSettings({ soundEnabled: (event.target as HTMLInputElement).checked })
}

function onModeChange(mode: TimeLimitMode): void {
  platform.patchSettings({ timeLimit: { ...platform.settings.timeLimit, mode } })
}

function onLimitMinutes(event: Event): void {
  const minutes = Math.max(1, Math.min(60, Number((event.target as HTMLInputElement).value) || 1))
  platform.patchSettings({ timeLimit: { ...platform.settings.timeLimit, limitMs: minutes * 60_000 } })
}

function onLockMinutes(event: Event): void {
  const minutes = Math.max(1, Math.min(60, Number((event.target as HTMLInputElement).value) || 1))
  platform.patchSettings({ timeLimit: { ...platform.settings.timeLimit, lockMs: minutes * 60_000 } })
}

// ---- AI 切块建议配置（M5.2 / §14.3：密钥仅存本机，导出默认脱敏）----
const aiEnabled = computed(() => platform.settings.ai !== undefined)
const aiProvider = computed<AiConfig['provider']>(() => platform.settings.ai?.provider ?? 'glm')
const aiBaseURL = computed(() => platform.settings.ai?.baseURL ?? '')
const aiModel = computed(() => platform.settings.ai?.model ?? '')
const aiApiKey = computed(() => platform.settings.ai?.apiKey ?? '')
/** 预设项的 baseURL/model 作为占位提示（留空即用预设）；custom 无预设 */
const aiPreset = computed(() => PROVIDER_PRESETS[aiProvider.value])

function patchAi(patch: Partial<AiConfig>): void {
  const cur: AiConfig = platform.settings.ai ?? { provider: 'glm', baseURL: '', model: '', apiKey: '' }
  platform.patchSettings({ ai: { ...cur, ...patch } })
}

function onAiToggle(event: Event): void {
  const on = (event.target as HTMLInputElement).checked
  // 关闭 = 移除整段（undefined 不序列化，存档不再含 ai 字段）
  platform.patchSettings(
    on ? { ai: { provider: 'glm', baseURL: '', model: '', apiKey: '' } } : { ai: undefined },
  )
}

function onAiProviderChange(event: Event): void {
  patchAi({ provider: (event.target as HTMLSelectElement).value as AiConfig['provider'] })
}

function onAiBaseURL(event: Event): void {
  patchAi({ baseURL: (event.target as HTMLInputElement).value.trim() })
}

function onAiModel(event: Event): void {
  patchAi({ model: (event.target as HTMLInputElement).value.trim() })
}

function onAiApiKey(event: Event): void {
  patchAi({ apiKey: (event.target as HTMLInputElement).value.trim() })
}

function exportSave(): void {
  const blob = new Blob([exportJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ludoburrow-save.json'
  a.click()
  URL.revokeObjectURL(url)
  feedback.value = t('settings.saveExportDone')
}

async function importSave(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const text = await file.text()
  const result = importJson(text)
  feedback.value = result.ok ? t('settings.saveImportOk') : t('settings.saveImportFail')
  if (result.ok) platform.refreshSettings()
}
</script>

<template>
  <div class="settings-panel" data-view="settings">
    <header class="settings-header">
      <button class="secondary-btn" data-nav="back" @click="platform.goMenu()">{{ t('common.back') }}</button>
      <h2>{{ t('common.settings') }}</h2>
    </header>

    <section class="settings-section" data-section="language">
      <h3>{{ t('settings.language') }}</h3>
      <select :value="locale" data-role="locale-select" @change="onLocaleChange">
        <option v-for="opt in LOCALE_OPTIONS" :key="opt.value" :value="opt.value">
          {{ t(opt.labelKey) }}
        </option>
      </select>
    </section>

    <section class="settings-section" data-section="sound">
      <h3>{{ t('settings.sound') }}</h3>
      <label class="switch-row">
        <input type="checkbox" :checked="soundEnabled" data-role="sound-toggle" @change="onSoundToggle" />
        <span>{{ soundEnabled ? t('settings.soundOn') : t('settings.soundOff') }}</span>
      </label>
    </section>

    <section class="settings-section" data-section="timelimit">
      <h3>{{ t('settings.timeLimitSection') }}</h3>
      <div class="radio-group">
        <label class="radio-row">
          <input type="radio" name="tl-mode" value="off" :checked="timeLimitMode === 'off'" data-role="tl-off" @change="onModeChange('off')" />
          <span>{{ t('settings.timeLimitOff') }}</span>
        </label>
        <label class="radio-row">
          <input type="radio" name="tl-mode" value="competition" :checked="timeLimitMode === 'competition'" data-role="tl-competition" @change="onModeChange('competition')" />
          <span>{{ t('settings.timeLimitCompetition') }}</span>
        </label>
        <label class="radio-row">
          <input type="radio" name="tl-mode" value="antiAddiction" :checked="timeLimitMode === 'antiAddiction'" data-role="tl-anti" @change="onModeChange('antiAddiction')" />
          <span>{{ t('settings.timeLimitAntiAddiction') }}</span>
        </label>
      </div>
      <div v-if="timeLimitMode !== 'off'" class="number-row">
        <label>{{ t('settings.limitMinutes') }}
          <input type="number" min="1" max="60" :value="limitMinutes" data-role="limit-minutes" @change="onLimitMinutes" />
        </label>
        <label v-if="timeLimitMode === 'antiAddiction'">{{ t('settings.lockMinutes') }}
          <input type="number" min="1" max="60" :value="lockMinutes" data-role="lock-minutes" @change="onLockMinutes" />
        </label>
      </div>
    </section>

    <section class="settings-section" data-section="ai">
      <h3>{{ t('settings.aiSection') }}</h3>
      <label class="switch-row">
        <input type="checkbox" :checked="aiEnabled" data-role="ai-toggle" @change="onAiToggle" />
        <span>{{ t('settings.aiEnabled') }}</span>
      </label>
      <template v-if="aiEnabled">
        <label class="select-row">
          <span>{{ t('settings.aiProvider') }}</span>
          <select :value="aiProvider" data-role="ai-provider" @change="onAiProviderChange">
            <option value="qwen">{{ t('settings.aiProviderQwen') }}</option>
            <option value="glm">{{ t('settings.aiProviderGlm') }}</option>
            <option value="custom">{{ t('settings.aiCustom') }}</option>
          </select>
        </label>
        <label class="text-row">
          <span>{{ t('settings.aiBaseUrl') }}</span>
          <input type="text" :value="aiBaseURL" :placeholder="aiPreset.baseURL || t('settings.aiPresetHint')" data-role="ai-baseurl" @change="onAiBaseURL" />
        </label>
        <label class="text-row">
          <span>{{ t('settings.aiModel') }}</span>
          <input type="text" :value="aiModel" :placeholder="aiPreset.model || t('settings.aiPresetHint')" data-role="ai-model" @change="onAiModel" />
        </label>
        <label class="text-row">
          <span>{{ t('settings.aiKey') }}</span>
          <input type="password" :value="aiApiKey" autocomplete="off" data-role="ai-apikey" @change="onAiApiKey" />
        </label>
        <p class="hint">{{ t('settings.aiHint') }}</p>
      </template>
    </section>

    <section class="settings-section" data-section="save">
      <h3>{{ t('settings.saveSection') }}</h3>
      <div class="save-actions">
        <button class="secondary-btn" data-role="save-export" @click="exportSave">{{ t('settings.saveExport') }}</button>
        <label class="secondary-btn file-label">
          {{ t('settings.saveImport') }}
          <input type="file" accept="application/json" data-role="save-import" @change="importSave" />
        </label>
      </div>
    </section>

    <p v-if="feedback" class="feedback" data-role="feedback">{{ feedback }}</p>
  </div>
</template>

<style scoped>
.settings-panel {
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 720px;
}
.settings-header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.settings-header h2 { margin: 0; }
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.settings-section h3 {
  margin: 0;
  font-size: 16px;
  color: var(--color-text-secondary);
}
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.radio-row, .switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.number-row {
  display: flex;
  gap: 24px;
}
.number-row label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.number-row input {
  width: 72px;
}
.save-actions {
  display: flex;
  gap: 12px;
}
.select-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.text-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 420px;
}
.text-row input {
  width: 100%;
  box-sizing: border-box;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.file-label {
  position: relative;
  overflow: hidden;
}
.file-label input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.feedback {
  color: var(--color-primary);
  font-weight: 600;
}
</style>
