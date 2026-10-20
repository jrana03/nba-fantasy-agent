// deno-lint-ignore-file no-explicit-any
// GET /nba-player?id=<ESPN id>&season=<end year> → player info, regular-season game log for the season,
// season averages, and career ("historical") per-game averages from all completed seasons.
import { currentSeasonYear, getAthlete, getCareerStats, getGamelog, seasonLabel } from "../_shared/espn.ts";
import { addTotals, emptyTotals, perGame, rowsBySeason, totalsFromRow } from "../_shared/stats.ts";
import { json, withHttp } from "../_shared/http.ts";

function parseGames(gl: any) {
  if (!gl?.seasonTypes) return [];
  const seen = new Set<string>();
  const games: any[] = [];
  for (const st of gl.seasonTypes) {
    if (!/regular season/i.test(st.displayName ?? "")) continue;
    for (const cat of st.categories ?? []) {
      for (const e of cat.events ?? []) {
        if (seen.has(e.eventId)) continue;
        seen.add(e.eventId);
        const meta = gl.events?.[e.eventId] ?? {};
        const totals = totalsFromRow(gl.names ?? [], e.stats ?? []);
        games.push({
          eventId: e.eventId,
          date: meta.gameDate,
          opponent: meta.opponent?.abbreviation ?? null,
          atVs: meta.atVs ?? null,
          result: meta.gameResult ?? null,
          score: meta.score ?? null,
          totals,
          ...perGame(totals, 1),
        });
      }
    }
  }
  return games.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

function careerHistory(career: any, current: number) {
  const avg = career?.categories?.find((c: any) => c.name === "averages");
  const tot = career?.categories?.find((c: any) => c.name === "totals");
  if (!avg || !tot) return { seasons: [] as number[], historical: null };

  const avgRows = rowsBySeason(avg);
  const totRows = rowsBySeason(tot);
  const gpIdx = avg.names.indexOf("gamesPlayed");
  const minIdx = avg.names.indexOf("avgMinutes");

  let sum = emptyTotals();
  let gp = 0;
  const used: number[] = [];
  for (const [year, row] of avgRows) {
    const totRow = totRows.get(year);
    if (year >= current || !totRow) continue;
    const g = Number(row.stats[gpIdx]) || 0;
    if (!g) continue;
    const t = totalsFromRow(tot.names, totRow.stats);
    t.min = (Number(row.stats[minIdx]) || 0) * g;
    sum = addTotals(sum, t);
    gp += g;
    used.push(year);
  }
  used.sort();
  return {
    seasons: [...avgRows.keys()],
    historical: gp
      ? {
          ...perGame(sum, gp),
          seasons: used.length === 1 ? seasonLabel(used[0]) : `${seasonLabel(used[0])} to ${seasonLabel(used.at(-1)!)}`,
        }
      : null,
  };
}

export const handler = withHttp(async (req) => {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (!id || !/^\d+$/.test(id)) return json({ error: "Missing or invalid ?id=" }, 400);
  const current = currentSeasonYear();
  const season = Number(params.get("season")) || current;

  const [athlete, career, gamelog] = await Promise.all([
    getAthlete(id),
    getCareerStats(id).catch(() => null),
    getGamelog(id, season).catch(() => null),
  ]);

  const { seasons, historical } = careerHistory(career, current);
  const games = parseGames(gamelog);
  const seasonTotals = games.reduce((acc, g) => addTotals(acc, g.totals), emptyTotals());

  const allSeasons = [...new Set([current, ...seasons])].sort((a, b) => b - a);
  return json(
    {
      player: athlete,
      season,
      seasonLabel: seasonLabel(season),
      isCurrent: season === current,
      seasons: allSeasons.map((y) => ({ year: y, label: seasonLabel(y), current: y === current })),
      games: games.map(({ totals: _t, ...g }) => g),
      seasonAverages: games.length ? perGame(seasonTotals, games.length) : null,
      historical,
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
});
