import { json } from "./http.ts";

/**
 * Guards actions that cost money or change data (agent refresh, roster edits) with REFRESH_PASSWORD,
 * sent by the browser in the x-refresh-password header. Returns an error Response, or null when allowed.
 */
export function requirePassword(req: Request): Response | null {
  const noStore = { "Cache-Control": "no-store" };
  const expected = Deno.env.get("REFRESH_PASSWORD");
  if (!expected) {
    return json({ error: "Editing is disabled: REFRESH_PASSWORD is not set.", source: "auth" }, 403, noStore);
  }
  if (req.headers.get("x-refresh-password") !== expected) {
    return json({ error: "Incorrect password.", source: "auth" }, 401, noStore);
  }
  return null;
}
