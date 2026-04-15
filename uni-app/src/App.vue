<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useAuthStore } from './stores/auth'
import { useSync } from './composables/useSync'

onLaunch(() => {
  const auth = useAuthStore()
  const { pullFromServer } = useSync()
  if (auth.isLoggedIn) {
    pullFromServer()
  }
})

onShow(() => {
  const auth = useAuthStore()
  const { pullFromServer } = useSync()
  if (auth.isLoggedIn) {
    pullFromServer({ silent: true })
  }
})
</script>

<template>
</template>

<style>
/* 全局样式 */
page {
  background-color: #f5f7fa;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* {
  box-sizing: border-box;
}

.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
