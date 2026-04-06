<template>
  <div :class="{ dark: isDark }" class="app-root">
    <router-view />
    <Toast ref="toastRef" />
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useUiStore } from './stores/ui'
import Toast from './components/Toast.vue'

const ui = useUiStore()
const isDark = computed(() => ui.theme === 'dark')

// Apply dark class to html element
watch(isDark, (v) => {
  document.documentElement.classList.toggle('dark', v)
}, { immediate: true })
</script>

<style>
.app-root {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
