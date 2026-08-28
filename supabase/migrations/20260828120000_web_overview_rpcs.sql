-- Aggregat för webbappens översiktssida: veckovolym/frekvens,
-- personbästa per övning och progression per övning.
--
-- Räknas i databasen av exakt samma skäl som get_training_stats()
-- (20260820120000_training_stats.sql): klienten skulle annars behöva
-- ladda ner varje set, och Data API:t kapar svar över 1000 rader i
-- tysthet - siffrorna blir tyst fel så fort någon tränat länge nog.
-- Alla tre returnerar en rad per vecka / övning / pass, aldrig en rad
-- per set.
--
-- SECURITY INVOKER, som get_training_stats(): anroparens RLS gäller, och
-- filtret på auth.uid() är dessutom explicit. SECURITY DEFINER hade
-- delat ut hela databasens statistik till vem som helst.
--
-- e1RM räknas inline med Epley-formeln. Håll uttrycket i takt med
-- calculateE1rm i packages/shared/src/stats/e1rm.ts - samma
-- spegla-den-här-filen-disciplin som media.ts har mot storage-migrationen:
--   reps <= 1  ->  vikten själv
--   annars     ->  weight_kg * (1 + reps / 30)

create function public.get_weekly_training_series()
returns table (
  week_start date,
  volume_kg numeric,
  workout_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    w.week_start,
    coalesce(sum(w.volume_kg), 0),
    count(*)
  from (
    select
      -- UTC-måndag, matchar isoWeekStart i stats/date-utils.ts.
      date_trunc('week', wo.started_at at time zone 'UTC')::date as week_start,
      -- Volymen per pass i en korrelerad subquery, INTE en join - en rak
      -- join hade gett en rad per set och count(*) hade räknat set, inte
      -- pass. Samma skäl som get_training_stats().
      (select coalesce(sum(s.reps * s.weight_kg), 0)
         from public.workout_exercises we
         join public.sets s on s.workout_exercise_id = we.id
        where we.workout_id = wo.id) as volume_kg
    from public.workouts wo
    where wo.user_id = auth.uid()
      and wo.ended_at is not null
  ) w
  group by w.week_start
  order by w.week_start;
$$;

-- En join är däremot rätt här: vi vill ha varje set, och max()/count(
-- distinct) påverkas inte av att raden dupliceras.
create function public.get_exercise_personal_bests()
returns table (
  exercise_id uuid,
  exercise_name text,
  heaviest_set_kg numeric,
  best_e1rm_kg numeric,
  workout_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    we.exercise_id,
    e.name,
    max(s.weight_kg),
    max(case when s.reps <= 1 then s.weight_kg
             else s.weight_kg * (1 + s.reps / 30.0) end),
    count(distinct wo.id)
  from public.workouts wo
  join public.workout_exercises we on we.workout_id = wo.id
  join public.sets s on s.workout_exercise_id = we.id
  join public.exercises e on e.id = we.exercise_id
  where wo.user_id = auth.uid()
    and wo.ended_at is not null
  group by we.exercise_id, e.name
  order by e.name;
$$;

create function public.get_exercise_progression(p_exercise_id uuid)
returns table (
  workout_started_at timestamptz,
  top_weight_kg numeric,
  best_e1rm_kg numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    wo.started_at,
    max(s.weight_kg),
    max(case when s.reps <= 1 then s.weight_kg
             else s.weight_kg * (1 + s.reps / 30.0) end)
  from public.workouts wo
  join public.workout_exercises we on we.workout_id = wo.id
  join public.sets s on s.workout_exercise_id = we.id
  where wo.user_id = auth.uid()
    and wo.ended_at is not null
    and we.exercise_id = p_exercise_id
  group by wo.id, wo.started_at
  order by wo.started_at;
$$;

-- Se 20260815090006_grants.sql / get_training_stats(): bara authenticated,
-- aldrig anon. CREATE FUNCTION ger EXECUTE till PUBLIC (som anon ingår i),
-- så revoken behövs innan grantet betyder något.
revoke execute on function public.get_weekly_training_series() from public;
revoke execute on function public.get_exercise_personal_bests() from public;
revoke execute on function public.get_exercise_progression(uuid) from public;
grant execute on function public.get_weekly_training_series() to authenticated;
grant execute on function public.get_exercise_personal_bests() to authenticated;
grant execute on function public.get_exercise_progression(uuid) to authenticated;
