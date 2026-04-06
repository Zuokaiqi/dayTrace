import { SL, SNAP, EH, t2m, m2t } from '../utils/time'

/**
 * Setup resize handle on an event block.
 * @param {HTMLElement} el - the .ev element
 * @param {Function} getEvData - (id) => event object
 * @param {string} col - 'plan' | 'actual'
 * @param {Function} onComplete - (evData, col, newEnd) => void
 */
export function setupResize(el, evId, getEvData, col, onComplete) {
  const rh = el.querySelector('.resize-h')
  if (!rh) return

  rh.addEventListener('mousedown', e => {
    e.stopPropagation()
    e.preventDefault()
    const startY = e.clientY
    const startH = el.offsetHeight
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'

    const mv = e2 => {
      el.style.height = Math.max(SL / 2, startH + (e2.clientY - startY)) + 'px'
    }

    const up = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', mv)
      document.removeEventListener('mouseup', up)

      const evData = getEvData(evId)
      if (!evData) return
      const data = col === 'plan' ? evData.plan : evData.actual
      if (!data) return
      const dur = Math.round(((el.offsetHeight / SL) * 30) / SNAP) * SNAP
      const newEnd = Math.min(t2m(data.start) + Math.max(dur, SNAP), EH * 60)
      onComplete(evData, col, m2t(newEnd))
    }

    document.addEventListener('mousemove', mv)
    document.addEventListener('mouseup', up)
  })
}
