<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { hasCorruptSave, resetSave, importJson } from '@/core/save'
import { usePlatformStore } from '@/stores/platform'
import ModalOverlay from '@/components/ModalOverlay.vue'
import FilePickButton from '@/components/FilePickButton.vue'
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

async function onImportBackup(files: File[]): Promise<void> {
  const file = files[0]
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

    <ModalOverlay v-if="showCorrupt" fixed :z="100" data-role="corrupt-dialog">
      <div class="corrupt-body">
        <h3>{{ t('save.corruptTitle') }}</h3>
        <p>{{ t('save.corruptBody') }}</p>
        <div class="corrupt-actions">
          <FilePickButton variant="primary" accept="application/json" @files="onImportBackup">
            {{ t('save.corruptImport') }}
          </FilePickButton>
          <button class="secondary-btn" data-role="corrupt-reset" @click="confirmReset">
            {{ t('save.corruptReset') }}
          </button>
        </div>
      </div>
    </ModalOverlay>
  </div>
</template>

<style scoped>
.app-root {
  min-height: 100vh;
}
.corrupt-body {
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}
.corrupt-body h3 { margin: 0; }
.corrupt-body p { margin: 0; color: var(--color-text-secondary); }
.corrupt-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
