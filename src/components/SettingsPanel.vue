<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlatformStore } from '@/stores/platform'
import { LOCALE_OPTIONS, type SupportedLocale } from '@/i18n'
import { exportJson, importJson } from '@/core/save'
import type { AiConfig } from '@/core/save'
import type { TimeLimitMode } from '@/core/settings'
import { PROVIDER_PRESETS } from '@/ai/provider'
import { getEnvAdapter } from '@/services'
import { getPinyinByGrade, getWordsByLength } from '@/engines/wordbank'
import type { WordbankConfig, WordbankPinyinEntry } from '@/core/save'

const { t } = useI18n()
const platform = usePlatformStore()

/** 反馈条（导入结果等，一句话 + 下一步动作） */
const feedback = ref('')

const locale = computed<SupportedLocale>(() => platform.settings.locale)
const timeLimitMode = computed<TimeLimitMode>(() => platform.settings.timeLimit.mode)
const limitMinutes = computed(() => Math.round(platform.settings.timeLimit.limitMs / 60_000))
const lockMinutes = computed(() => Math.round(platform.settings.timeLimit.lockMs / 60_000))

function onLocaleChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as SupportedLocale
  platform.changeLocale(value)
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
  // 关闭 = 移除整段（undefined 不序列化，存档不再含 ai 字段）；开启 = 预设值直接填入输入框（可见可改）
  platform.patchSettings(
    on
      ? { ai: { provider: 'glm', baseURL: PROVIDER_PRESETS.glm.baseURL, model: PROVIDER_PRESETS.glm.model, apiKey: '' } }
      : { ai: undefined },
  )
}

function onAiProviderChange(event: Event): void {
  const provider = (event.target as HTMLSelectElement).value as AiConfig['provider']
  // 切换供应商 = 该商预设 URL/模型覆盖式回填输入框（框内可再改，存档值请求时优先于预设）
  patchAi({ provider, baseURL: PROVIDER_PRESETS[provider].baseURL, model: PROVIDER_PRESETS[provider].model })
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

// ---- 词汇表配置（键盘英文/拼音模式消费；读写一律经适配层，本地=存档 wordbank 段单一配置）----
/** 类别选项：英文词长桶 3-8 + 拼音等级 1-3（value 形如 'en-5' / 'py-2'，键与存档分级一致） */
const wbCategories = [
  ...[3, 4, 5, 6, 7, 8].map((len) => ({ value: `en-${len}`, key: 'settings.wbEnglishLen', n: len })),
  ...[1, 2, 3].map((g) => ({ value: `py-${g}`, key: 'settings.wbPinyinGrade', n: g })),
]

const wbCategory = ref('en-3')
const wbText = ref('')
const wbIsEnglish = computed(() => wbCategory.value.startsWith('en-'))

/** 当前类别生效词表转文本：有覆盖用覆盖，无覆盖用引擎默认（可见即所玩） */
function wbTextOf(category: string): string {
  const config = getEnvAdapter().wordbankRepo.getConfig()
  if (category.startsWith('en-')) {
    const len = Number(category.slice(3))
    const words = config.english?.[String(len)] ?? getWordsByLength(len)
    return words.join(', ')
  }
  const grade = Number(category.slice(3)) as 1 | 2 | 3
  const entries = config.pinyin?.[String(grade)] ?? getPinyinByGrade(grade)
  return entries.map((e) => `${e.word}|${e.pinyin}`).join('\n')
}

function loadWbText(): void {
  wbText.value = wbTextOf(wbCategory.value)
}

/** 英文解析：非字母字符一律视分隔（逗号/空白/换行统一），仅保留字母串（与存档校验同口径） */
function parseEnglishWords(text: string): string[] {
  return text.split(/[^A-Za-z]+/).filter((w) => w.length > 0)
}

/** 拼音解析：每行「汉字|拼音」；拼音小写 + 空格分隔音节，非法行丢弃（与存档校验同口径） */
function parsePinyinEntries(text: string): WordbankPinyinEntry[] {
  const out: WordbankPinyinEntry[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const idx = line.indexOf('|')
    if (idx < 0) continue
    const word = line.slice(0, idx).trim()
    const pinyin = line.slice(idx + 1).trim().toLowerCase().replace(/\s+/g, ' ')
    if (!word || !/^[a-z]+( [a-z]+)*$/.test(pinyin)) continue
    out.push({ word, pinyin })
  }
  return out
}

/** 写回当前类别：空 = 移除该类覆盖（回退默认）；两类均无覆盖时归一移除自定义段 */
function saveWbCategory(text: string): void {
  const repo = getEnvAdapter().wordbankRepo
  const config: WordbankConfig = { ...repo.getConfig() }
  if (wbCategory.value.startsWith('en-')) {
    const bucket = String(Number(wbCategory.value.slice(3)))
    const english = { ...(config.english ?? {}) }
    const words = parseEnglishWords(text)
    if (words.length > 0) english[bucket] = words
    else delete english[bucket]
    config.english = Object.keys(english).length > 0 ? english : undefined
  } else {
    const grade = String(Number(wbCategory.value.slice(3)))
    const pinyin = { ...(config.pinyin ?? {}) }
    const entries = parsePinyinEntries(text)
    if (entries.length > 0) pinyin[grade] = entries
    else delete pinyin[grade]
    config.pinyin = Object.keys(pinyin).length > 0 ? pinyin : undefined
  }
  repo.saveConfig(config)
}

function onWbCategoryChange(event: Event): void {
  wbCategory.value = (event.target as HTMLSelectElement).value
  loadWbText()
}

function onWbTextChange(event: Event): void {
  saveWbCategory((event.target as HTMLTextAreaElement).value)
}

function resetWbCategory(): void {
  saveWbCategory('')
  loadWbText()
  feedback.value = t('settings.wbResetDone')
}

function resetWbAll(): void {
  getEnvAdapter().wordbankRepo.saveConfig({})
  loadWbText()
  feedback.value = t('settings.wbResetDone')
}

loadWbText()

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
            <option value="deepseek">{{ t('settings.aiProviderDeepseek') }}</option>
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

    <section class="settings-section" data-section="wordbank">
      <h3>{{ t('settings.wordbankSection') }}</h3>
      <p class="hint">{{ t('settings.wordbankHint') }}</p>
      <label class="select-row">
        <span>{{ t('settings.wordbankCategory') }}</span>
        <select :value="wbCategory" data-role="wb-category" @change="onWbCategoryChange">
          <option v-for="cat in wbCategories" :key="cat.value" :value="cat.value">
            {{ t(cat.key, { n: cat.n }) }}
          </option>
        </select>
      </label>
      <textarea
        :value="wbText"
        class="wb-text"
        rows="8"
        data-role="wb-text"
        @change="onWbTextChange"
      ></textarea>
      <p class="hint">{{ wbIsEnglish ? t('settings.wbEnglishHint') : t('settings.wbPinyinHint') }}</p>
      <div class="wb-actions">
        <button class="secondary-btn" data-role="wb-reset-category" @click="resetWbCategory">
          {{ t('settings.wbResetCategory') }}
        </button>
        <button class="secondary-btn" data-role="wb-reset-all" @click="resetWbAll">
          {{ t('settings.wbResetAll') }}
        </button>
      </div>
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
.wb-text {
  width: 100%;
  max-width: 420px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-bg, #fff);
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}
.wb-actions {
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
