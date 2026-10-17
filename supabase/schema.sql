-- MUGIC Arcade global scoreboard. Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Anyone may read and add scores; nobody (via the public key) may change or delete them.
create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  game       text        not null check (game ~ '^[a-z]{2,20}$'),      -- folder name of the game
  mode       text        not null default 'normal' check (mode in ('normal', 'hard')),
  level      int         check (level between 1 and 100),          -- Sokoban level; null for Invaders
  score      int         not null check (score between 0 and 10000000),
  initials   text        not null check (initials ~ '^[A-Z]{3}$'),
  device     text        not null check (device ~ '^[0-9a-f]{6}$'), -- last 6 hex of the MUGIC's MAC
  created_at timestamptz not null default now()
);
create index if not exists scores_board on public.scores (game, mode, level, score);

alter table public.scores enable row level security;
-- newer projects don't auto-grant new tables to the API roles; RLS below still limits what anon may do
grant select, insert on public.scores to anon;
drop policy if exists "read scores" on public.scores;
create policy "read scores" on public.scores for select to anon using (true);
drop policy if exists "add scores" on public.scores;
create policy "add scores" on public.scores for insert to anon with check (true);
