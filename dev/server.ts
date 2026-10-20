// Local stand-in for Supabase Edge Functions (no Docker needed). Serves the same handlers that get
// deployed, at http://localhost:8787/nba-home and /nba-player. Run with `npm run dev:api`.
import { handler as home } from "../supabase/functions/nba-home/handler.ts";
import { handler as player } from "../supabase/functions/nba-player/handler.ts";
import { handler as roster } from "../supabase/functions/nba-roster/handler.ts";

const routes: Record<string, (req: Request) => Response | Promise<Response>> = {
  "/nba-home": home,
  "/nba-player": player,
  "/nba-roster": roster,
};

const PORT = Number(Deno.env.get("API_PORT") ?? 8787);

try {
  Deno.serve({ port: PORT }, (req) => {
    const route = routes[new URL(req.url).pathname];
    return route ? route(req) : new Response("Not found", { status: 404 });
  });
} catch (err) {
  if (err instanceof Deno.errors.AddrInUse) {
    console.error(
      `Port ${PORT} is already in use, probably by another copy of the API that's still running.\n` +
        `Stop it (PowerShell): Get-NetTCPConnection -LocalPort ${PORT} -State Listen | % { Stop-Process -Id $_.OwningProcess }`,
    );
    Deno.exit(1);
  }
  throw err;
}
