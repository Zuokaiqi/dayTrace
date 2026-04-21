import { t2m } from './time'

/**
 * Calculate overlap layout for events (飞书风格并排显示)
 * @param {Array<{id, startMin, endMin}>} items
 * @returns {Map<id, {col, totalCols}>}
 */
export function calcOverlapLayout(items) {
  if (!items.length) return new Map()
  // Ensure every item has at least 1 minute duration for layout calculation
  const sorted = [...items].map(i => ({
    ...i,
    endMin: Math.max(i.endMin, i.startMin + 1)
  })).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const colEnds = []
  sorted.forEach(item => {
    let placed = false
    for (let c = 0; c < colEnds.length; c++) {
      if (colEnds[c] <= item.startMin) { colEnds[c] = item.endMin; item._col = c; placed = true; break }
    }
    if (!placed) { item._col = colEnds.length; colEnds.push(item.endMin) }
  })
  const groups = []
  sorted.forEach(item => {
    let merged = false
    for (const g of groups) {
      if (item.startMin < g.end) { g.end = Math.max(g.end, item.endMin); g.items.push(item); merged = true; break }
    }
    if (!merged) groups.push({ end: item.endMin, items: [item] })
  })
  const result = new Map()
  groups.forEach(g => {
    const totalCols = Math.max(...g.items.map(i => i._col)) + 1
    g.items.forEach(i => result.set(i.id, { col: i._col, totalCols }))
  })
  return result
}

/**
 * Get CSS class for an event block
 */
export function getEvClass(ev, col) {
  if (col === 'plan') return 'plan-ev'
  // Week view: determine from event data
  const isPlanOnly = !ev.actual
  if (isPlanOnly) return 'plan-only-ev'
  if (!ev.plan && !ev.sourcePlanId) return 'unplanned-ev'
  if (!ev.plan) return 'actual-ev'
  const dv = t2m(ev.actual.start) - t2m(ev.plan.start)
  if (dv > 10) return 'delayed-ev'
  if (dv < -5) return 'early-ev'
  return 'actual-ev'
}
