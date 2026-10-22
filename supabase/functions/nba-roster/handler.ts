// deno-lint-ignore-file no-explicit-any
// GET  /nba-roster              → { players }            the current fantasy roster
// GET  /nba-roster?search=<q>   → { results }            NBA player search (ESPN) for adding/replacing
// POST /nba-roster  (x-refresh-password required) with JSON body:
//   { action: "add",     player: { id } }                add a player
//   { action: "remove",  id }                            remove a player
//   { action: "replace", id, player: { id } }            swap one player for another (keeps list position)
//   { action: "set-lineup", id, lineup: "starting" | "bench" }  set a planning label
//   { action: "check" }                                  only verify the password
// Players are looked up on ESPN by id, so the stored name/id always match a real NBA player.
import { getAthlete, searchPlayers } from "../_shared/espn.ts";
import { getRoster, MAX_ROSTER, type RosterPlayer, saveRoster } from "../_shared/roster.ts";
import { requirePassword } from "../_shared/auth.ts";
import { json, withHttp } from "../_shared/http.ts";

const noStore = { "Cache-Control": "no-store" };
const invalid = (error: string) => json({ error, source: "validation" }, 400, noStore);
const validId = (id: unknown) => typeof id === "string" && /^\d{1,12}$/.test(id);

/** The player as ESPN knows them, or null if the id isn't a real player. */
async function resolvePlayer(id: string): Promise<RosterPlayer | null> {
  const athlete = await getAthlete(id).catch(() => null);
  return athlete?.name ? { id, name: athlete.name, lineup: "starting" } : null;
}

const notFound = () => invalid("Couldn't find that player on ESPN. Try searching again.");

export const handler = withHttp(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const search = url.searchParams.get("search")?.trim();
    if (search !== undefined) {
      return json({ results: search.length < 2 ? [] : await searchPlayers(search.slice(0, 60)) }, 200, noStore);
    }
    return json({ players: await getRoster() }, 200, noStore);
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const denied = requirePassword(req);
  if (denied) return denied;

  const body: any = await req.json().catch(() => ({}));
  let roster = await getRoster();
  const has = (id: string) => roster.some((p) => p.id === id);

  switch (body.action) {
    case "check":
      return json({ ok: true }, 200, noStore);

    case "add": {
      const id = String(body.player?.id ?? "");
      if (!validId(id)) return invalid("Pick a player from the search results.");
      if (has(id)) return invalid("That player is already on your team.");
      if (roster.length >= MAX_ROSTER) return invalid(`Your team is full (max ${MAX_ROSTER} players).`);
      const player = await resolvePlayer(id);
      if (!player) return notFound();
      roster = [...roster, player];
      break;
    }

    case "remove": {
      const id = String(body.id ?? "");
      if (!has(id)) return invalid("That player isn't on your team.");
      roster = roster.filter((p) => p.id !== id);
      break;
    }

    case "replace": {
      const id = String(body.id ?? "");
      const newId = String(body.player?.id ?? "");
      if (!has(id)) return invalid("That player isn't on your team.");
      if (!validId(newId)) return invalid("Pick a player from the search results.");
      if (newId !== id && has(newId)) return invalid("That player is already on your team.");
      const replacement = await resolvePlayer(newId);
      if (!replacement) return notFound();
      roster = roster.map((p) => (p.id === id ? { ...replacement, lineup: p.lineup } : p));
      break;
    }

    case "set-lineup": {
      const id = String(body.id ?? "");
      if (!has(id)) return invalid("That player isn't on your team.");
      if (body.lineup !== "starting" && body.lineup !== "bench") {
        return invalid("Choose Starting or Bench.");
      }
      roster = roster.map((p) => (p.id === id ? { ...p, lineup: body.lineup } : p));
      break;
    }

    default:
      return invalid("Unknown action.");
  }

  await saveRoster(roster);
  return json({ players: roster }, 200, noStore);
});
