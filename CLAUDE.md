# RepCount – gym workout logging with stats

## What the project does
An app for logging gym workouts (exercise + sets + reps + weight) and
viewing stats for the latest session as well as progress over time.
Mobile app for logging, web app for stats (Strava-style). Account +
sync so data follows you across devices.

## Architecture
Monorepo (pnpm workspaces, TypeScript everywhere):

- `apps/mobile/` – Expo (React Native). Primary surface: log a
  workout, view the latest workout.
- `apps/web/` – React (Vite). Primary surface: login + stats over time
  (charts, PBs, volume).
- `packages/shared/` – shared code: data types, Supabase client,
  stats calculations. Both mobile and web import from here – no
  duplicated business logic.
- `supabase/` – database migrations and config (Supabase CLI).

Backend: Supabase (Postgres + Auth + auto-generated API). No custom
API server – clients talk directly to Supabase, security via RLS.

## Data model (Postgres)
- `profiles` – 1:1 with auth.users (display name, unit kg/lbs).
- `exercises` – exercise catalog: name, muscle group. Global rows
  (user_id null) + the user's own.
- `workouts` – a session: user_id, started_at, ended_at, note.
- `workout_exercises` – an exercise within a session: workout_id,
  exercise_id, order.
- `sets` – a set: workout_exercise_id, set_nr, reps, weight_kg.

Weights are always stored in kg (numeric); lbs is presentation only.
RLS on all tables: users can only see/change their own rows (global
`exercises` rows are readable by everyone).

## Stats (calculated in packages/shared)
- Latest workout: total volume (Σ reps × weight), number of
  sets/exercises, duration.
- Over time: volume per week, workout frequency, PB per exercise
  (heaviest set and best e1RM), progression per exercise.

## Conventions & rules
- TypeScript strict mode in all packages; shared types live in
  `packages/shared`, never duplicated.
- Database changes are ALWAYS made as migrations in
  `supabase/migrations/` – never manually in the Supabase dashboard.
- Supabase keys are read from `.env` (gitignored). Only the anon key
  may appear in client code; the service role key must NEVER end up
  in apps/ or packages/.
- All user data is protected by RLS – a new table without an RLS
  policy may not be merged.
- UI language: Swedish. Code, comments, and identifiers: English.
- Only the user pushes to git (`git push`). Claude may create local
  commits when asked, but must never run `git push` – always hand
  that step back to the user.
- After every major implementation, describe how the user can try it
  themselves (mobile device/simulator, web browser, etc.) – exact
  commands and steps. If there's nothing user-testable yet (e.g.
  backend-only or library code), say that explicitly instead of
  skipping the section.
- Always ask the user when something is uncertain or a choice has no
  obvious answer – don't guess.

## Commands
- `pnpm install` – install everything (from the repo root)
- `pnpm --filter mobile start` – Expo dev server
- `pnpm --filter web dev` – run the web app locally
- `supabase db push` – apply migrations (requires Supabase CLI)

## TODO (in priority order)
- [x] Initialize the monorepo: pnpm-workspace.yaml, base tsconfig,
      scaffold the Expo app and the web app
- [x] Create the Supabase project, write schema migrations + RLS
      policies, seed the exercise catalog with common exercises
- [x] packages/shared: types, Supabase client, stats functions
      (volume, e1RM, PB) with unit tests
- [x] Mobile MVP: auth (email) → start workout → add exercise/set →
      end workout → summary of the latest workout
- [x] Web MVP: login + overview over time (volume/week, frequency, PB)
- [x] Charts on the web (progression per exercise)
- [x] Google login in the app (`expo-auth-session` + Supabase PKCE
      OAuth) – requires a native dev-client build (`npx expo run:ios`),
      not supported through Expo Go's dynamic `exp://` redirect
- [ ] Apple login – deferred, requires a paid Apple Developer account
- [ ] Offline support in the app

## Open questions (to resolve before the relevant part is built)
- Login for the MVP: is email/password enough, or Apple/Google
  right away?
- Units: kg as default with lbs as a setting – OK?
- Should the web app also be able to log workouts, or is it
  stats-only?

## Environment
- Node 20+, pnpm 9+, Expo CLI, Supabase CLI
- `.env` in the repo root: SUPABASE_URL, SUPABASE_ANON_KEY
