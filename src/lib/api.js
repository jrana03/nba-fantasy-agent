import { useSyncExternalStore } from 'react'

// Local dev → the Deno server from `npm run dev:api`; production → Supabase Edge Functions (.env.production).
const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787'

// ---------- API status store (feeds the status panel in the header) ----------

let status = {
  openai: null, // latest agent status from nba-home
  lastOpenAIUsage: null, // tokens/calls for the latest nba-home load
  espn: null, // { calls, failures, lastError } for the latest request
  cache: null,
  session: { espnCalls: 0, espnFailures: 0, openaiCalls: 0, inputTokens: 0, outputTokens: 0 },
  lastRequest: null, // { path, ok, at, error? }
}
const listeners = new Set()
const emit = (patch) => {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}
export const useApiStatus = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => status,
  )

function recordUsage(path, data) {
  const u = data?.usage
  const s = { ...status.session }
  const patch = {}
  if (u) {
    s.espnCalls += u.espn.calls
    s.espnFailures += u.espn.failures
    s.openaiCalls += u.openai.calls
    s.inputTokens += u.openai.inputTokens
    s.outputTokens += u.openai.outputTokens
    patch.espn = u.espn
    patch.cache = u.cache
    if (path.startsWith('nba-home')) patch.lastOpenAIUsage = u.openai
  }
  if (data?.agent) patch.openai = data.agent
  emit({ ...patch, session: s })
}

// ---------- Requests ----------

export class ApiError extends Error {
  constructor(message, { reason, source, status } = {}) {
    super(message)
    this.reason = reason // short human explanation of why data isn't loading
    this.source = source // 'network' | 'espn' | 'server' | 'not_found' | 'auth'
    this.status = status
  }
}

// Small in-memory cache so navigating back and forth between pages is instant.
const cache = new Map()
const TTL_MS = 2 * 60 * 1000

/**
 * `fresh` skips the client cache; `cacheAs` stores the result under another key (refresh → plain path),
 * or nowhere when null; `headers` adds request headers; `body` makes it a JSON POST (never cached).
 */
export async function api(path, { fresh = false, cacheAs = path, headers, body } = {}) {
  if (body !== undefined) {
    fresh = true
    cacheAs = null
  }
  const hit = cacheAs && cache.get(cacheAs)
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.data

  let res
  try {
    res = await fetch(
      `${BASE}/${path}`,
      body !== undefined
        ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }
        : headers
          ? { headers }
          : undefined,
    )
  } catch {
    const err = new ApiError(`Can't reach the API server at ${BASE}.`, {
      source: 'network',
      reason: import.meta.env.DEV
        ? 'The local API is not running. Start it with `npm run dev` (or `npm run dev:api`).'
        : 'The Supabase Edge Function is unreachable. Check that it is deployed and the project is up.',
    })
    emit({ lastRequest: { path, ok: false, at: Date.now(), error: err.message, reason: err.reason } })
    throw err
  }

  const data = await res.json().catch(() => ({}))
  recordUsage(path, data)

  if (!res.ok || data.error) {
    // A wrong/missing refresh password is not an API outage, so leave the status panel alone.
    if (data.source === 'auth') throw new ApiError(data.error || 'Incorrect password.', { source: 'auth', status: res.status })
    // Same for a rejected edit (e.g. "already on your team").
    if (data.source === 'validation') throw new ApiError(data.error, { source: 'validation', status: res.status })
    const err =
      res.status === 404 && !data.error
        ? new ApiError('API endpoint not found.', { source: 'not_found', reason: 'The Edge Function may not be deployed yet.' })
        : new ApiError(data.error || `Request failed (HTTP ${res.status}).`, {
            source: data.source ?? 'server',
            reason:
              data.source === 'espn'
                ? 'ESPN (the stats data source) did not respond correctly. It is usually temporary; try again in a minute.'
                : 'The API hit an unexpected error. Check the API terminal for details.',
          })
    emit({ lastRequest: { path, ok: false, at: Date.now(), error: err.message, reason: err.reason } })
    throw err
  }

  emit({ lastRequest: { path, ok: true, at: Date.now() } })
  if (cacheAs) cache.set(cacheAs, { at: Date.now(), data })
  return data
}

// The server keeps one home snapshot per day; refresh (password-protected) forces a new agent run.
export const getHome = ({ refresh = false, password } = {}) =>
  refresh
    ? api('nba-home?refresh=1', { fresh: true, cacheAs: 'nba-home', headers: { 'x-refresh-password': password ?? '' } })
    : api('nba-home')

/** Instantly checks a refresh password without running the agent. Throws ApiError (source 'auth') if wrong. */
export const checkRefreshPassword = (password) =>
  api('nba-home?refresh=1&check=1', { fresh: true, cacheAs: null, headers: { 'x-refresh-password': password } })
export const getPlayer = (id, season) => api(`nba-player?id=${id}${season ? `&season=${season}` : ''}`)

// ---------- Roster ----------

export const getRoster = () => api('nba-roster', { fresh: true, cacheAs: null })
export const searchNbaPlayers = (q) => api(`nba-roster?search=${encodeURIComponent(q)}`, { cacheAs: `search:${q.toLowerCase()}` })

/** Roster change (add / remove / replace / check). Requires the edit password. Drops the cached home page. */
export async function updateRoster(change, password) {
  const data = await api('nba-roster', { body: change, headers: { 'x-refresh-password': password ?? '' } })
  if (!['check', 'set-lineup', 'swap-lineup'].includes(change.action)) cache.delete('nba-home')
  return data
}
