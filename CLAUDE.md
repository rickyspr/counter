# RepCount – gympass-loggning med statistik

## Vad projektet gör
App för att logga gympass (övning + set + reps + vikt) och se statistik
över senaste passet samt utveckling över tid. Mobilapp för loggning,
webbsida för statistik (à la Strava). Konto + synk så datan följer med
mellan enheter.

## Arkitektur
Monorepo (pnpm workspaces, TypeScript överallt):

- `apps/mobile/` – Expo (React Native). Primär yta: logga pass, se
  senaste pass.
- `apps/web/` – React (Vite). Primär yta: inloggning + statistik över
  tid (grafer, PB, volym).
- `packages/shared/` – delad kod: datatyper, Supabase-klient,
  statistikberäkningar. Både mobile och web importerar härifrån –
  ingen dubblerad affärslogik.
- `supabase/` – databas-migrationer och config (Supabase CLI).

Backend: Supabase (Postgres + Auth + auto-genererat API). Ingen egen
API-server – klienterna pratar direkt med Supabase, säkerhet via RLS.

## Datamodell (Postgres)
- `profiles` – 1:1 mot auth.users (visningsnamn, enhet kg/lbs).
- `exercises` – övningskatalog: namn, muskelgrupp. Globala rader
  (user_id null) + användarens egna.
- `workouts` – ett pass: user_id, started_at, ended_at, anteckning.
- `workout_exercises` – övning i ett pass: workout_id, exercise_id,
  ordning.
- `sets` – ett set: workout_exercise_id, set_nr, reps, vikt_kg.

Vikter lagras alltid i kg (numeric); lbs är bara presentation.
RLS på alla tabeller: användare ser/ändrar bara sina egna rader
(globala `exercises` är läsbara för alla).

## Statistik (beräknas i packages/shared)
- Senaste pass: total volym (Σ reps × vikt), antal set/övningar, längd.
- Över tid: volym per vecka, passfrekvens, PB per övning (tyngsta set
  och bästa e1RM), progression per övning.

## Konventioner & regler
- TypeScript strict mode i alla paket; delade typer bor i
  `packages/shared`, aldrig kopierade.
- Databasändringar görs ALLTID som migrationer i `supabase/migrations/`
  – aldrig manuellt i Supabase-dashboarden.
- Supabase-nycklar läses från `.env` (gitignored). Endast anon-nyckeln
  får förekomma i klientkod; service role-nyckeln får ALDRIG hamna i
  apps/ eller packages/.
- All användardata skyddas av RLS – ny tabell utan RLS-policy får inte
  mergas.
- UI-språk: svenska. Kod, kommentarer och identifierare: engelska.
- Fråga alltid användaren om något är osäkert eller om ett vägval
  saknar uppenbart svar – gissa inte.

## Kommandon
- `pnpm install` – installera allt (från repo-roten)
- `pnpm --filter mobile start` – Expo dev-server
- `pnpm --filter web dev` – webben lokalt
- `supabase db push` – applicera migrationer (kräver Supabase CLI)

## TODO (i prioritetsordning)
- [x] Initiera monorepo: pnpm-workspace.yaml, tsconfig-bas, scaffolda
      Expo-appen och web-appen
- [x] Skapa Supabase-projekt, skriva schema-migrationer + RLS-policyer,
      seeda övningskatalogen med vanliga övningar
- [x] packages/shared: typer, Supabase-klient, statistikfunktioner
      (volym, e1RM, PB) med enhetstester
- [x] Mobil MVP: auth (e-post) → starta pass → lägga till övning/set →
      avsluta pass → sammanfattning av senaste pass
- [ ] Webb MVP: login + översikt över tid (volym/vecka, frekvens, PB)
- [ ] Grafer på webben (progression per övning)
- [ ] Apple/Google-inloggning, offline-stöd i appen

## Öppna frågor (att stämma av innan berörd del byggs)
- Inloggning i MVP: räcker e-post/lösenord, eller Apple/Google direkt?
- Enheter: kg som default med lbs som inställning – OK?
- Ska webben också kunna logga pass, eller är den enbart statistik?

## Miljö
- Node 20+, pnpm 9+, Expo CLI, Supabase CLI
- `.env` i repo-roten: SUPABASE_URL, SUPABASE_ANON_KEY
