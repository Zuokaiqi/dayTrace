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

// ═══════════════════════════════════════════════
// 第 0 步：高级统计引擎 — AI 执行力分析的数据基础
// ═══════════════════════════════════════════════

/**
 * 时段效率画像：按小时分桶，统计每个时段的执行率和准时率
 * @param {Array} dailyStats - from computeRangeStats().dailyStats
 * @returns {Array} [{hour, planned, executed, execRate, onTimeRate, avgMins}]
 */
export function computeHourlyProfile(dailyStats) {
  // 24 个桶，每桶统计落入该小时的事件
  const buckets = Array.from({ length: 24 }, () => ({ planned: 0, executed: 0, onTime: 0, totalMins: 0 }))

  dailyStats.forEach(day => {
    day.planned.forEach(e => {
      const h = Math.floor(t2m(e.plan.start) / 60)
      if (h < 0 || h > 23) return
      buckets[h].planned++

      if (e.actual) {
        buckets[h].executed++
        const dev = t2m(e.actual.start) - t2m(e.plan.start)
        if (dev <= 10) buckets[h].onTime++
        buckets[h].totalMins += t2m(e.actual.end) - t2m(e.actual.start)
      }
    })
  })

  return buckets.map((b, hour) => ({
    hour,
    planned: b.planned,
    executed: b.executed,
    execRate: b.planned ? Math.round(b.executed / b.planned * 100) : 0,
    onTimeRate: b.executed ? Math.round(b.onTime / b.executed * 100) : 0,
    avgMins: b.executed ? Math.round(b.totalMins / b.executed) : 0
  })).filter(b => b.planned > 0) // 只返回有数据的时段
}

/**
 * 任务时长偏差分析：plan 时长 vs actual 时长，按 tag 分组
 * @param {Array} dailyStats
 * @returns {Object} { byTag: {tag: {count, avgPlanMins, avgActualMins, biasPercent}}, overall: {...} }
 */
export function computeDurationBias(dailyStats) {
  const groups = {} // tag → { planTotal, actualTotal, count }
  let overallPlan = 0, overallActual = 0, overallCount = 0

  dailyStats.forEach(day => {
    day.withA.forEach(e => {
      const planDur = t2m(e.plan.end) - t2m(e.plan.start)
      const actualDur = t2m(e.actual.end) - t2m(e.actual.start)
      if (planDur <= 0) return

      const tag = e.tag || 'other'
      if (!groups[tag]) groups[tag] = { planTotal: 0, actualTotal: 0, count: 0 }
      groups[tag].planTotal += planDur
      groups[tag].actualTotal += actualDur
      groups[tag].count++

      overallPlan += planDur
      overallActual += actualDur
      overallCount++
    })
  })

  const byTag = {}
  Object.entries(groups).forEach(([tag, g]) => {
    const avgPlan = Math.round(g.planTotal / g.count)
    const avgActual = Math.round(g.actualTotal / g.count)
    byTag[tag] = {
      count: g.count,
      avgPlanMins: avgPlan,
      avgActualMins: avgActual,
      biasPercent: avgPlan ? Math.round((avgActual - avgPlan) / avgPlan * 100) : 0
    }
  })

  const overallAvgPlan = overallCount ? Math.round(overallPlan / overallCount) : 0
  const overallAvgActual = overallCount ? Math.round(overallActual / overallCount) : 0

  return {
    byTag,
    overall: {
      count: overallCount,
      avgPlanMins: overallAvgPlan,
      avgActualMins: overallAvgActual,
      biasPercent: overallAvgPlan ? Math.round((overallAvgActual - overallAvgPlan) / overallAvgPlan * 100) : 0
    }
  }
}

/**
 * 行为模式检测：基于规则引擎检测用户的执行力模式
 * @param {Object} rangeStats - from computeRangeStats()
 * @param {Array} dailyStats - rangeStats.dailyStats
 * @returns {Array} [{id, type, icon, title, desc, severity}]
 *   severity: 'positive' | 'warning' | 'danger'
 */
