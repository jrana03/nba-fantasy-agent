// deno-lint-ignore-file no-explicit-any
// Fantasy stat math. Categories are the standard 9-cat set (PTS, REB, AST, STL, BLK, 3PM, FG%, FT%, TO)
// plus minutes. "Overall" uses ESPN's default points-league scoring.

export type Totals = {
  min: number; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number;
};

/** ESPN standard points scoring: PTS+1, 3PM+1, FGM+2, FGA-1, FTM+1, FTA-1, REB+1, AST+2, STL+4, BLK+4, TO-2 */
export function fantasyPoints(t: Totals): number {
  return t.pts + t.fg3m + 2 * t.fgm - t.fga + t.ftm - t.fta + t.reb + 2 * t.ast + 4 * t.stl + 4 * t.blk - 2 * t.tov;
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const pct = (made: number, att: number) => (att > 0 ? round((made / att) * 100, 1) : null);

/** Per-game values for one game's (or one game's worth of) totals. */
export function perGame(t: Totals, gp = 1) {
  if (gp <= 0) return null;
  return {
    gp,
    fpts: round(fantasyPoints(t) / gp),
    min: round(t.min / gp),
    pts: round(t.pts / gp),
    reb: round(t.reb / gp),
    ast: round(t.ast / gp),
    stl: round(t.stl / gp),
    blk: round(t.blk / gp),
    tov: round(t.tov / gp),
    fg3m: round(t.fg3m / gp),
    fgm: round(t.fgm / gp),
    fga: round(t.fga / gp),
    ftm: round(t.ftm / gp),
    fta: round(t.fta / gp),
    fgPct: pct(t.fgm, t.fga),
    ftPct: pct(t.ftm, t.fta),
    fg3Pct: pct(t.fg3m, t.fg3a),
  };
}

export const emptyTotals = (): Totals => ({
  min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
});

export function addTotals(a: Totals, b: Totals): Totals {
  const out = emptyTotals();
  for (const k of Object.keys(out) as (keyof Totals)[]) out[k] = a[k] + b[k];
  return out;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const madeAtt = (v: unknown): [number, number] => {
  const [m, a] = String(v ?? "0-0").split("-");
  return [num(m), num(a)];
};

/** Reads a stat row using ESPN's parallel `names` array. Works for gamelog and season-total rows. */
export function totalsFromRow(names: string[], stats: string[]): Totals {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const i = names.indexOf(k);
      if (i >= 0) return stats[i];
    }
    return undefined;
  };
  const [fgm, fga] = madeAtt(get("fieldGoalsMade-fieldGoalsAttempted"));
  const [fg3m, fg3a] = madeAtt(get("threePointFieldGoalsMade-threePointFieldGoalsAttempted"));
  const [ftm, fta] = madeAtt(get("freeThrowsMade-freeThrowsAttempted"));
  return {
    min: num(get("minutes")),
    pts: num(get("points")),
    reb: num(get("totalRebounds", "rebounds")),
    ast: num(get("assists")),
    stl: num(get("steals")),
    blk: num(get("blocks")),
    tov: num(get("turnovers")),
    fgm, fga, fg3m, fg3a, ftm, fta,
  };
}

/**
 * ESPN's career stats list one row per team per season, plus a "Totals" row (no teamId) when a player
 * was traded mid-season. Returns one row per season year.
 */
export function rowsBySeason(category: any): Map<number, any> {
  const bySeason = new Map<number, any[]>();
  for (const row of category?.statistics ?? []) {
    const y = Number(row.season?.year);
    if (!bySeason.has(y)) bySeason.set(y, []);
    bySeason.get(y)!.push(row);
  }
  const out = new Map<number, any>();
  for (const [y, rows] of bySeason) out.set(y, rows.find((r) => !r.teamId) ?? rows[0]);
  return out;
}
