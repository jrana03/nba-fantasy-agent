// deno-lint-ignore-file no-explicit-any
// GET /nba-home → roster, most recent games (with agent-written summaries) and upcoming games
// (with agent-written availability notes) for teams that have a player on my fantasy team.
import { getRoster, type RosterPlayer } from "../_shared/roster.ts";
import { type Athlete, currentSeasonYear, type Game, getAthlete, getTeamSchedule } from "../_shared/espn.ts";
import { agentEnabled, agentStatus, runAgent } from "../_shared/agent.ts";
import { usage } from "../_shared/usage.ts";
import { makeGameTools } from "../_shared/gameTools.ts";
import { cached, getValue, setValue, sha1 } from "../_shared/cache.ts";
import { json, withHttp } from "../_shared/http.ts";
import { requirePassword } from "../_shared/auth.ts";

type Player = { id: string; name: string } & Partial<Omit<Athlete, "id" | "name">>;

const GAME_SUMMARY_SYSTEM = `You are the research agent inside a fantasy NBA manager's web app.
You investigate a finished NBA game using your tools, then write a concise update.

Process:
1. Call get_game_overview first.
2. Call get_player_box_score for EVERY roster player listed by the user.
3. Use get_closing_plays, get_player_plays or get_player_news when they add useful context
   (how the game was decided, big moments, injuries, minutes or role changes).

Rules:
- Only state facts found in tool results. Never invent numbers.
- If a roster player did not play, say so and give the reason if one is available.
- For preseason games, mention that the stats are preseason and minutes may be limited.
- Bullets are plain text (no markdown), at most ~25 words each.

Return JSON exactly in this shape:
{"overall": ["4-6 bullets: result and margin, how the game swung (runs, quarters, closing stretch), standout performers, notable team stats or highlights"],
 "players": [{"id": "<ESPN id>", "name": "<name>", "bullets": ["2-4 bullets: stat line with the fantasy categories (MIN, PTS, REB, AST, STL, BLK, 3PM, FG%, FT%, TO), efficiency, role/usage, highlight plays, injury news"]}]}`;

const AVAILABILITY_SYSTEM = `You are the injury and availability scout agent inside a fantasy NBA manager's web app.
For each roster player with an upcoming game, decide whether anything could affect whether, or how much,
they play in THAT game: injury designations (Questionable, Doubtful, Out, GTD, Day-To-Day), rest,
minutes restrictions, suspensions, personal absences.

You are given the current injury report entries. Call get_player_news for any player whose entry is
ambiguous, may be stale relative to the game date, or to check for rest / minutes-limit news.
Only include players where something actually affects availability for their upcoming game.
Do not invent information.

Return JSON: {"notes": [{"id": "<ESPN id>", "status": "short label, e.g. Questionable, Out, GTD, Rest, Minutes limit", "note": "one sentence, at most 30 words"}]}`;

/** NBA game days are ET-based; a 10:30pm ET tip is still "that day". */
const etDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET";

async function summarizeGame(game: Game, players: Player[], force: boolean) {
  if (!agentEnabled()) return { error: "OPENAI_API_KEY is not set, so the agent is disabled.", code: "missing_key" };
  const ids = players.map((p) => p.id).sort().join(",");
  return await cached(`game:${game.id}:${ids}:v1`, null, () =>
    runAgent<{ overall: string[]; players: { id: string; name: string; bullets: string[] }[] }>({
      system: GAME_SUMMARY_SYSTEM,
      tools: makeGameTools(),
      maxSteps: 10,
      user: [
        `Game event_id: ${game.id}`,
        `Matchup: ${game.away.name} at ${game.home.name} (${game.seasonType}), ${fmtDate(game.date)}`,
        `Roster players on these teams:`,
        ...players.map((p) => `- ${p.name} (id ${p.id}, ${p.team?.abbr})`),
      ].join("\n"),
    }), force);
}

async function availabilityNotes(upcoming: { game: Game; players: Player[] }[], force: boolean) {
  const fallback = () =>
    Object.fromEntries(
      upcoming.flatMap(({ players }) =>
        players
          .filter((p) => p.injury)
          .map((p) => [p.id, { status: p.injury!.fantasyStatus ?? p.injury!.status, note: p.injury!.shortComment }]),
      ),
    );
  if (!agentEnabled() || upcoming.length === 0) return fallback();

  const brief = upcoming.map(({ game, players }) => ({
    game: `${game.away.abbr} at ${game.home.abbr}, ${fmtDate(game.date)} (${game.seasonType})`,
    players: players.map((p) => ({ id: p.id, name: p.name, team: p.team?.abbr, injuryReport: p.injury })),
  }));
  // Keyed on the games + injury report; the 3h TTL makes each new day's run re-check the news.
  const key = `availability:${await sha1(JSON.stringify(brief))}:v1`;
  try {
    const res = await cached(key, 3 * 60 * 60 * 1000, () =>
      runAgent<{ notes: { id: string; status: string; note: string }[] }>({
        system: AVAILABILITY_SYSTEM,
        tools: makeGameTools().filter((t) => t.name === "get_player_news"),
        maxSteps: 6,
        user: `Today is ${fmtDate(new Date().toISOString())}.\nUpcoming games:\n${JSON.stringify(brief, null, 1)}`,
      }), force);
    return Object.fromEntries((res.notes ?? []).map((n) => [String(n.id), { status: n.status, note: n.note }]));
  } catch (err) {
    console.error("availability agent failed:", err);
    return fallback();
  }
}

