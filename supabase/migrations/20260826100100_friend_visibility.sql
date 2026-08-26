-- SECURITY INVOKER is correct here: every legitimate call has
-- auth.uid() as one of the two arguments, and follows_select_participant
-- (20260826100000_follows.sql) already grants that caller row-level
-- access to the relevant `follows` row - no need to bypass RLS.
create function public.are_mutual_friends(a uuid, b uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.follows f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

revoke execute on function public.are_mutual_friends(uuid, uuid) from public;
grant execute on function public.are_mutual_friends(uuid, uuid) to authenticated;

-- Shared "own workout or a mutual friend's" check, reused by
-- workout_exercises/sets/workout_media/workout_kudos below instead of
-- duplicating the exists-subquery four more times.
create function public.can_view_workout(p_workout_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.workouts w
    where w.id = p_workout_id
      and (w.user_id = auth.uid() or public.are_mutual_friends(w.user_id, auth.uid()))
  );
$$;

revoke execute on function public.can_view_workout(uuid) from public;
grant execute on function public.can_view_workout(uuid) to authenticated;

-- Additional PERMISSIVE select policy. Postgres ORs multiple permissive
-- policies for the same command together, so this adds friend
-- visibility without touching workouts_select_own
-- (20260815090003_workouts.sql) - own-row access is unchanged.
create policy "workouts_select_friends"
  on public.workouts for select
  using (public.are_mutual_friends(user_id, auth.uid()));

-- workout_exercises/sets/workout_media: replace the "_select_own"
-- policy with one that uses can_view_workout (own OR friend). Insert/
-- update/delete stay owner-only, unchanged - a friend never writes to
-- someone else's workout.
drop policy "workout_exercises_select_own" on public.workout_exercises;
create policy "workout_exercises_select_visible"
  on public.workout_exercises for select
  using (public.can_view_workout(workout_exercises.workout_id));

drop policy "sets_select_own" on public.sets;
create policy "sets_select_visible"
  on public.sets for select
  using (
    public.can_view_workout(
      (select we.workout_id from public.workout_exercises we
        where we.id = sets.workout_exercise_id)
    )
  );

drop policy "workout_media_select_own" on public.workout_media;
create policy "workout_media_select_visible"
  on public.workout_media for select
  using (public.can_view_workout(workout_media.workout_id));
