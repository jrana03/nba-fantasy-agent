import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { getPlayer } from '../lib/api.js'
import { rosterName, useRoster } from '../lib/roster.js'
import PerformanceChart from '../components/PerformanceChart.jsx'
import StatsTable from '../components/StatsTable.jsx'
import Loader from '../components/Loader.jsx'
import { STAT_OPTIONS } from '../lib/stats.js'

export default function Player() {
  const { id } = useParams()
  useRoster() // for rosterName (accented display names)
  const [season, setSeason] = useState(null) // null = current season (API default)
  const [stat, setStat] = useState('fpts')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSeason(null)
    setData(null)
  }, [id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getPlayer(id, season)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, season])

  const p = data?.player
  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted hover:text-accent">
        <ArrowLeft size={14} /> Back to my team
      </Link>

      {error && (
        <div className="flex gap-3 border border-danger/50 bg-danger/10 p-5 text-sm text-danger">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{error.message}</p>
            {error.reason && <p className="mt-1 text-fg/80">{error.reason}</p>}
          </div>
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-4 border-l-2 border-l-accent p-5">
        {p?.headshot ? (
          <img src={p.headshot} alt="" className="h-20 w-28 bg-surface2 object-cover object-top" />
        ) : (
          <div className="h-20 w-28 animate-pulse bg-surface2" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-mono text-2xl font-extrabold">{rosterName(id, p?.name ?? '…')}</h1>
          {p && (
            <p className="text-muted">
              {p.team?.name ?? 'Free agent'} · {p.position} {p.jersey ? `· #${p.jersey}` : ''}
            </p>
          )}
          {p?.injury && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-warn">
              <AlertTriangle size={14} /> {p.injury.fantasyStatus ?? p.injury.status}: {p.injury.shortComment}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <label>
            <span className="label mb-1 block">Statistic</span>
            <select className="select" value={stat} onChange={(e) => setStat(e.target.value)}>
              {STAT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label mb-1 block">Season</span>
            <select
              className="select"
              value={season ?? data?.seasons?.find((s) => s.current)?.year ?? ''}
              onChange={(e) => setSeason(Number(e.target.value))}
              disabled={!data}
            >
              {(data?.seasons ?? []).map((s) => (
                <option key={s.year} value={s.year}>
                  {s.label} {s.current ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {data && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <PerformanceChart data={data} statKey={stat} />
          <StatsTable data={data} statKey={stat} />
        </div>
      )}
      {!data && !error && <Loader label="Loading player stats…" />}
    </div>
  )
}
