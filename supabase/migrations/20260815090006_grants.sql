-- Nyare Supabase-projekt exponerar inte tabeller mot Data API-rollerna
-- automatiskt längre (auto_expose_new_tables=false). RLS-policyerna styr
-- fortfarande VILKA rader som syns/kan ändras, men rollerna måste ha
-- explicit tabellbehörighet för att över huvud taget nå tabellen.
--
-- Appen kräver inloggning för allt (ingen publik yta), så vi ger bara
-- `authenticated` åtkomst - inte `anon`.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert, update, delete on public.workouts to authenticated;
grant select, insert, update, delete on public.workout_exercises to authenticated;
grant select, insert, update, delete on public.sets to authenticated;
