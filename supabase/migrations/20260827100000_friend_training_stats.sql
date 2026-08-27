-- Friend-facing lifetime stats, mirroring get_training_stats() but for a
-- target user instead of the caller. A separate function, not an overload
-- of get_training_stats(): the existing zero-arg RPC and its one caller
-- (fetchTrainingStats(), the profile page's own stats) stay completely
-- untouched, and there's no PostgREST overload resolution to reason about.
--
-- SECURITY INVOKER, same as get_training_stats(): the caller's RLS applies.
-- are_mutual_friends() is checked explicitly (defense in depth, matching
-- can_view_workout()'s own pattern) even though RLS on workouts/sets
-- (workouts_select_friends, sets_select_visible) would already return zero
-- rows for a non-friend - a stranger's id would otherwise just silently
-- show zeroed stats instead of the relationship being explicit here.
create function public.get_friend_training_stats(p_user_id uuid)
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
      (select coalesce(sum(s.reps * s.weight_kg), 0)
         from public.workout_exercises we
         join public.sets s on s.workout_exercise_id = we.id
        where we.workout_id = wo.id) as volume_kg
    from public.workouts wo
    where wo.user_id = p_user_id
      and wo.ended_at is not null
      and public.are_mutual_friends(p_user_id, auth.uid())
  ) w;
$$;

revoke execute on function public.get_friend_training_stats(uuid) from public;
grant execute on function public.get_friend_training_stats(uuid) to authenticated;
