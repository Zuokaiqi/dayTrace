import { ref } from 'vue'
import { defineStore } from 'pinia'
import { authFetch } from '../utils/api'
import { useSync } from '../composables/useSync'

export const useLinkStore = defineStore('links', () => {
  const links = ref([])
  const groups = ref([])  // independent group list, persisted separately
  // Each link: { id, name, url, group, tags:[], starred, clicks, favicon, domain, createdAt }
  let nextLinkId = 1
  let _syncTimer = null
  let _dirty = false

  function load() {
    try {
      const d = localStorage.getItem('dt_links')
      if (d) {
        let arr = JSON.parse(d)
        if (!Array.isArray(arr)) arr = []
        // Migrate old format: ensure each link has id, favicon, domain
        arr = arr.map((l, i) => ({
          id: l.id || i + 1,
          name: l.name || l.title || '',
          url: l.url || '',
          group: l.group || '未分类',
          tags: l.tags || [l.group || '未分类'],
          starred: l.starred || false,
          clicks: l.clicks || 0,
          favicon: l.favicon || (l.url ? getFavicon(l.url) : ''),
          domain: l.domain || (l.url ? extractDomain(l.url) : ''),
          createdAt: l.createdAt || new Date().toISOString()
        }))
        links.value = arr
        nextLinkId = arr.reduce((m, l) => Math.max(m, l.id || 0), 0) + 1
      }
    } catch { links.value = [] }
    try {
      const g = localStorage.getItem('dt_link_groups')
      if (g) groups.value = JSON.parse(g)
    } catch {}
    // Rebuild groups from links if groups list is empty
    if (!groups.value.length && links.value.length) {
      const set = new Set()
      links.value.forEach(l => { if (l.group) set.add(l.group) })
      groups.value = [...set]
      saveGroups()
    }
  }

  function saveGroups() {
    localStorage.setItem('dt_link_groups', JSON.stringify(groups.value))
  }

  function save() {
    localStorage.setItem('dt_links', JSON.stringify(links.value))
    _dirty = true
    localStorage.setItem('dt_links_dirty', '1')
    const { notifyDirty } = useSync()
    notifyDirty()
    clearTimeout(_syncTimer)
    _syncTimer = setTimeout(() => {
      _dirty = false
      const { notifyPushStart, notifyPushComplete } = useSync()
      notifyPushStart()
      authFetch('/api/links', { method: 'POST', body: JSON.stringify({ links: links.value }) })
        .then(() => { localStorage.removeItem('dt_links_dirty'); notifyPushComplete(true) })
        .catch(() => notifyPushComplete(false))
    }, 600)
  }

  async function syncFromServer() {
    if (_dirty) return false
    try {
      const resp = await authFetch('/api/links')
      if (!resp.ok) return false
      if (_dirty) return false
      const d = await resp.json()
      if (d.links?.length) {
        // Migrate old format
        links.value = d.links.map((l, i) => ({
          id: l.id || i + 1,
          name: l.name || l.title || '',
          url: l.url || '',
          group: l.group || '未分类',
          tags: l.tags || [l.group || '未分类'],
          starred: l.starred || false,
          clicks: l.clicks || 0,
          favicon: l.favicon || (l.url ? getFavicon(l.url) : ''),
          domain: l.domain || (l.url ? extractDomain(l.url) : ''),
          createdAt: l.createdAt || new Date().toISOString()
        }))
        nextLinkId = links.value.reduce((m, l) => Math.max(m, l.id || 0), 0) + 1
        localStorage.setItem('dt_links', JSON.stringify(links.value))
        // Rebuild groups
        const set = new Set(groups.value)
        links.value.forEach(l => { if (l.group) set.add(l.group) })
        groups.value = [...set]
        saveGroups()
        return true
      }
    } catch {}
    return false
  }

  function extractDomain(url) {
    try { return new URL(url).hostname } catch { return url }
  }

  function getFavicon(url) {
    const domain = extractDomain(url)
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  }

  function addLink(name, url, group = '未分类') {
    const domain = extractDomain(url)
    const link = {
      id: nextLinkId++, name: name || domain, url, group,
      tags: [group], starred: false, clicks: 0,
      favicon: getFavicon(url), domain,
      createdAt: new Date().toISOString()
    }
    links.value.push(link)
    // Ensure group exists
    if (!groups.value.includes(group)) { groups.value.push(group); saveGroups() }
    save()
    return link
  }

  function updateLink(id, updates) {
    const lk = links.value.find(l => l.id === id)
    if (lk) { Object.assign(lk, updates); save() }
  }

  function removeLink(id) {
    links.value = links.value.filter(l => l.id !== id)
    save()
  }

  function toggleStar(id) {
    const lk = links.value.find(l => l.id === id)
    if (lk) { lk.starred = !lk.starred; save() }
  }

  function recordClick(id) {
    const lk = links.value.find(l => l.id === id)
    if (lk) { lk.clicks = (lk.clicks || 0) + 1; save() }
  }

  function getGroups() { return groups.value }

  function addGroup(name) {
    if (!groups.value.includes(name)) { groups.value.push(name); saveGroups() }
  }

  function removeGroup(name) {
    groups.value = groups.value.filter(g => g !== name)
    saveGroups()
  }

  function renameGroup(oldName, newName) {
    const idx = groups.value.indexOf(oldName)
    if (idx >= 0) groups.value[idx] = newName
    links.value.forEach(l => { if (l.group === oldName) l.group = newName })
    saveGroups(); save()
  }

  function reorderGroups(newOrder) {
    groups.value = newOrder
    saveGroups()
  }

  load()
  // Recover from interrupted push
  if (localStorage.getItem('dt_links_dirty')) {
    _dirty = true
    const { notifyPushStart, notifyPushComplete } = useSync()
    notifyPushStart()
    _dirty = false
    localStorage.removeItem('dt_links_dirty')
    authFetch('/api/links', { method: 'POST', body: JSON.stringify({ links: links.value }) })
      .then(() => notifyPushComplete(true))
      .catch(() => notifyPushComplete(false))
  }

  return {
    links, groups, save, saveGroups, load, syncFromServer,
    addLink, updateLink, removeLink, toggleStar, recordClick,
    getGroups, addGroup, removeGroup, renameGroup, reorderGroups,
    getFavicon, extractDomain
  }
})
