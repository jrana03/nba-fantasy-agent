import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, Plus, Search, X } from 'lucide-react'
import { searchNbaPlayers, updateRoster } from '../lib/api.js'
import { clearRefreshPassword, getRefreshPassword, storeRefreshPassword } from '../lib/auth.js'
import { changeRoster, useRoster } from '../lib/roster.js'
import PasswordModal from './PasswordModal.jsx'

const iconBtn =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center border border-transparent text-muted hover:border-line hover:text-fg disabled:opacity-40'

/**
 * "My Team" sidebar. Normal mode: links to each player's page. Edit mode (password-protected, same password as
 * Refresh): add players via search, replace (edit) a player, or remove one.
 * `onDone(changed)` fires when leaving edit mode; `onUnlock` when the password is accepted.
 */
export default function RosterEditor({ teamOf, onDone, onUnlock }) {
  const { players, error } = useRoster()
  const [editing, setEditing] = useState(false)
  const [changed, setChanged] = useState(false)
  const [replacing, setReplacing] = useState(null) // id of the player being swapped
  const [busy, setBusy] = useState(null) // id being changed, or 'add'
  const [message, setMessage] = useState(null)
  const [pwOpen, setPwOpen] = useState(false)
  const [pwError, setPwError] = useState('')

  const startEditing = () => {
    if (getRefreshPassword()) return setEditing(true)
    setPwError('')
    setPwOpen(true)
  }

  const unlock = async (password, remember) => {
    await updateRoster({ action: 'check' }, password) // throws "Incorrect password." → shown in the modal
    storeRefreshPassword(password, remember)
    onUnlock?.()
    setPwOpen(false)
    setEditing(true)
  }

  const finish = () => {
    setEditing(false)
    setReplacing(null)
    setMessage(null)
    onDone?.(changed)
    setChanged(false)
  }

  const apply = async (change, key) => {
    setBusy(key)
    setMessage(null)
    try {
      await changeRoster(change, getRefreshPassword())
      // A lineup label changes the planner immediately; it doesn't require a new agent snapshot.
      if (change.action !== 'set-lineup') setChanged(true)
      setReplacing(null)
    } catch (e) {
      if (e.source === 'auth') {
        // Saved password no longer valid: forget it and ask again.
        clearRefreshPassword()
        setEditing(false)
        setPwError(e.message)
        setPwOpen(true)
      } else {
        setMessage(e.message)
      }
    } finally {
      setBusy(null)
    }
  }

  const onTeam = new Set(players?.map((p) => p.id))

  return (
    <aside className="card h-fit p-4 lg:sticky lg:top-20">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="label">My Team{players ? ` · ${players.length}` : ''}</h2>
        {players &&
          (editing ? (
            <button type="button" onClick={finish} className="inline-flex items-center gap-1 border border-accent px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-accent hover:bg-accent/10">
              <Check size={12} /> Done
            </button>
          ) : (
            <button type="button" onClick={startEditing} title="Add, edit or remove players" className="inline-flex items-center gap-1 border border-line px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted hover:border-accent hover:text-accent">
              <Pencil size={11} /> Edit
            </button>
          ))}
      </div>

      {error && !players && <p className="text-sm text-danger">Couldn't load your team: {error.message}</p>}
      {!players && !error && (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-6 animate-pulse bg-surface2" />)}
        </div>
      )}

      {players && !editing && (
        <ul>
          {players.length === 0 && <li className="text-sm text-muted">No players yet. Click Edit to add some.</li>}
          {players.map((p) => (
            <li key={p.id}>
              <div className="flex items-center gap-2 border-l-2 border-transparent px-2 py-1.5 hover:border-accent hover:bg-surface2">
                <Link to={`/player/${p.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-accent">
                  {p.name} <span className="font-mono text-[10px] text-muted">{teamOf(p.id)?.abbr ?? ''}</span>
                </Link>
                <span className={`shrink-0 border px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide ${p.lineup === 'bench' ? 'border-warn/50 text-warn' : 'border-accent/50 text-accent'}`}>
                  {p.lineup === 'bench' ? 'Bench' : 'Starting'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {players && editing && (
        <div className="space-y-1">
          {players.map((p) =>
            replacing === p.id ? (
              <PlayerSearch
                key={p.id}
                autoFocus
                initial={p.name}
                placeholder="Search replacement…"
                isOnTeam={(id) => onTeam.has(id) && id !== p.id}
                busy={busy === p.id}
                onPick={(r) => apply({ action: 'replace', id: p.id, player: { id: r.id } }, p.id)}
                onCancel={() => setReplacing(null)}
              />
            ) : (
              <div key={p.id} className="border border-line bg-surface2 p-2">
                <div className="flex items-center gap-1">
                  <span className={`min-w-0 flex-1 truncate text-sm font-medium ${busy === p.id ? 'opacity-40' : ''}`}>{p.name}</span>
                  <button type="button" className={iconBtn} title={`Replace ${p.name}`} disabled={!!busy} onClick={() => { setMessage(null); setReplacing(p.id) }}>
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className={`${iconBtn} hover:!text-danger`}
                    title={`Remove ${p.name}`}
                    disabled={!!busy}
                    onClick={() => apply({ action: 'remove', id: p.id }, p.id)}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1" role="group" aria-label={`${p.name} lineup status`}>
                  {['starting', 'bench'].map((lineup) => (
                    <button
                      key={lineup}
                      type="button"
                      aria-pressed={(p.lineup ?? 'starting') === lineup}
                      disabled={!!busy}
                      onClick={() => apply({ action: 'set-lineup', id: p.id, lineup }, p.id)}
                      className={`border px-1 py-1 font-mono text-[10px] font-bold uppercase tracking-wide disabled:opacity-40 ${(p.lineup ?? 'starting') === lineup ? (lineup === 'bench' ? 'border-warn bg-warn/10 text-warn' : 'border-accent bg-accent/10 text-accent') : 'border-line text-muted hover:text-fg'}`}
                    >
                      {lineup}
                    </button>
                  ))}
                </div>
              </div>
            ),
          )}

          <div className="pt-3">
            <p className="label mb-1.5 flex items-center gap-1">
              <Plus size={11} /> Add player
            </p>
            <PlayerSearch
              key={`add-${players.length}`}
              placeholder="Search NBA players…"
              isOnTeam={(id) => onTeam.has(id)}
              busy={busy === 'add'}
              onPick={(r) => apply({ action: 'add', player: { id: r.id } }, 'add')}
            />
          </div>

          {message && <p className="pt-2 text-[13px] text-danger">{message}</p>}
          <p className="pt-2 text-[11px] text-muted">Changes save immediately. Starting/Bench are planning labels here; update your fantasy platform separately. Game summaries update when you click Done.</p>
        </div>
      )}

      <PasswordModal
        isOpen={pwOpen}
        hint="to edit your team"
        error={pwError}
        onSubmit={unlock}
        onCancel={() => setPwOpen(false)}
      />
    </aside>
  )
}

/** Debounced ESPN player search with a results list. */
function PlayerSearch({ initial = '', placeholder, isOnTeam, busy, onPick, onCancel, autoFocus }) {
  const [q, setQ] = useState(initial)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const term = q.trim()
    setError(null)
    if (term.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      searchNbaPlayers(term)
        .then((d) => !cancelled && setResults(d.results))
        .catch((e) => !cancelled && setError(e.message))
        .finally(() => !cancelled && setLoading(false))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])

  return (
    <div className="border border-line bg-surface">
      <div className="flex items-center gap-1.5 px-2">
        <Search size={13} className="shrink-0 text-muted" />
        <input
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted"
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}
          autoFocus={autoFocus}
          disabled={busy}
        />
        {loading && <span className="spin-bar block h-3 w-[2px] bg-accent" />}
        {onCancel && (
          <button type="button" className={iconBtn} title="Cancel" onClick={onCancel} disabled={busy}>
            <X size={13} />
          </button>
        )}
      </div>
      {error && <p className="border-t border-line px-2 py-1.5 text-[12px] text-danger">{error}</p>}
      {results.length > 0 && (
        <ul className="max-h-56 overflow-auto border-t border-line">
          {results.map((r) => {
            const taken = isOnTeam(r.id)
            return (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={taken || busy}
                  onClick={() => onPick(r)}
                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-inherit"
                >
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{taken ? 'on team' : r.team ?? 'FA'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {busy && <p className="border-t border-line px-2 py-1.5 text-[12px] text-muted">Saving…</p>}
    </div>
  )
}
