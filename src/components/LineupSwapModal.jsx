import { useEffect, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'

export default function LineupSwapModal({ benchPlayer, starters, teamOf, onConfirm, onCancel }) {
  const [starterId, setStarterId] = useState('')

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-title"
        className="card w-full max-w-md p-5 shadow-2xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <ArrowLeftRight size={22} className="mb-3 text-accent" />
        <h2 id="swap-title" className="font-mono text-lg font-bold">Swap into Starting</h2>
        <p className="mt-1 text-sm text-muted">
          Choose a starter to move to Bench in exchange for <span className="font-semibold text-fg">{benchPlayer.name}</span>.
        </p>

        {starters.length === 0 ? (
          <p className="mt-5 border border-line bg-surface2 p-3 text-sm text-muted">
            No starters to swap with. Use My Team → Edit to change this player's status.
          </p>
        ) : (
          <div className="mt-5 max-h-64 space-y-1 overflow-y-auto" role="radiogroup" aria-label="Choose a starter to move to Bench">
            {starters.map((player, index) => (
              <label
                key={player.id}
                className={`flex cursor-pointer items-center gap-3 border p-3 text-sm hover:border-accent ${starterId === player.id ? 'border-accent bg-accent/10' : 'border-line bg-surface2'}`}
              >
                <input
                  type="radio"
                  name="starter-to-bench"
                  value={player.id}
                  checked={starterId === player.id}
                  onChange={() => setStarterId(player.id)}
                  autoFocus={index === 0}
                  className="accent-accent"
                />
                <span className="min-w-0 flex-1 font-medium">{player.name}</span>
                <span className="font-mono text-[11px] text-muted">{teamOf(player.id)?.abbr ?? ''}</span>
              </label>
            ))}
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 border border-line px-3 py-2 text-sm font-medium text-muted hover:text-fg">
            Cancel
          </button>
          <button
            type="button"
            disabled={!starterId}
            onClick={() => onConfirm(starterId)}
            className="flex-1 border border-accent bg-accent px-3 py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Swap players
          </button>
        </div>
      </div>
    </div>
  )
}
