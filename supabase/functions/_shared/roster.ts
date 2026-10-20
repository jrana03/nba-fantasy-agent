// My fantasy team, editable from the app (nba-roster function). Stored in the nba_agent_cache key/value
// table (in memory when running locally without Supabase credentials). IDs are ESPN athlete IDs.
import { getValue, setValue } from "./cache.ts";

export type RosterPlayer = { id: string; name: string };

const ROSTER_KEY = "roster:v1";
export const MAX_ROSTER = 20;

/** Starting team, used only until the roster is first edited. */
const DEFAULT_ROSTER: RosterPlayer[] = [
  { id: "3945274", name: "Luka Dončić" },
  { id: "4432166", name: "Cade Cunningham" },
  { id: "5041939", name: "Cooper Flagg" },
  { id: "4066457", name: "Austin Reaves" },
  { id: "4871144", name: "Alperen Şengün" },
  { id: "4432158", name: "Evan Mobley" },
  { id: "5104157", name: "Victor Wembanyama" },
  { id: "5105565", name: "Donovan Clingan" },
  { id: "1966", name: "LeBron James" },
  { id: "4397688", name: "Trey Murphy III" },
  { id: "4277905", name: "Trae Young" },
  { id: "4066336", name: "Lauri Markkanen" },
  { id: "3992", name: "James Harden" },
];

export async function getRoster(): Promise<RosterPlayer[]> {
  return (await getValue<RosterPlayer[]>(ROSTER_KEY)) ?? DEFAULT_ROSTER;
}

export async function saveRoster(players: RosterPlayer[]): Promise<void> {
  await setValue(ROSTER_KEY, players);
}
