-- Mutual-follow relationship for the social feed. One row per PAIR of
-- users regardless of direction: pair_low/pair_high are a generated,
-- order-independent key, so a single unique index blocks A->B while
-- B->A is pending, blocks a duplicate A->B, and blocks a second
-- accepted row for the same pair - without three separate checks.
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint follows_not_self check (requester_id <> addressee_id),
  pair_low uuid generated always as (least(requester_id, addressee_id)) stored,
  pair_high uuid generated always as (greatest(requester_id, addressee_id)) stored
);

create unique index follows_unique_pair_idx on public.follows (pair_low, pair_high);
create index follows_requester_id_idx on public.follows (requester_id);
create index follows_addressee_id_idx on public.follows (addressee_id);

alter table public.follows enable row level security;

create policy "follows_select_participant"
  on public.follows for select
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "follows_insert_own_request"
  on public.follows for insert
  with check (requester_id = auth.uid() and status = 'pending');

-- Only the addressee can accept, and only pending -> accepted.
-- Cancelling a sent request, declining a received one, and removing an
-- accepted friendship are all a DELETE instead (see below), so a
-- request can be sent again later rather than being blocked forever by
-- a leftover 'declined' row.
create policy "follows_update_accept"
  on public.follows for update
  using (addressee_id = auth.uid() and status = 'pending')
  with check (addressee_id = auth.uid() and status = 'accepted');

create policy "follows_delete_participant"
  on public.follows for delete
  using (requester_id = auth.uid() or addressee_id = auth.uid());

grant select, insert, update, delete on public.follows to authenticated;
