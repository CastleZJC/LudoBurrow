<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { hasCorruptSave, resetSave, importJson } from '@/core/save'
import { usePlatformStore } from '@/stores/platform'
import MainMenu from '@/components/MainMenu.vue'
import LevelSelect from '@/components/LevelSelect.vue'
import GameContainer from '@/components/GameContainer.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import SchemeManager from '@/components/SchemeManager.vue'

const { t } = useI18n()
const platform = usePlatformStore()
const showCorrupt = ref(false)

onMounted(() => {
  // 启动时检测损坏存档：提示恢复路径，不静默清空（F-04）
  showCorrupt.value = hasCorruptSave()
})

function confirmReset(): void {
  resetSave()
  platform.refreshSettings()
  showCorrupt.value = false
}

async function onImportBackup(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const result = importJson(await file.text())
  if (result.ok) {
    platform.refreshSettings()
    showCorrupt.value = false
  }
}
</script>

<template>
  <div class="app-root">
    <MainMenu v-if="platform.view === 'menu'" />
    <LevelSelect v-else-if="platform.view === 'select'" :key="platform.currentGameId ?? ''" :game-id="platform.currentGameId ?? ''" />
    <GameContainer
      v-else-if="platform.view === 'game' && platform.currentLevelConfig"
      :key="`${platform.currentGameId}:${platform.currentLevelN}:${platform.levelEpoch}`"
      :level="platform.currentLevelConfig"
    />
    <SettingsPanel v-else-if="platform.view === 'settings'" />
    <SchemeManager v-else-if="platform.view === 'schemes'" />

    <div v-if="showCorrupt" class="corrupt-dialog" data-role="corrupt-dialog">
      <div class="corrupt-card">
        <h3>{{ t('save.corruptTitle') }}</h3>
        <p>{{ t('save.corruptBody') }}</p>
        <div class="corrupt-actions">
          <label class="primary-btn file-label">
            {{ t('save.corruptImport') }}
            <input type="file" accept="application/json" @change="onImportBackup" />
          </label>
          <button class="secondary-btn" data-role="corrupt-reset" @click="confirmReset">
            {{ t('save.corruptReset') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-root {
  min-height: 100vh;
}
.corrupt-dialog {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 55%);
  z-index: 100;
}
.corrupt-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 32px 40px;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: var(--shadow-lg);
}
.corrupt-card h3 { margin: 0; }
.corrupt-card p { margin: 0; color: var(--color-text-secondary); }
.corrupt-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.file-label {
  position: relative;
  overflow: hidden;
  cursor: pointer;
}
.file-label input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
