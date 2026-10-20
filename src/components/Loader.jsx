import { useEffect, useState } from 'react'

/** Rotating bar + elapsed-seconds timer. */
export default function Loader({ label, hint }) {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [])

  const seconds = Math.floor((now - start) / 1000)
  return (
    <div className="card flex items-center gap-4 p-5" role="status" aria-live="polite">
      <span className="flex h-6 w-6 items-center justify-center">
        <span className="spin-bar block h-5 w-[3px] bg-accent" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm text-fg">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <span className="font-mono text-lg font-bold tabular-nums text-accent">{seconds}s</span>
    </div>
  )
}
