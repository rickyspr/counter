create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  constraint workouts_ended_after_started check (ended_at is null or ended_at >= started_at)
);

create index workouts_user_id_idx on public.workouts (user_id);

alter table public.workouts enable row level security;

create policy "workouts_select_own"
  on public.workouts for select
  using (user_id = auth.uid());

create policy "workouts_insert_own"
  on public.workouts for insert
  with check (user_id = auth.uid());

create policy "workouts_update_own"
  on public.workouts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "workouts_delete_own"
  on public.workouts for delete
  using (user_id = auth.uid());
