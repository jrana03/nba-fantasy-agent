// deno-lint-ignore-file no-explicit-any
// Thin wrapper around ESPN's public (keyless) NBA endpoints.
import { usage } from "./usage.ts";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const COMMON = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
const FANTASY = "https://site.api.espn.com/apis/fantasy/v2/games/fba";

// ESPN's site API returns 403 for Deno's default User-Agent, so present as a regular browser.
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json",
};

export async function espn<T = any>(url: string): Promise<T> {
  const u = usage().espn;
  u.calls++;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`ESPN ${res.status} for ${url.replace(/^https:\/\/[^/]+/, "")}`);
    return await res.json();
  } catch (err) {
    u.failures++;
    u.lastError = String((err as Error)?.message ?? err);
    throw err;
  }
}

/** ESPN names seasons by the year they end: 2027 => "2026-27". Season rolls over in August. */
export function currentSeasonYear(now = new Date()): number {
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

export function seasonLabel(year: number): string {
  return `${year - 1}-${String(year).slice(-2)}`;
}

// ---------- Athletes ----------

export async function getAthlete(id: string) {
  const { athlete: a } = await espn(`${COMMON}/athletes/${id}`);
  const injury = a?.injuries?.[0];
  return {
    id,
    name: a?.displayName as string,
    position: a?.position?.abbreviation ?? null,
    jersey: a?.jersey ?? null,
    headshot: a?.headshot?.href ?? null,
    team: a?.team
      ? {
          id: String(a.team.id),
          abbr: a.team.abbreviation,
          name: a.team.displayName,
          logo: a.team.logos?.[0]?.href ?? a.team.logo ?? null,
        }
      : null,
    injury: injury
      ? {
          status: injury.status as string, // e.g. "Day-To-Day", "Out"
          fantasyStatus: injury.details?.fantasyStatus?.description ?? null, // e.g. "GTD"
          type: injury.details?.type ?? null,
          shortComment: injury.shortComment ?? null,
          longComment: injury.longComment ?? null,
          returnDate: injury.details?.returnDate ?? null,
          date: injury.date ?? null,
        }
      : null,
  };
}

export type Athlete = Awaited<ReturnType<typeof getAthlete>>;

/** NBA player search by name (for adding players to the roster). */
export async function searchPlayers(query: string, limit = 8) {
  const q = encodeURIComponent(query);
  const data = await espn(
    `https://site.web.api.espn.com/apis/common/v3/search?query=${q}&type=player&sport=basketball&league=nba&limit=${limit * 2}`,
  );
  return (data.items ?? [])
    .filter((i: any) => i.league === "nba" && /^\d+$/.test(String(i.id)))
    .slice(0, limit)
    .map((i: any) => ({
      id: String(i.id),
      name: i.displayName as string,
      team: i.teamRelationships?.[0]?.displayName ?? null,
    }));
}

/** Latest fantasy news blurbs (Rotowire) for a player. */
export async function getPlayerNews(id: string, limit = 5) {
  const data = await espn(`${FANTASY}/news/players?playerId=${id}&limit=${limit}`);
  return (data.feed ?? []).map((n: any) => ({
    published: n.published ?? n.lastModified ?? null,
    headline: n.headline,
    story: (n.story ?? n.description ?? "").replace(/<[^>]+>/g, "").slice(0, 600),
  }));
}

export function getGamelog(id: string, season: number) {
  return espn(`${COMMON}/athletes/${id}/gamelog?season=${season}`);
}

export function getCareerStats(id: string) {
  return espn(`${COMMON}/athletes/${id}/stats`);
}

// ---------- Games ----------

function competitorScore(c: any): number | null {
  const s = c?.score;
  if (s == null) return null;
  const v = typeof s === "object" ? s.value ?? s.displayValue : s;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalizes a schedule/scoreboard event into the shape the app uses. */
export function normalizeEvent(ev: any) {
  const comp = ev.competitions?.[0] ?? {};
  const side = (homeAway: string) => {
    const c = comp.competitors?.find((x: any) => x.homeAway === homeAway);
    return {
      id: String(c?.team?.id ?? c?.id),
      abbr: c?.team?.abbreviation,
      name: c?.team?.displayName,
      logo: c?.team?.logos?.[0]?.href ?? c?.team?.logo ?? null,
      score: competitorScore(c),
      winner: c?.winner ?? null,
    };
  };
  const st = comp.status?.type ?? ev.status?.type ?? {};
  return {
    id: String(ev.id),
    date: ev.date as string,
    name: ev.name as string,
    seasonType: ev.seasonType?.name ?? (ev.season?.type === 1 ? "Preseason" : "Regular Season"),
    status: { state: st.state as string, completed: !!st.completed, detail: st.shortDetail ?? st.detail ?? "" },
    venue: comp.venue
      ? {
          name: comp.venue.fullName,
          city: comp.venue.address?.city ?? null,
          state: comp.venue.address?.state ?? comp.venue.address?.country ?? null,
        }
      : null,
    broadcast: comp.broadcasts?.[0]?.media?.shortName ?? comp.broadcasts?.[0]?.names?.[0] ?? null,
    home: side("home"),
    away: side("away"),
  };
}

export type Game = ReturnType<typeof normalizeEvent>;

/** All preseason, regular-season and playoff games for a team's current season. */
export async function getTeamSchedule(teamId: string): Promise<Game[]> {
  const types = [1, 2, 3];
  const results = await Promise.all(
    types.map((t) =>
      espn(`${SITE}/teams/${teamId}/schedule?seasontype=${t}`).catch(() => ({ events: [] })),
    ),
  );
  return results.flatMap((r: any) => (r.events ?? []).map(normalizeEvent));
}

export function getGameSummary(eventId: string) {
  return espn(`${SITE}/summary?event=${eventId}`);
}
