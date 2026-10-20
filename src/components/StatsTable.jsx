import { STAT_OPTIONS, fmt } from '../lib/stats.js'

const AVG_COLS = [
  ['gp', 'GP'], ['min', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'],
  ['fg3m', '3PM'], ['fgPct', 'FG%', true], ['ftPct', 'FT%', true], ['tov', 'TO'], ['fpts', 'FPTS'],
]

// Game log columns: [stat key (for highlighting) or null, header, cell renderer].
const GAME_COLS = [
  [null, 'Date', (g) => new Date(g.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })],
  [null, 'Opp', (g) => `${g.atVs} ${g.opponent}`],
  [null, 'Result', (g) => `${g.result} ${g.score}`],
  ['min', 'MIN', (g) => g.min],
  ['pts', 'PTS', (g) => g.pts],
  ['reb', 'REB', (g) => g.reb],
  ['ast', 'AST', (g) => g.ast],
  ['stl', 'STL', (g) => g.stl],
  ['blk', 'BLK', (g) => g.blk],
  ['fg3m', '3PM', (g) => g.fg3m],
  [null, 'FG', (g) => `${g.fgm}-${g.fga}`],
  ['fgPct', 'FG%', (g) => fmt(g.fgPct, true)],
  [null, 'FT', (g) => `${g.ftm}-${g.fta}`],
  ['ftPct', 'FT%', (g) => fmt(g.ftPct, true)],
  ['tov', 'TO', (g) => g.tov],
  ['fpts', 'FPTS', (g) => g.fpts],
]

const LOWER_IS_BETTER = new Set(['tov'])

const th = 'px-3 py-2 text-right font-semibold first:text-left'
const td = 'px-3 py-2 text-right font-mono text-[13px] tabular-nums first:text-left'
const selCol = 'bg-accent/10' // tint for the selected stat's column

/** Did this game beat the player's historical average for `key`? (null when there's nothing to compare) */
function beatsAverage(g, key, hist) {
  const v = g[key]
  const avg = hist?.[key]
  if (v == null || avg == null) return null
  return LOWER_IS_BETTER.has(key) ? v <= avg : v >= avg
}

export default function StatsTable({ data, statKey }) {
  const hist = data.historical
  const opt = STAT_OPTIONS.find((o) => o.key === statKey)
  const avgRows = [
    { label: `${data.seasonLabel} average`, row: data.seasonAverages },
    { label: `Historical average${hist ? ` (${hist.seasons})` : ''}`, row: hist },
  ]
  const games = [...data.games].reverse()

  return (
    <section className="card overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="font-mono text-lg font-bold">Statistics · {data.seasonLabel}</h2>
        <p className="text-sm text-muted">
          Regular season, per game. Highlighted: <span className="font-mono font-semibold text-accent">{opt?.short}</span>
          {hist && (
            <>
              {' '}— <span className="text-accent">green</span> = {LOWER_IS_BETTER.has(statKey) ? 'at or below' : 'at or above'} the
              historical average
            </>
          )}
          .
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface2 font-mono text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className={th}></th>
              {AVG_COLS.map(([k, l]) => (
                <th key={k} className={`${th} ${k === statKey ? `${selCol} text-accent` : ''}`}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {avgRows.map(({ label, row }) => (
              <tr key={label} className="border-t border-line">
                <td className={`${td} whitespace-nowrap font-semibold text-fg`}>{label}</td>
                {row
                  ? AVG_COLS.map(([k, , pct]) => (
                      <td key={k} className={`${td} ${k === statKey ? `${selCol} font-bold text-accent` : ''}`}>
                        {k === 'gp' ? row.gp : fmt(row[k], pct)}
                      </td>
                    ))
                  : <td colSpan={AVG_COLS.length} className={`${td} !text-left text-muted`}>No games yet</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="label px-5 pb-2 pt-6">Game log</h3>
      {games.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">No regular-season games played yet this season.</p>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface2 font-mono text-[11px] uppercase tracking-wider text-muted">
              <tr>
                {GAME_COLS.map(([k, h]) => (
                  <th key={h} className={`${th} ${k && k === statKey ? `${selCol} text-accent` : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.eventId} className="border-t border-line hover:bg-surface2">
                  {GAME_COLS.map(([k, h, render]) => {
                    let cls = ''
                    if (h === 'Result') cls = g.result === 'W' ? 'text-accent' : 'text-danger'
                    if (k && k === statKey) cls = `${selCol} font-bold ${beatsAverage(g, k, hist) ? 'text-accent' : 'text-fg'}`
                    return (
                      <td key={h} className={`${td} ${h === 'Date' || h === 'Opp' || h === 'Result' ? 'whitespace-nowrap' : ''} ${cls}`}>
                        {render(g)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
