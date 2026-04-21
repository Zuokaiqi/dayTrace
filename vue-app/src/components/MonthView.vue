<template>
  <div class="month-view">
    <div class="month-header">
      <div v-for="w in weekDays" :key="w">{{ w }}</div>
    </div>
    <div class="month-grid">
      <div
        v-for="cell in cells" :key="cell.key"
        :class="['month-cell', { other: cell.isOther, today: cell.isToday }]"
        @click="goToDay(cell.date)"
      >
        <div class="mc-num">{{ cell.num }}</div>
        <div
          v-for="ev in cell.evs.slice(0, 3)" :key="ev.id"
          :class="['mc-ev', ev.cls]"
          @click.stop="onClickEv(ev.id, $event)"
        >{{ ev.title }}</div>
        <div v-if="cell.evs.length > 3" class="mc-more">+{{ cell.evs.length - 3 }} 更多</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useUiStore } from '../stores/ui'
import { useEventStore } from '../stores/events'
import { WDE, sameDay, dateKey, devM } from '../utils/time'
import { usePopover } from '../composables/usePopover'

const ui = useUiStore()
const eventStore = useEventStore()
const { openEdit } = usePopover()

const weekDays = WDE

const cells = computed(() => {
  const y = ui.curDate.getFullYear()
  const mo = ui.curDate.getMonth()
  const first = new Date(y, mo, 1)
  const last = new Date(y, mo + 1, 0)
  const startDay = (first.getDay() || 7) - 1
  const totalCells = Math.ceil((startDay + last.getDate()) / 7) * 7
  const today = new Date()
  const result = []
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(y, mo, 1 - startDay + i)
    const isOther = d.getMonth() !== mo
    const isToday = sameDay(d, today)
    const dayEvs = eventStore.eventsForDate(d).filter(e => e.actual)
    const evs = dayEvs.map(ev => {
      let cls = 'actual-ev'
      if (!ev.plan && !ev.sourcePlanId) cls = 'unplanned-ev'
      else if (ev.plan && devM(ev.plan, ev.actual) > 10) cls = 'delayed-ev'
      return { id: ev.id, title: ev.title, cls }
    })
    result.push({ date: d, key: dateKey(d), num: d.getDate(), isOther, isToday, evs })
  }
  return result
})

function goToDay(d) {
  ui.goToDate(d)
  ui.setView('day')
}

function onClickEv(id, e) {
  const rect = e.target.getBoundingClientRect()
  openEdit(id, 'actual', { x: rect.right, y: rect.top })
}
</script>
