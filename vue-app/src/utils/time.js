// Grid constants
export const SH = 0    // start hour
export const EH = 24   // end hour
export const SL = 40   // slot height (px)
export const SNAP = 30  // snap interval (minutes)

// Time ↔ minutes conversion
export const t2m = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const m2t = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

// Position helpers
export const pos = t => ((t2m(t) - SH * 60) / 30) * SL
export const y2m = y => Math.round(((y / SL) * 30 + SH * 60) / SNAP) * SNAP
export const hgt = (s, e) => ((t2m(e) - t2m(s)) / 30) * SL
export const devM = (p, a) => t2m(a.start) - t2m(p.start)

// Date helpers
export const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

export const dateKey = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function weekStart(d) {
  const r = new Date(d)
  const day = r.getDay() || 7
  r.setDate(r.getDate() - (day - 1))
  r.setHours(0, 0, 0, 0)
  return r
}

// Date range helpers
export function datesInRange(start, end) {
  const dates = []
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  const endD = new Date(end)
  endD.setHours(0, 0, 0, 0)
  while (d <= endD) {
    dates.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

export function monthStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function monthEnd(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

// Display constants
export const WD = ['日', '一', '二', '三', '四', '五', '六']
export const WDE = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const TAG_COLORS = { work: 'var(--blue)', personal: 'var(--green)', admin: 'var(--orange)' }
export const TAG_NAMES = { work: '工作', personal: '生活', admin: '事务' }