export function detectPatterns(rangeStats, dailyStats) {
  const patterns = []
  const active = dailyStats.filter(d => d.planned.length > 0)
  if (active.length < 3) return patterns // 数据太少，不做分析

  // ── 1. 过度规划 ──
  const avgPlanned = active.reduce((s, d) => s + d.planned.length, 0) / active.length
  if (avgPlanned > 6 && rangeStats.avgExecRate < 60) {
    patterns.push({
      id: 'over-planning',
      type: 'warning',
      icon: '📦',
      title: '规划过多',
      desc: `日均规划 ${avgPlanned.toFixed(1)} 个任务，但执行率仅 ${rangeStats.avgExecRate}%。建议减少到 ${Math.max(3, Math.round(avgPlanned * rangeStats.avgExecRate / 100))} 个。`,
      severity: 'warning'
    })
  }

  // ── 2. 慢热型：第一个任务平均延迟 ──
  const firstTaskDelays = []
  active.forEach(day => {
    const first = day.withA
      .filter(e => e.plan && e.actual)
      .sort((a, b) => t2m(a.plan.start) - t2m(b.plan.start))[0]
    if (first) {
      firstTaskDelays.push(t2m(first.actual.start) - t2m(first.plan.start))
    }
  })
  if (firstTaskDelays.length >= 3) {
    const avgFirstDelay = Math.round(firstTaskDelays.reduce((a, b) => a + b, 0) / firstTaskDelays.length)
    if (avgFirstDelay > 20) {
      patterns.push({
        id: 'slow-starter',
        type: 'warning',
        icon: '🐌',
        title: '启动较慢',
        desc: `每天第一个任务平均延迟 ${avgFirstDelay} 分钟开始。建议第一个任务不要排太紧，或提前 ${avgFirstDelay} 分钟规划。`,
        severity: 'warning'
      })
    }
  }

  // ── 3. 临时插入过多 ──
  if (rangeStats.totals.planned > 0) {
    const unpRatio = rangeStats.totals.unplanned / rangeStats.totals.planned
    if (unpRatio > 0.4) {
      patterns.push({
        id: 'too-many-adhoc',
        type: 'warning',
        icon: '🔥',
        title: '临时任务过多',
        desc: `临时插入占比 ${Math.round(unpRatio * 100)}%，日程频繁被打断。建议预留 "缓冲时间" 应对突发事务。`,
        severity: 'warning'
      })
    }
  }

  // ── 4. 上午 vs 下午效率对比 ──
  let morningExec = 0, morningPlan = 0, afternoonExec = 0, afternoonPlan = 0
  active.forEach(day => {
    day.planned.forEach(e => {
      const h = Math.floor(t2m(e.plan.start) / 60)
      if (h < 13) { morningPlan++; if (e.actual) morningExec++ }
      else { afternoonPlan++; if (e.actual) afternoonExec++ }
    })
  })
  const morningRate = morningPlan ? Math.round(morningExec / morningPlan * 100) : 0
  const afternoonRate = afternoonPlan ? Math.round(afternoonExec / afternoonPlan * 100) : 0
  if (morningPlan >= 5 && afternoonPlan >= 5 && Math.abs(morningRate - afternoonRate) > 20) {
    const better = morningRate > afternoonRate ? '上午' : '下午'
    const betterRate = Math.max(morningRate, afternoonRate)
    const worseRate = Math.min(morningRate, afternoonRate)
    patterns.push({
      id: 'time-of-day',
      type: 'info',
      icon: better === '上午' ? '🌅' : '🌆',
      title: `${better}效率更高`,
      desc: `${better}执行率 ${betterRate}%，另一半天 ${worseRate}%。建议把重要任务安排在${better}。`,
      severity: 'positive'
    })
  }

  // ── 5. 星期几周期：找出最差的一天 ──
  const dowScores = Array.from({ length: 7 }, () => ({ total: 0, count: 0 })) // 0=Sun
  active.forEach(d => {
    const dow = d.date.getDay()
    dowScores[dow].total += d.score
    dowScores[dow].count++
  })
  const dowAvgs = dowScores.map((d, i) => ({ dow: i, avg: d.count ? Math.round(d.total / d.count) : -1 })).filter(d => d.avg >= 0)
  if (dowAvgs.length >= 5) {
    const overallAvg = rangeStats.avgScore
    const worst = dowAvgs.reduce((a, b) => a.avg < b.avg ? a : b)
    const WD_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    if (worst.avg < overallAvg - 15) {
      patterns.push({
        id: 'weekday-cycle',
        type: 'warning',
        icon: '📅',
        title: `${WD_NAMES[worst.dow]}是低谷`,
        desc: `${WD_NAMES[worst.dow]}平均分 ${worst.avg}，比整体均值 ${overallAvg} 低 ${overallAvg - worst.avg} 分。`,
        severity: 'warning'
      })
    }
    const best = dowAvgs.reduce((a, b) => a.avg > b.avg ? a : b)
    if (best.avg > overallAvg + 10) {
      patterns.push({
        id: 'weekday-peak',
        type: 'info',
        icon: '⭐',
        title: `${WD_NAMES[best.dow]}状态最佳`,
        desc: `${WD_NAMES[best.dow]}平均分 ${best.avg}，是你最高效的一天。`,
        severity: 'positive'
      })
    }
  }

  // ── 6. 执行率趋势（连续下降/上升）──
  if (active.length >= 7) {
    // 把活跃天按 3-4 天一组分段，看趋势
    const chunkSize = Math.max(3, Math.floor(active.length / 3))
    const chunks = []
    for (let i = 0; i < active.length; i += chunkSize) {
      const slice = active.slice(i, i + chunkSize)
      if (slice.length >= 2) {
        chunks.push(Math.round(slice.reduce((s, d) => s + d.execRate, 0) / slice.length))
      }
    }
    if (chunks.length >= 3) {
      const allDecline = chunks.every((v, i) => i === 0 || v < chunks[i - 1])
      const allRise = chunks.every((v, i) => i === 0 || v > chunks[i - 1])
      if (allDecline && chunks[0] - chunks[chunks.length - 1] > 10) {
        patterns.push({
          id: 'exec-declining',
          type: 'danger',
          icon: '📉',
          title: '执行率持续下降',
          desc: `执行率从 ${chunks[0]}% 降至 ${chunks[chunks.length - 1]}%，需要关注。可能是倦怠信号，建议适当减少任务量。`,
          severity: 'danger'
        })
      } else if (allRise && chunks[chunks.length - 1] - chunks[0] > 10) {
        patterns.push({
          id: 'exec-improving',
          type: 'info',
          icon: '📈',
          title: '执行率持续上升',
          desc: `执行率从 ${chunks[0]}% 升至 ${chunks[chunks.length - 1]}%，保持这个势头！`,
          severity: 'positive'
        })
      }
    }
  }

  // ── 7. 虎头蛇尾：当天内上午 vs 下午执行率差异大 ──
  if (morningPlan >= 5 && afternoonPlan >= 5 && morningRate - afternoonRate > 25) {
    patterns.push({
      id: 'fade-out',
      type: 'warning',
      icon: '🔋',
      title: '下午精力下降明显',
      desc: `上午执行率 ${morningRate}%，下午仅 ${afternoonRate}%。建议午后安排轻量任务或短暂休息。`,
      severity: 'warning'
    })
  }

  // ── 8. 高执行率表扬 ──
  if (rangeStats.avgExecRate >= 80 && active.length >= 5) {
    patterns.push({
      id: 'high-exec',
      type: 'info',
      icon: '🏆',
      title: '执行力优秀',
      desc: `平均执行率 ${rangeStats.avgExecRate}%，在 ${active.length} 个活跃天中保持了高水准。`,
      severity: 'positive'
    })
  }

  // ── 9. 连续打卡表扬 ──
  if (rangeStats.streak >= 7) {
    patterns.push({
      id: 'streak',
      type: 'info',
      icon: '🔥',
      title: `连续 ${rangeStats.streak} 天达标`,
      desc: `你已经连续 ${rangeStats.streak} 天保持 60 分以上，这是了不起的坚持。`,
      severity: 'positive'
    })
  }

  return patterns
}

