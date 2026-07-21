const KEY = 'neopaste_history_v1'
const MAX = 40

export function listHistory() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function addHistory(entry) {
  const items = listHistory().filter((x) => x.id !== entry.id)
  items.unshift({
    id: entry.id,
    url: entry.url,
    createdAt: entry.createdAt || Date.now(),
    kind: entry.kind || 'text',
    label: entry.label || '',
    expiresAt: entry.expiresAt || null,
    burn: !!entry.burn,
    hasPasswordInHash: !!entry.hasPasswordInHash,
    status: 'unknown',
  })
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)))
}

export function removeHistory(id) {
  localStorage.setItem(KEY, JSON.stringify(listHistory().filter((x) => x.id !== id)))
}

export function clearHistory() {
  localStorage.removeItem(KEY)
}

export function updateHistoryStatus(id, status) {
  const items = listHistory().map((x) => (x.id === id ? { ...x, status } : x))
  localStorage.setItem(KEY, JSON.stringify(items))
}

/** Lightweight liveness check without password. */
export async function refreshHistoryStatuses() {
  const items = listHistory()
  await Promise.all(
    items.map(async (item) => {
      try {
        const res = await fetch(`/api/pastes/${encodeURIComponent(item.id)}`)
        updateHistoryStatus(item.id, res.ok ? 'alive' : 'gone')
      } catch {
        updateHistoryStatus(item.id, 'unknown')
      }
    }),
  )
  return listHistory()
}
