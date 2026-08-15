create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  muscle_group text,
  created_at timestamptz not null default now()
);

create index exercises_user_id_idx on public.exercises (user_id);

alter table public.exercises enable row level security;

-- Globala övningar (user_id null) är läsbara för alla inloggade användare,
-- egna övningar bara av ägaren.
create policy "exercises_select_global_or_own"
  on public.exercises for select
  using (user_id is null or user_id = auth.uid());

create policy "exercises_insert_own"
  on public.exercises for insert
  with check (user_id = auth.uid());

create policy "exercises_update_own"
  on public.exercises for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "exercises_delete_own"
  on public.exercises for delete
  using (user_id = auth.uid());
