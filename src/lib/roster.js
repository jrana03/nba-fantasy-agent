// My fantasy team, loaded from the API (editable in the sidebar) and shared by every page.
import { useEffect, useSyncExternalStore } from 'react'
import { getRoster, updateRoster } from './api.js'

let state = { players: null, error: null } // players: [{ id, name }] once loaded
let inflight = null
const listeners = new Set()
const set = (patch) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function loadRoster() {
  inflight ??= getRoster()
    .then((d) => set({ players: d.players, error: null }))
    .catch((error) => set({ error }))
    .finally(() => (inflight = null))
  return inflight
}

/** Applies a roster or lineup change and updates every subscriber. */
export async function changeRoster(change, password) {
  const d = await updateRoster(change, password)
  set({ players: d.players, error: null })
  return d.players
}

export function useRoster() {
  const snapshot = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )
  useEffect(() => {
    if (!state.players) loadRoster()
  }, [])
  return snapshot
}

/** Display name from my roster (keeps accents like Dončić), else the fallback (e.g. the API's name). */
export const rosterName = (id, fallback) => state.players?.find((p) => p.id === String(id))?.name ?? fallback
