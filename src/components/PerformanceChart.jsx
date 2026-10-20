import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FPTS_FORMULA, STAT_OPTIONS, fmt } from '../lib/stats.js'
import { useTheme } from '../lib/theme.jsx'

const monthLabel = (t) => new Date(t).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })

/** Regular season runs Oct → Apr. The axis is fixed to those months so it never shifts between seasons/stats. */
function seasonWindow(seasonYear, games) {
  const times = games.map((g) => Date.parse(g.date))
  // Extend only for unusual seasons (e.g. 2019-20 bubble, 2020-21 Dec–May) so no games are cut off.
  const lo = Math.min(Date.UTC(seasonYear - 1, 9, 1), ...times)
  const hi = Math.max(Date.UTC(seasonYear, 3, 30), ...times)
  const ticks = []
  const d = new Date(lo)
  for (let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); t <= hi; ) {
    if (t >= lo) ticks.push(t)
    const m = new Date(t)
    t = Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)
  }
  return { lo, hi, ticks }
}

export default function PerformanceChart({ data, statKey }) {
  const { colors } = useTheme()
  const opt = STAT_OPTIONS.find((o) => o.key === statKey)
  const hist = data.historical?.[statKey] ?? null
  const { lo, hi, ticks } = seasonWindow(data.season, data.games)

  // Historical average is a flat line across the whole season; the stat line only exists where games exist.
  const points = [
    { x: lo, hist },
    ...data.games.map((g) => ({ x: Date.parse(g.date), value: g[statKey], hist, game: g })),
    { x: hi, hist },
  ]

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-mono text-lg font-bold">
            {opt.label} by game · {data.seasonLabel}
          </h2>
          <p className="text-sm text-muted">
            Historical average{data.historical ? ` (${data.historical.seasons}, ${data.historical.gp} games)` : ''}:{' '}
            <span className="font-mono font-semibold text-fg">{hist == null ? 'no previous seasons' : fmt(hist, opt.pct)}</span>
          </p>
        </div>
        {statKey === 'fpts' && <p className="max-w-md font-mono text-[11px] text-muted">{FPTS_FORMULA}</p>}
      </div>

      <div className="relative h-80">
        {data.games.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="border border-line bg-surface px-3 py-1.5 font-mono text-xs text-muted">
              No regular-season games played yet in {data.seasonLabel}
            </span>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
            <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              scale="time"
              domain={[lo, hi]}
              ticks={ticks}
              tickFormatter={monthLabel}
              stroke={colors.muted}
              fontSize={12}
            />
            <YAxis
              stroke={colors.muted}
              fontSize={12}
              domain={opt.pct ? [0, 100] : [0, (max) => Math.max(5, Math.ceil((max * 1.15) / 5) * 5)]}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip opt={opt} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              name={`${opt.short} (per game)`}
              dataKey="value"
              stroke={colors.accent}
              strokeWidth={2}
              dot={{ r: 2.5, fill: colors.accent, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              name="Historical average"
              dataKey="hist"
              stroke={colors.muted}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function ChartTooltip({ active, payload, opt }) {
  const g = payload?.[0]?.payload?.game
  if (!active || !g) return null
  return (
    <div className="border border-line bg-surface px-3 py-2 font-mono text-xs shadow-xl">
      <p className="font-semibold text-fg">
        {new Date(g.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {g.atVs} {g.opponent}{' '}
        <span className={g.result === 'W' ? 'text-accent' : 'text-danger'}>{g.result} {g.score}</span>
      </p>
      <p className="mt-1 text-accent">{opt.short}: {fmt(g[opt.key], opt.pct)}</p>
      <p className="text-muted">Hist. avg: {fmt(payload[0].payload.hist, opt.pct)}</p>
      <p className="mt-1 text-muted">
        {g.pts} PTS · {g.reb} REB · {g.ast} AST · {g.stl} STL · {g.blk} BLK · {g.min} MIN
      </p>
    </div>
  )
}
