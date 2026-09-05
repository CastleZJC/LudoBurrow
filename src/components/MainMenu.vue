<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { listGames } from '@/core/game-registry'
import { usePlatformStore } from '@/stores/platform'

const { t } = useI18n()
const platform = usePlatformStore()

const games = computed(() => listGames())
</script>

<template>
  <div class="main-menu" data-view="menu">
    <h1 class="app-title">{{ t('app.title') }}</h1>
    <p class="app-subtitle">{{ t('app.subtitle') }}</p>

    <div class="game-list">
      <button
        v-for="game in games"
        :key="game.id"
        class="game-entry"
        :data-game="game.id"
        @click="platform.openGameSelect(game.id)"
      >
        <img class="game-icon" :src="game.icon" :alt="t(game.name)" @error.prevent />
        <span class="game-name">{{ t(game.name) }}</span>
      </button>
    </div>

    <button class="secondary-btn" data-menu="settings" @click="platform.openSettings()">
      {{ t('common.settings') }}
    </button>
  </div>
</template>

<style scoped>
.main-menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 48px 24px;
}
.app-title {
  font-size: 40px;
  margin: 0;
  color: var(--color-primary);
}
.app-subtitle {
  margin: 0;
  color: var(--color-text-secondary);
}
.game-list {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  justify-content: center;
}
.game-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 180px;
  padding: 24px 16px;
  border-radius: var(--radius-lg);
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.game-entry:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}
.game-icon {
  width: 72px;
  height: 72px;
  object-fit: contain;
}
.game-name {
  font-size: 20px;
  font-weight: 600;
}
</style>
