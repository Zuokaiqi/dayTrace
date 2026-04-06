import { t2m, dateKey, datesInRange, SH, EH, TAG_COLORS, TAG_NAMES } from '../utils/time'

/**
 * Compute stats for a single day's events
 * @param {Array} dayEvents - result of eventStore.eventsForDate(date)
 * @returns {Object} stats
 */
export function computeDayStats(dayEvents) {
  const planned = dayEvents.filter(e => e.plan)
  const withA = dayEvents.filter(e => e.plan && e.actual)
  const unp = dayEvents.filter(e => !e.plan && e.actual)

  const devMFn = (p, a) => t2m(a.start) - t2m(p.start)

  const avg = withA.length
    ? Math.round(withA.reduce((s, e) => s + Math.abs(devMFn(e.plan, e.actual)), 0) / withA.length)
    : 0

  let actualMins = 0
  dayEvents.forEach(e => {
    if (e.actual) actualMins += t2m(e.actual.end) - t2m(e.actual.start)
  })
  const util = Math.round((actualMins / ((EH - SH) * 60)) * 100)

  const execRate = planned.length ? Math.round((withA.length / planned.length) * 100) : 0
  const onTimeRate = withA.length
    ? Math.round(withA.filter(e => devMFn(e.plan, e.actual) <= 10).length / withA.length * 100)
    : 0

  const score = planned.length
    ? Math.min(100, Math.round(execRate * 0.5 + onTimeRate * 0.3 + (100 - Math.min(unp.length * 15, 50)) * 0.2))
    : 0

  const scoreColor = score >= 90 ? 'var(--blue)' : score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--orange)' : 'var(--red)'

  const tagMins = {}
  dayEvents.forEach(e => {
    if (e.actual) tagMins[e.tag] = (tagMins[e.tag] || 0) + t2m(e.actual.end) - t2m(e.actual.start)
  })
  const tagTotal = Object.values(tagMins).reduce((a, b) => a + b, 0) || 1

  return {
    planned, withA, unp,
    execRate, onTimeRate, util, avg,
    score, scoreColor,
    tagMins, tagTotal,
    actualMins
  }
}

/**
 * Compute aggregated stats over a date range
 * @param {Object} eventStore - Pinia event store instance
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Object} rangeStats
 */
export function computeRangeStats(eventStore, startDate, endDate) {
  const dates = datesInRange(startDate, endDate)
  const dailyStats = []

  dates.forEach(d => {
    const evs = eventStore.eventsForDate(d)
    const stats = computeDayStats(evs)
    dailyStats.push({ date: d, dateKey: dateKey(d), ...stats })
  })

  // Only count days with planned events for averages
  const activeDays = dailyStats.filter(s => s.planned.length > 0)
  const activeCount = activeDays.length || 1

  const avgScore = Math.round(activeDays.reduce((s, d) => s + d.score, 0) / activeCount)
  const avgExecRate = Math.round(activeDays.reduce((s, d) => s + d.execRate, 0) / activeCount)
  const avgOnTimeRate = Math.round(activeDays.reduce((s, d) => s + d.onTimeRate, 0) / activeCount)
  const avgUtil = Math.round(dailyStats.reduce((s, d) => s + d.util, 0) / dates.length)

  // Totals
  const totals = { planned: 0, executed: 0, unplanned: 0, unexecuted: 0 }
  dailyStats.forEach(s => {
    totals.planned += s.planned.length
    totals.executed += s.withA.length
    totals.unplanned += s.unp.length
    totals.unexecuted += s.planned.length - s.withA.length
  })

  const avgDeviation = activeDays.length
    ? Math.round(activeDays.reduce((s, d) => s + d.avg, 0) / activeCount)
    : 0

  // Tag totals
  const tagTotals = {}
  dailyStats.forEach(s => {
    Object.entries(s.tagMins).forEach(([tag, mins]) => {
      tagTotals[tag] = (tagTotals[tag] || 0) + mins
    })
  })
  const tagGrandTotal = Object.values(tagTotals).reduce((a, b) => a + b, 0) || 1

  // Best / worst active day
  let bestDay = null, worstDay = null
  activeDays.forEach(d => {
    if (!bestDay || d.score > bestDay.score) bestDay = d
    if (!worstDay || d.score < worstDay.score) worstDay = d
  })

  // Current streak (consecutive days with score >= 60, ending at endDate or today)
  let streak = 0
  for (let i = dailyStats.length - 1; i >= 0; i--) {
    const s = dailyStats[i]
    if (s.planned.length === 0) continue // skip inactive days
    if (s.score >= 60) streak++
    else break
  }

  // Score color for average
  const scoreColor = avgScore >= 90 ? 'var(--blue)' : avgScore >= 80 ? 'var(--green)' : avgScore >= 50 ? 'var(--orange)' : 'var(--red)'

  return {
    dailyStats,
    activeDays: activeDays.length,
    avgScore, avgExecRate, avgOnTimeRate, avgUtil,
    scoreColor,
    totals,
    avgDeviation,
    tagTotals, tagGrandTotal,
    bestDay, worstDay,
    streak
  }
}

/**
 * Get reflections for a date range from localStorage
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array} [{dateKey, text, textTmr}]
 */
export function reflectionsForRange(startDate, endDate) {
  const dates = datesInRange(startDate, endDate)
  const result = []
  dates.forEach(d => {
    const dk = dateKey(d)
    const text = localStorage.getItem('dt_refl_' + dk) || ''
    const textTmr = localStorage.getItem('dt_refl_' + dk + '_tmr') || ''
    if (text || textTmr) result.push({ dateKey: dk, text, textTmr })
  })
  return result
}

/**
 * Format minutes as "Xh Ym"
 */
export function fmtMins(m) {
  const h = Math.floor(m / 60), r = m % 60
  return (h ? h + 'h' : '') + r + 'm'
}

export { TAG_COLORS, TAG_NAMES }
