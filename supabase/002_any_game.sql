-- Migration for projects created from the first schema.sql: accept any game id (folder name),
-- so new games don't need a database change. Run once in the SQL editor.
alter table public.scores drop constraint if exists scores_game_check;
alter table public.scores add constraint scores_game_check check (game ~ '^[a-z]{2,20}$');
