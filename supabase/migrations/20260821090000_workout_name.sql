-- Ett eget namn på passet ("Ben & rygg"), satt i efterhand när man
-- redigerar ett loggat pass. Nullable: de allra flesta pass får aldrig
-- något namn, och då visas datumet precis som förut.
--
-- Egen kolumn istället för att återanvända `note`. Ingenting skriver
-- `note` idag, men den är en fritextanteckning OM passet - en annan sak
-- än en titel, och att låta den betyda båda hade gjort en framtida
-- anteckningsfunktion till ett namnbyte i förklädnad.
alter table public.workouts add column name text;

-- Taket paras med maxLength på inmatningsfältet, så appen aldrig kan
-- träffa villkoret. Det är med flit: ett brutet check-villkor ger
-- 23514, vilket synk-kön klassar som permanent och SLÄNGER åtgärden
-- (se isRetryable i offline-queue.ts). Villkoret är alltså ett skydd
-- mot skräp från något annat än appen, inte ett fel användaren ska
-- kunna se.
alter table public.workouts
  add constraint workouts_name_length check (name is null or length(name) <= 80);

-- Ingen ny RLS behövs: `workouts_select_own` och `workouts_update_own`
-- (20260815090003_workouts.sql) täcker kolumnen, och `authenticated`
-- har redan update på tabellen via 20260815090006_grants.sql.
