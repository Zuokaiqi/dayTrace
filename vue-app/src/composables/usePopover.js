import { ref, provide, inject } from 'vue'

const POPOVER_KEY = Symbol('popover')

export function providePopover() {
  const popoverRef = ref(null)
  provide(POPOVER_KEY, popoverRef)
  return popoverRef
}

export function usePopover() {
  const popoverRef = inject(POPOVER_KEY)
  return {
    openCreate: (...args) => popoverRef.value?.openCreate(...args),
    openEdit: (...args) => popoverRef.value?.openEdit(...args),
    close: () => popoverRef.value?.close()
  }
}
