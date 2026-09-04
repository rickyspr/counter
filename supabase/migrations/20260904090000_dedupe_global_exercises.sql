-- Seed-migrationen 20260825090000_seed_global_exercises.sql har landat två
-- gånger i det här projektet, så varje global övning finns som två
-- identiska rader (user_id is null). Det ger en dubblerad väljare i appen
-- OCH splittrad historik: workout_exercises från olika pass pekar på olika
-- rader för samma övning, och webbens get_exercise_personal_bests /
-- get_exercise_progression grupperar per exercise_id.
--
-- Vinnare per namn: äldsta created_at, id som tiebreak. Nyckeln är
-- lower(btrim(name)) - exakt samma normalisering som exerciseNameKey() i
-- packages/shared/src/exercise-catalog.ts, så de två lagren är bevisligen
-- överens.
--
-- Rör BARA globala rader. Användarens egna övningar (user_id not null) är
-- utanför scope: en unik-constraint där kräver att create_exercise i
-- synk-kön kan hantera 23505 utan att blockera köhuvudet.
--
-- ORDNINGEN NEDAN ÄR KRITISK:
--  1. workout_exercises.exercise_id måste pekas om FÖRE raderingen -
--     FK:n är `on delete restrict` (20260815090004_workout_exercises.sql)
--     och restrict går inte att skjuta upp. Görs det i EN sats (data-
--     modifying CTE) ser restrict-triggern fortfarande de gamla raderna
--     och hela migrationen faller. Alltså två separata satser.
--  2. Indexet skapas SIST - det faller om någon dubblett är kvar.
-- Alla tre satserna är no-ops mot en redan ren databas (t.ex. en lokal
-- `supabase db reset`, där seed-migrationen bara kört en gång).

-- 1. Peka om historiken till vinnar-raden.
with ranked as (
  select
    id,
    first_value(id) over (
      partition by lower(btrim(name))
      order by created_at, id
    ) as winner_id
  from public.exercises
  where user_id is null
)
update public.workout_exercises we
set exercise_id = r.winner_id
from ranked r
where we.exercise_id = r.id
  and r.id <> r.winner_id;

-- 2. Radera förlorarna. Identisk CTE - samma mappning, samma snapshot.
with ranked as (
  select
    id,
    first_value(id) over (
      partition by lower(btrim(name))
      order by created_at, id
    ) as winner_id
  from public.exercises
  where user_id is null
)
delete from public.exercises e
using ranked r
where e.id = r.id
  and r.id <> r.winner_id;

-- 3. Spärra vägen tillbaka. Ett fjärde försök att köra seed-listan mot en
-- redan seedad databas faller nu med 23505 istället för att tyst dubblera.
-- Träffar aldrig create_exercise: RLS-policyn exercises_insert_own kräver
-- user_id = auth.uid(), så en användarskapad rad har aldrig user_id null.
create unique index exercises_global_name_unique
  on public.exercises (lower(btrim(name)))
  where user_id is null;