/** Builds the full home page payload. `force` re-runs the agent instead of using cached summaries. */
async function buildHome(roster: RosterPlayer[], force: boolean) {
  const athletes = await Promise.all(roster.map((p) => getAthlete(p.id).catch(() => null)));
  if (athletes.length && athletes.every((a) => a === null)) {
    throw new Error(`ESPN player lookups all failed: ${usage().espn.lastError ?? "no response"}`);
  }
  const players: Player[] = roster.map((p, i) => ({ ...(athletes[i] ?? {}), id: p.id, name: p.name }));

  const teamIds = [...new Set(players.map((p) => p.team?.id).filter(Boolean))] as string[];
  const schedules = await Promise.all(teamIds.map((id) => getTeamSchedule(id).catch(() => [] as Game[])));

  // Most recent finished game and next unfinished game for each team (deduped across teams).
  const recent = new Map<string, Game>();
  const upcoming = new Map<string, Game>();
  const byDate = (a: Game, b: Game) => Date.parse(a.date) - Date.parse(b.date);
  for (const games of schedules) {
    const done = games.filter((g) => g.status.completed).sort(byDate).at(-1);
    const next = games.filter((g) => !g.status.completed && g.status.state !== "post").sort(byDate)[0];
    if (done) recent.set(done.id, done);
    if (next) upcoming.set(next.id, next);
  }
  const playersIn = (g: Game) => players.filter((p) => p.team && (p.team.id === g.home.id || p.team.id === g.away.id));

  // Only the latest game day (several games if my players played on that same day).
  const recentSorted = [...recent.values()].sort(byDate).reverse();
  const latestDay = recentSorted[0] ? etDay(recentSorted[0].date) : null;
  const recentGames = await Promise.all(
    recentSorted.filter((g) => etDay(g.date) === latestDay).map(async (game) => {
      const inGame = playersIn(game);
      const summary = await summarizeGame(game, inGame, force).catch((err) => ({
        error: String(err?.message ?? err),
        code: err?.code ?? "agent_error",
      }));
      return { ...game, players: inGame.map((p) => ({ id: p.id, name: p.name, team: p.team?.abbr })), summary };
    }),
  );

  const upcomingList = [...upcoming.values()].sort(byDate).map((game) => ({ game, players: playersIn(game) }));
  const notes = await availabilityNotes(upcomingList, force);
  const upcomingGames = upcomingList.map(({ game, players: inGame }) => ({
    ...game,
    players: inGame.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team?.abbr,
      injury: p.injury ? { status: p.injury.status, fantasyStatus: p.injury.fantasyStatus, comment: p.injury.shortComment } : null,
      availability: (notes as Record<string, unknown>)[p.id] ?? null,
    })),
  }));

  return {
    generatedAt: new Date().toISOString(),
    season: currentSeasonYear(),
    agent: await agentStatus(),
    latestGameDay: latestDay,
    players: players.map((p) => ({ id: p.id, name: p.name, team: p.team, position: p.position, headshot: p.headshot })),
    recentGames,
    upcomingGames,
  };
}

/**
 * GET /nba-home           → today's snapshot (the agent runs at most once per ET day)
 * GET /nba-home?refresh=1 → re-run the agent now and replace today's snapshot (needs x-refresh-password)
 * GET /nba-home?refresh=1&check=1 → only verify the refresh password
 */
export const handler = withHttp(async (req) => {
  const params = new URL(req.url).searchParams;
  const refresh = params.get("refresh") === "1";
  const day = etDay(new Date().toISOString());
  const roster = await getRoster();
  // Keyed on the roster too, so editing the team produces a fresh snapshot on the next load.
  const key = `home-snapshot:${day}:${await sha1(roster.map((p) => p.id).join(","))}:v2`;
  const noStore = { "Cache-Control": "no-store" };

  if (refresh) {
    // Refresh costs OpenAI credits, so it's password-protected server-side (the password never ships to the browser).
    const denied = requirePassword(req);
    if (denied) return denied;
    // &check=1 only validates the password (instant), so the unlock dialog doesn't wait on the agent run.
    if (params.get("check") === "1") return json({ ok: true }, 200, noStore);
  } else {
    const snapshot = await getValue<Record<string, unknown>>(key);
    if (snapshot) {
      usage().cache.hits++;
      return json({ ...snapshot, snapshot: { day, fromCache: true } }, 200, noStore);
    }
  }

  const body = await buildHome(roster, refresh);
  // Don't pin a failed run for the whole day: if the agent errored, the next load tries again.
  const failed = body.agent.state === "error" || body.recentGames.some((g) => "error" in (g.summary ?? {}));
  if (!failed) await setValue(key, body);
  return json({ ...body, snapshot: { day, fromCache: false, saved: !failed } }, 200, noStore);
});
