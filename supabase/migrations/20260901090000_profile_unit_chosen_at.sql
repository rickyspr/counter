-- Har användaren tagit STÄLLNING till enheten, eller står den bara på
-- sitt default? `unit` är `not null default 'kg'` sedan
-- 20260815090001_profiles.sql och kan därför inte själv svara på det.
--
-- En rent lokal flagga hade inte dugt: den lever per enhet, så ett
-- medvetet lbs-val hade skrivits över av regionsdefaulten så fort
-- användaren loggade in på en andra telefon.
alter table public.profiles
  add column unit_chosen_at timestamptz;

-- Ingen ny RLS och inga nya grants: de fyra profiles_*-policyerna från
-- 20260815090001 är row-level och täcker redan nya kolumner, och
-- `authenticated` har tabellrättigheter via 20260815090006_grants.sql.
-- Samma resonemang som i 20260822100000_profile_details.sql.
