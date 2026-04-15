// utils/time.ts

// Time ↔ minutes conversion
export const t2m = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
export const m2t = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

// Date helpers
export const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function weekStart(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay() || 7
  r.setDate(r.getDate() - (day - 1))
  r.setHours(0, 0, 0, 0)
  return r
}

export function datesInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = []
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

export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function monthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export const WD = ['日', '一', '二', '三', '四', '五', '六']
export const WDE = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const TAG_COLORS: Record<string, string> = {
  work: '#1a73e8',
  personal: '#34a853',
  admin: '#fb8c00'
}
export const TAG_NAMES: Record<string, string> = {
  work: '工作',
  personal: '生活',
  admin: '事务'
}
