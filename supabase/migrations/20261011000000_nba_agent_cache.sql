-- Cache for agent output (game summaries, availability notes) so OpenAI is only called once per game.
create table if not exists public.nba_agent_cache (
  key text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Only Edge Functions (service role, which bypasses RLS) read or write this table.
alter table public.nba_agent_cache enable row level security;