/**
 * 生成给 LLM 用的结构化摘要（为第 1 步准备的接口）
 * @param {Object} rangeStats
 * @param {Array} hourlyProfile
 * @param {Object} durationBias
 * @param {Array} patterns
 * @returns {Object} structured summary for AI prompt
 */
export function buildAISummary(rangeStats, hourlyProfile, durationBias, patterns) {
  // 找出黄金时段（执行率最高的 top 2 小时段）
  const goldenHours = [...hourlyProfile]
    .filter(h => h.planned >= 3)
    .sort((a, b) => b.execRate - a.execRate)
    .slice(0, 2)
    .map(h => `${h.hour}:00-${h.hour + 1}:00 (执行率${h.execRate}%)`)

  // 找出低谷时段
  const weakHours = [...hourlyProfile]
    .filter(h => h.planned >= 3)
    .sort((a, b) => a.execRate - b.execRate)
    .slice(0, 2)
    .map(h => `${h.hour}:00-${h.hour + 1}:00 (执行率${h.execRate}%)`)

  return {
    overview: {
      activeDays: rangeStats.activeDays,
      avgScore: rangeStats.avgScore,
      avgExecRate: rangeStats.avgExecRate,
      avgOnTimeRate: rangeStats.avgOnTimeRate,
      streak: rangeStats.streak,
      totals: rangeStats.totals
    },
    timeProfile: {
      goldenHours,
      weakHours
    },
    durationBias: durationBias.byTag,
    overallBias: durationBias.overall,
    patterns: patterns.map(p => ({ id: p.id, title: p.title, desc: p.desc, severity: p.severity })),
    tagDistribution: rangeStats.tagTotals
  }
}

export { TAG_COLORS, TAG_NAMES }
