-- SECURITY DEFINER, deliberately: these three functions are the ONLY
-- places in the schema allowed to read another user's `profiles` row.
-- profiles keeps its strict own-row-only RLS (id = auth.uid(), see
-- 20260815090001_profiles.sql) - no friends-select policy was added,
-- because RLS is row-level and a friends-can-select-rows policy would
-- let a friend select ANY column via PostgREST, including the
-- sensitive ones added in 20260822100000_profile_details.sql
-- (birth_date, body_weight_kg, height_cm). A definer function bypassing
-- RLS, with an explicit hand-picked column list, is the actual security
-- boundary instead - same precedent as handle_new_user() in
-- 20260815090001_profiles.sql, just applied to a read path.
--
-- Never select birth_date / body_weight_kg / height_cm from any of
-- these three functions.

create function public.search_profiles(query text)
returns table (id uuid, display_name text, relationship text)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    coalesce(
      case
        when f.status = 'accepted' then 'friends'
        when f.status = 'pending' and f.requester_id = auth.uid() then 'pending_sent'
        when f.status = 'pending' and f.addressee_id = auth.uid() then 'pending_received'
      end,
      'none'
    ) as relationship
  from public.profiles p
  left join public.follows f
    on (f.requester_id = p.id and f.addressee_id = auth.uid())
    or (f.requester_id = auth.uid() and f.addressee_id = p.id)
  where p.id <> auth.uid()
    and length(trim(query)) >= 2
    and p.display_name is not null
    and p.display_name ilike '%' || replace(replace(query, '%', '\%'), '_', '\_') || '%' escape '\'
  order by p.display_name
  limit 20;
$$;

-- No avatar_path here, on purpose: search results are pre-friendship,
-- and the storage policy in 20260826100200_social_storage_visibility.sql
-- would refuse to sign it anyway - this matches the confirmed decision
-- that search shows name + relationship only.

create function public.list_pending_requests()
returns table (
  follow_id uuid,
  direction text,
  other_id uuid,
  display_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    case when f.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
    case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end,
    p.display_name,
    f.created_at
  from public.follows f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'pending'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by f.created_at desc;
$$;

-- avatar_path IS included here: these are accepted friends, and the
-- storage policy in 20260826100200_social_storage_visibility.sql
-- legitimately allows signing their avatar path.
create function public.list_friends()
returns table (
  id uuid,
  display_name text,
  avatar_path text,
  home_gym text,
  bio text,
  friends_since timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.display_name, p.avatar_path, p.home_gym, p.bio, f.responded_at
  from public.follows f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid());
$$;

revoke execute on function public.search_profiles(text) from public;
revoke execute on function public.list_pending_requests() from public;
revoke execute on function public.list_friends() from public;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.list_pending_requests() to authenticated;
grant execute on function public.list_friends() to authenticated;
