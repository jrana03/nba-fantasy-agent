// deno-lint-ignore-file no-explicit-any
// Tools the agent can call to research games and players. Each returns compact JSON (not raw ESPN
// payloads) to keep token usage, and therefore OpenAI cost, low.
import type { AgentTool } from "./agent.ts";
import { getGameSummary, getPlayerNews } from "./espn.ts";

const TEAM_STATS = new Set([
  "fieldGoalsMade-fieldGoalsAttempted", "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
  "freeThrowsMade-freeThrowsAttempted", "totalRebounds", "assists", "steals", "blocks", "turnovers",
  "pointsInPaint", "fastBreakPoints", "turnoverPoints", "largestLead", "leadChanges",
]);

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function boxRows(s: any) {
  const rows: any[] = [];
  for (const team of s.boxscore?.players ?? []) {
    for (const group of team.statistics ?? []) {
      const labels: string[] = group.labels ?? group.names ?? [];
      for (const a of group.athletes ?? []) {
        rows.push({
          id: String(a.athlete?.id),
          name: a.athlete?.displayName,
          team: team.team?.abbreviation,
          starter: !!a.starter,
          didNotPlay: !!a.didNotPlay,
          reason: a.reason ?? null,
          stats: Object.fromEntries(labels.map((l, i) => [l, a.stats?.[i]])),
        });
      }
    }
  }
  return rows;
}

const statLine = (r: any) =>
  `${r.name} (${r.team}): ${r.stats.PTS} PTS, ${r.stats.REB} REB, ${r.stats.AST} AST, ${r.stats.STL} STL, ` +
  `${r.stats.BLK} BLK, ${r.stats["3PT"]} 3PT, ${r.stats.FG} FG, ${r.stats.TO} TO in ${r.stats.MIN} min`;

/** Builds the tool set. ESPN game summaries are memoized so repeated tool calls don't refetch. */
export function makeGameTools(): AgentTool[] {
  const summaries = new Map<string, Promise<any>>();
  const summary = (id: string) => {
    if (!summaries.has(id)) summaries.set(id, getGameSummary(id));
    return summaries.get(id)!;
  };

  return [
    {
      name: "get_game_overview",
      description:
        "Final score, quarter-by-quarter scoring, venue, key team stats, top performers, highlight headlines and recap for an NBA game.",
      parameters: {
        type: "object",
        properties: { event_id: { type: "string" } },
        required: ["event_id"],
      },
      run: async ({ event_id }) => {
        const s = await summary(event_id);
        const comp = s.header?.competitions?.[0] ?? {};
        const rows = boxRows(s).filter((r) => !r.didNotPlay && r.stats.PTS != null);
        return {
          seasonType: s.header?.season?.type === 1 ? "Preseason" : comp.type?.abbreviation ?? "Regular Season",
          date: comp.date,
          status: comp.status?.type?.detail,
          venue: s.gameInfo?.venue?.fullName,
          attendance: s.gameInfo?.attendance,
          teams: (comp.competitors ?? []).map((c: any) => ({
            team: c.team?.displayName,
            homeAway: c.homeAway,
            score: c.score,
            winner: c.winner,
            quarters: (c.linescores ?? []).map((l: any) => l.displayValue),
            record: c.record?.[0]?.summary ?? null,
          })),
          teamStats: (s.boxscore?.teams ?? []).map((t: any) => ({
            team: t.team?.abbreviation,
            stats: Object.fromEntries(
              (t.statistics ?? []).filter((x: any) => TEAM_STATS.has(x.name)).map((x: any) => [x.label ?? x.name, x.displayValue]),
            ),
          })),
          topPerformers: rows
            .sort((a, b) => Number(b.stats.PTS) - Number(a.stats.PTS))
            .slice(0, 6)
            .map(statLine),
          seasonSeries: s.seasonseries?.[0]?.summary ?? null,
          highlightVideos: (s.videos ?? []).slice(0, 6).map((v: any) => v.headline),
          recap: s.article
            ? { headline: s.article.headline, text: stripHtml(s.article.story ?? "").slice(0, 2500) }
            : null,
        };
      },
    },
    {
      name: "get_player_box_score",
      description: "A player's full box score line for a game (or whether they did not play and why).",
      parameters: {
        type: "object",
        properties: { event_id: { type: "string" }, player_id: { type: "string", description: "ESPN athlete id" } },
        required: ["event_id", "player_id"],
      },
      run: async ({ event_id, player_id }) => {
        const row = boxRows(await summary(event_id)).find((r) => r.id === String(player_id));
        return row ?? { note: "Player not listed in this game's box score (likely inactive or not with the team)." };
      },
    },
    {
      name: "get_player_plays",
      description: "Play-by-play entries involving a specific player in a game (shots, assists, blocks, fouls, etc.).",
      parameters: {
        type: "object",
        properties: { event_id: { type: "string" }, player_id: { type: "string" } },
        required: ["event_id", "player_id"],
      },
      run: async ({ event_id, player_id }) => {
        const s = await summary(event_id);
        const plays = (s.plays ?? []).filter((p: any) =>
          (p.participants ?? []).some((x: any) => String(x.athlete?.id) === String(player_id)),
        );
        return plays.slice(-60).map((p: any) => `Q${p.period?.number} ${p.clock?.displayValue} | ${p.text} | ${p.awayScore}-${p.homeScore}`);
      },
    },
    {
      name: "get_closing_plays",
      description: "Scoring plays from the final 5 minutes of the 4th quarter and any overtime — use to describe how the game was decided.",
      parameters: {
        type: "object",
        properties: { event_id: { type: "string" } },
        required: ["event_id"],
      },
      run: async ({ event_id }) => {
        const s = await summary(event_id);
        const toSec = (c: string) => {
          const [m, sec] = String(c ?? "0").split(":");
          return sec === undefined ? Number(m) : Number(m) * 60 + Number(sec);
        };
        return (s.plays ?? [])
          .filter((p: any) => p.scoringPlay && (p.period?.number > 4 || (p.period?.number === 4 && toSec(p.clock?.displayValue) <= 300)))
          .slice(-40)
          .map((p: any) => `Q${p.period?.number} ${p.clock?.displayValue} | ${p.text} | ${p.awayScore}-${p.homeScore}`);
      },
    },
    {
      name: "get_player_news",
      description: "Latest fantasy news blurbs for a player (injuries, rest, role and minutes updates).",
      parameters: {
        type: "object",
        properties: { player_id: { type: "string" } },
        required: ["player_id"],
      },
      run: ({ player_id }) => getPlayerNews(String(player_id), 5),
    },
  ];
}
