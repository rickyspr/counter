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
- `workouts` – a session: user_id, started_at, ended_at, name, note.
  `name` is the workout's title. Naming is optional while logging: a
  workout left unnamed is written with `defaultWorkoutName()` when it
  ends, so anything logged by the current app always has one. Null
  therefore means "logged before naming existed", and those fall back
  to the date. `note` is a separate, still-unused free-text field – a
  note about the session, not a title.
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

One exception lives in the database: `get_training_stats()` (RPC,
`supabase/migrations/20260820120000_training_stats.sql`) returns
lifetime totals for the profile page. Client-side would mean
downloading every set, and the Data API silently truncates responses
over 1000 rows. It is `security invoker` with an explicit
`auth.uid()` filter — `security definer` would bypass RLS and hand
out everyone's numbers. Per-workout volume is a correlated subquery,
not a join: joining sets alongside the workout would multiply each
workout's duration by its set count.

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
- [x] Offline support in the app – logging a full workout (start →
      add exercise/set → end) works with no connection, via a local
      AsyncStorage sync queue (`apps/mobile/lib/offline-queue.ts`)
      that replays against Supabase once online. Browsing history/
      stats still requires a connection - not in scope
- [x] Edit and delete a logged set while the workout is still
      active, plus removing a whole exercise. `set_nr` and
      `order_index` are monotonic counters that are never reused -
      gaps are harmless since no stats function reads `set_nr`, and
      rows are labelled by position
- [x] Row-first set entry: "Lägg till set" appends an empty row that
      is filled in place, instead of a separate form. It always
      appends, even if the previous row is still blank - the button
      does what it says, and a blank row is never written anywhere.
      Adding an exercise seeds set 1 the same way - there is no such
      thing as an exercise with zero sets, so the row is there from the
      start. It is deliberately not focused: the exercise picker's
      modal is still sliding away at that point, and a keyboard racing
      it is both flaky on iOS and in the way. A row is only written
      once both fields parse, and "Avsluta pass" refuses to finish
      while anything is blank, half-filled or unparseable.
      Each row hints the matching set from the previous workout as a
      greyed placeholder (`fetchPreviousSetsForExercise`, cached per
      exercise so it survives being offline)
- [x] Resume an active workout after the app is closed. The whole
      screen state is mirrored to AsyncStorage
      (`apps/mobile/lib/active-workout.ts`) on every change, and
      HomeScreen offers it as "Fortsätt / Släng". Querying the server
      for `ended_at is null` would not do: the workout may exist only
      in the sync queue, half-filled rows are deliberately never
      written, and the monotonic `set_nr`/`order_index` counters cannot
      be rebuilt from the surviving rows after a delete - so they are
      persisted verbatim. A workout older than 24h stops being offered
      but is NOT deleted - only the local blob is dropped, since a real
      workout the user just forgot to end must not be destroyed by a
      timer. Actually deleting is always a deliberate choice ("Släng" /
      "Avbryt pass"), via `delete_workout` in the queue relying on
      `on delete cascade`. "Starta nytt pass" is hidden while a workout
      is active: there is only one slot, so a new one would overwrite
      the old beyond reach
- [x] Edit a logged workout afterwards, reached from the workout detail
      view under Profil (`apps/mobile/screens/EditWorkoutScreen.tsx`,
      its own branch in the App.tsx router - not a modal, since the
      exercise picker is already one and nested full-screen modals are
      flaky on iOS). Name, start/end time, add/remove exercises, full
      set editing, and deleting the workout outright.
      The screen opens ONLY when online and the sync queue is drained
      (`drainQueue`). That is what makes the counters safe: new
      `order_index`/`set_nr` are `max+1` over what the server returns
      (`fetchWorkoutForEdit`), which is only true when everything that
      exists has reached the server. This is the opposite trade-off
      from an active workout, whose counters must be persisted verbatim
      because it can be offline and holds half-filled rows that were
      never written. Dying mid-edit is safe: the queued rows are on
      disk with their numbers, and the next open drains before reading
      a new max.
      Name and times are written on "Klar", not on every keystroke -
      they are three columns of one row, and the iOS picker fires
      continuously while scrolling. Set rows keep writing on blur.
      Times are ALWAYS sent as a pair: a lone new `started_at` is
      checked against the stored `ended_at` by
      `workouts_ended_after_started`, and a 23514 is permanent, so the
      queue would silently drop the edit.
      Deleting a finished workout is what forced `fetchWorkoutHistory`
      from offset to keyset pagination on `(started_at, id)` - an
      offset skips a row as soon as anything above it is deleted or
      moved, and editing a start time moves rows too
- [x] Name a workout while logging it, at the top of the active workout
      screen. Optional: leaving it blank gives the workout
      `defaultWorkoutName(started_at)` – "Gym på natten / förmiddagen /
      dagen / kvällen" – written together with `ended_at` in the same
      `end_workout` queue action, since both are decided in the same
      moment and hit the same row.
      The default is shown as the field's PLACEHOLDER rather than as a
      prefilled value, so naming the workout yourself never starts with
      deleting a name you did not write. It is computed on the client
      (`packages/shared/src/workout-name.ts`, unit-tested at every
      boundary minute) and not as a column default or trigger: the
      bucket depends on the local hour of `started_at`, which the
      server cannot know.
      Workouts logged before this existed keep `name = null` and are
      still shown by date – deliberately not backfilled. That is also
      why the edit screen's placeholder is the date and not a default
      name: there, blank really does mean null
- [x] Profile page in the app, reached from a hand-rolled bottom tab
      bar (Hem / Profil) that hides during an active workout. Editable
      display name (first code anywhere to touch `profiles` — upsert,
      not update, since accounts predating the trigger have no row),
      account info from the auth session, lifetime stats from
      `get_training_stats()`, and an infinite-scrolling workout
      history. The history query embeds every set in one round trip
      (`fetchWorkoutHistory`), so tapping a workout opens the detail
      modal with no extra fetch. Profile writes live in
      `apps/mobile/lib/profile.ts`, deliberately outside `queries.ts`
      whose rule is that mutations only ever go through the sync queue

## Open questions (to resolve before the relevant part is built)
- Login for the MVP: is email/password enough, or Apple/Google
  right away?
- Units: kg as default with lbs as a setting – OK?
- Should the web app also be able to log workouts, or is it
  stats-only?

## Environment
- Node 20+, pnpm 9+, Expo CLI, Supabase CLI
- `.env` in the repo root: SUPABASE_URL, SUPABASE_ANON_KEY
