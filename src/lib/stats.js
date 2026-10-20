// The most common fantasy categories (standard 9-cat) plus minutes. "Overall" is fantasy points
// with ESPN's default points-league scoring, which rolls every category into one number.
export const STAT_OPTIONS = [
  { key: 'fpts', label: 'Overall (Fantasy Pts)', short: 'FPTS' },
  { key: 'pts', label: 'Points', short: 'PTS' },
  { key: 'reb', label: 'Rebounds', short: 'REB' },
  { key: 'ast', label: 'Assists', short: 'AST' },
  { key: 'stl', label: 'Steals', short: 'STL' },
  { key: 'blk', label: 'Blocks', short: 'BLK' },
  { key: 'fg3m', label: '3-Pointers Made', short: '3PM' },
  { key: 'fgPct', label: 'Field Goal %', short: 'FG%', pct: true },
  { key: 'ftPct', label: 'Free Throw %', short: 'FT%', pct: true },
  { key: 'tov', label: 'Turnovers', short: 'TO' },
  { key: 'min', label: 'Minutes', short: 'MIN' },
]

export const FPTS_FORMULA =
  'ESPN standard scoring: PTS +1, 3PM +1, FGM +2, FGA −1, FTM +1, FTA −1, REB +1, AST +2, STL +4, BLK +4, TO −2'

export const fmt = (v, pct) => (v == null ? '–' : pct ? `${Number(v).toFixed(1)}%` : Number(v).toFixed(1))
