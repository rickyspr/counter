-- Livstidsstatistik för profilsidan. Går inte att räkna fram i klienten:
-- det skulle kräva att varje set laddas ner, och Data API:t kapar svar
-- över 1000 rader i tysthet - siffrorna skulle alltså bli tyst fel så
-- fort någon tränat tillräckligt länge.
--
-- SECURITY INVOKER (funktioners standard, utskrivet här för tydlighet):
-- anroparens rättigheter och RLS gäller. Motsatsen, SECURITY DEFINER som
-- handle_new_user() använder, hade kört som ägaren och gått förbi RLS -
-- alltså returnerat HELA databasens statistik till vem som helst.
-- Filtret på auth.uid() är dessutom explicit.
create function public.get_training_stats()
returns table (
  workout_count bigint,
  total_volume_kg numeric,
  total_minutes numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*),
    coalesce(sum(w.volume_kg), 0),
    coalesce(sum(w.duration_minutes), 0)
  from (
    select
      extract(epoch from (wo.ended_at - wo.started_at)) / 60 as duration_minutes,
      -- Volymen räknas per pass i en korrelerad subquery, INTE genom att
      -- joina ut sets bredvid passet. En rak join hade gett en rad per
      -- set, och då hade sum(duration_minutes) multiplicerat varje pass
      -- längd med sitt antal set.
      (select coalesce(sum(s.reps * s.weight_kg), 0)
         from public.workout_exercises we
         join public.sets s on s.workout_exercise_id = we.id
        where we.workout_id = wo.id) as volume_kg
    from public.workouts wo
    where wo.user_id = auth.uid()
      and wo.ended_at is not null
  ) w;
$$;

-- Se 20260815090006_grants.sql: bara `authenticated`, aldrig `anon`.
--
-- Revoken är inte överflödig. CREATE FUNCTION ger EXECUTE till PUBLIC
-- som standard, och `anon` ingår i PUBLIC - utan den här raden hade
-- grantet nedan inte gett något alls. Idag läcker det ändå inget (RLS
-- gäller, auth.uid() är null för anon och anon saknar tabellrättigheter
-- helt), men då vilar garantin på tre andra saker istället för på den
-- här filen.
revoke execute on function public.get_training_stats() from public;
grant execute on function public.get_training_stats() to authenticated;
