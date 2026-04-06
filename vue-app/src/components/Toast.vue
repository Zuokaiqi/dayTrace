<template>
  <div class="toast-container">
    <div :class="['toast', { show: visible }]">{{ message }}</div>
  </div>
</template>

<script setup>
import { useToast } from '../composables/useToast'
const { message, visible } = useToast()
</script>
