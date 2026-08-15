create table public.sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  set_nr int not null,
  reps int not null,
  weight_kg numeric not null,
  created_at timestamptz not null default now(),
  constraint sets_set_nr_positive check (set_nr >= 1),
  constraint sets_reps_non_negative check (reps >= 0),
  constraint sets_weight_kg_non_negative check (weight_kg >= 0),
  unique (workout_exercise_id, set_nr)
);

create index sets_workout_exercise_id_idx on public.sets (workout_exercise_id);

alter table public.sets enable row level security;

-- Ägarskap ärvs via workout_exercises -> workouts.
create policy "sets_select_own"
  on public.sets for select
  using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id
        and w.user_id = auth.uid()
    )
  );

create policy "sets_insert_own"
  on public.sets for insert
  with check (
    exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id
        and w.user_id = auth.uid()
    )
  );

create policy "sets_update_own"
  on public.sets for update
  using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id
        and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id
        and w.user_id = auth.uid()
    )
  );

create policy "sets_delete_own"
  on public.sets for delete
  using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id
        and w.user_id = auth.uid()
    )
  );
