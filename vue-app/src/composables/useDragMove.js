import { SH, EH, SL, y2m, m2t, pos, t2m } from '../utils/time'

/**
 * Drag-move an existing event block (day view: cross-column, week view: cross-day).
 * Returns an object with setup(el, evId, getEvData, onDone) to bind per-element.
 */
export function createDragMoveHandler(getGridY, opts = {}) {
  // opts.getTargetCol: (clientX) => colEl|string|null
  // opts.getPreview: (targetCol) => previewEl|null
  // opts.hideAllPreviews: () => void
  // opts.onComplete: (evData, newStart, newEnd, targetCol) => void

  function setup(el, evId, getEvData, sourceCol = null) {
    let moveActive = false, startLocalY = 0, origTop = 0, moved = false
    let moveTimer = null, startX = 0
    let lastSnapMin = null, lastTarget = null

    el.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      origTop = el.offsetTop
      startLocalY = getGridY(e.clientY)
      startX = e.clientX
      moved = false; lastSnapMin = null; lastTarget = null

      const evData = getEvData(evId)
      if (!evData) return
      const timeData = sourceCol === 'plan' ? evData.plan
        : sourceCol === 'actual' ? evData.actual
        : (evData.actual || evData.plan)
      if (!timeData) return
      const duration = t2m(timeData.end) - t2m(timeData.start)
      const evH = el.offsetHeight

      function activate() {
        moveActive = true
        el.style.opacity = '0.3'
        el.style.pointerEvents = 'none'
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
      }
      moveTimer = setTimeout(activate, 120)

      const mv = e2 => {
        const curY = getGridY(e2.clientY)
        if (!moveActive) {
          if (Math.abs(curY - startLocalY) > 5 || Math.abs(e2.clientX - startX) > 5) {
            clearTimeout(moveTimer); activate()
          } else return
        }
        moved = true
        const dy = curY - startLocalY
        const snapMin = y2m(origTop + dy)
        const snapEnd = Math.min(snapMin + duration, EH * 60)
        lastSnapMin = snapMin

        const tc = opts.getTargetCol?.(e2.clientX)
        opts.hideAllPreviews?.()
        if (tc) {
          const preview = opts.getPreview?.(tc)
          if (preview) {
            preview.style.top = pos(m2t(snapMin)) + 'px'
            preview.style.height = evH + 'px'
            preview.style.display = 'block'
            preview.textContent = `${m2t(snapMin)} – ${m2t(snapEnd)}`
          }
        }
        lastTarget = tc
      }

      const up = () => {
        clearTimeout(moveTimer)
        document.removeEventListener('mousemove', mv)
        document.removeEventListener('mouseup', up)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        el.style.opacity = ''
        el.style.pointerEvents = ''
        opts.hideAllPreviews?.()

        if (!moved || !moveActive || lastSnapMin === null) { moveActive = false; return }
        moveActive = false
        const newStart = lastSnapMin
        const newEnd = Math.min(newStart + duration, EH * 60)
        if (newStart < SH * 60 || newEnd > EH * 60 || newStart >= newEnd) return

        opts.onComplete?.(evData, newStart, newEnd, lastTarget, el, sourceCol)
      }

      document.addEventListener('mousemove', mv)
      document.addEventListener('mouseup', up)
      e.stopPropagation()
      e.preventDefault()
    })
  }

  return { setup }
}
