import { onUnmounted } from 'vue'
import { SH, EH, SL, SNAP, y2m, m2t, pos } from '../utils/time'

/**
 * Drag-create on empty grid space.
 * @param {Ref<HTMLElement>} colRef - the column element ref
 * @param {Function} getGridY - (clientY) => y relative to grid top
 * @param {Function} onCreated - (start, end) called with time strings
 */
export function useDragCreate(colRef, getGridY, onCreated) {
  let dragging = false, sY = 0, cY = 0
  let ghost = null

  function onMousedown(e) {
    if (e.target.closest('.ev') || e.button !== 0) return
    const col = colRef.value
    if (!col) return
    dragging = true
    sY = getGridY(e.clientY)
    cY = sY
    col.style.cursor = 'grabbing'

    // Create ghost
    ghost = col.querySelector('.drag-ghost')
    if (!ghost) {
      ghost = document.createElement('div')
      ghost.className = 'drag-ghost'
      col.appendChild(ghost)
    }
    const snap = y2m(sY)
    ghost.style.top = pos(m2t(snap)) + 'px'
    ghost.style.height = SL + 'px'
    ghost.style.display = 'block'
    ghost.textContent = `${m2t(snap)} – ${m2t(snap + SNAP)}`
    e.preventDefault()
  }

  function onMousemove(e) {
    if (!dragging) return
    cY = getGridY(e.clientY)
    const minY = Math.min(sY, cY), maxY = Math.max(sY, cY)
    const s = y2m(minY)
    let en = y2m(maxY)
    if (en <= s) en = s + SNAP
    if (!ghost) return
    const tp = pos(m2t(s)), h = pos(m2t(en)) - tp
    ghost.style.top = tp + 'px'
    ghost.style.height = Math.max(h, SL) + 'px'
    ghost.textContent = `${m2t(s)} – ${m2t(en)}`
  }

  function onMouseup() {
    if (!dragging) return
    dragging = false
    const col = colRef.value
    if (col) col.style.cursor = ''

    const minY = Math.min(sY, cY), maxY = Math.max(sY, cY)
    let s = y2m(minY), en = y2m(maxY)
    if (en - s < SNAP) en = s + SNAP
    if (en > EH * 60) en = EH * 60
    if (s >= en) {
      if (ghost) ghost.style.display = 'none'
      return
    }
    if (ghost) ghost.style.display = 'none'
    onCreated(m2t(s), m2t(en))
  }

  function bind() {
    document.addEventListener('mousemove', onMousemove)
    document.addEventListener('mouseup', onMouseup)
  }

  function unbind() {
    document.removeEventListener('mousemove', onMousemove)
    document.removeEventListener('mouseup', onMouseup)
  }

  onUnmounted(unbind)

  return { onMousedown, bind, unbind }
}
