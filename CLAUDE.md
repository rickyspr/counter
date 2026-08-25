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
- `profiles` – 1:1 with auth.users: display name, unit kg/lbs, and the
  optional details in `20260822100000_profile_details.sql` –
  `avatar_path` (a path into the private `avatars` bucket, never a URL),
  `home_gym`, `birth_date`, `body_weight_kg`, `height_cm`, `bio`. All
  nullable; a profile is optional decoration around the training data.
  Age is derived from `birth_date` in the client (`calculateAge` in
  `packages/shared/src/profile.ts`) and never stored – an `age` column
  is silently wrong from the day after every birthday. The bounds ARE
  check constraints here, unlike `workouts_name_length`: profile writes
  bypass the sync queue, so a 23514 is a dialog the user can act on
  rather than a silently dropped action.
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
- `workout_media` – an image/video on a session: workout_id, media_type,
  storage_path, added_at, width/height/duration_ms. The bytes live in the
  private `workout-media` Storage bucket under
  `{user_id}/{workout_id}/{media_id}.{ext}`; this table is only metadata.
  Deliberately has NO `order_index`, unlike its sibling tables – see the
  TODO entry below.

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
- `npx expo prebuild --platform ios` – regenerate `apps/mobile/ios/`
  from `app.config.ts`. REQUIRED after changing the `plugins` array or
  anything else that lands in Info.plist. `/ios` and `/android` are
  gitignored and generated, and `expo run:ios` does NOT re-run prebuild
  when the folder already exists – so a new permission string is simply
  missing from the built app, and the app crashes the first time it
  touches the camera or photo library.

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
- [x] Images and video on a workout, added while logging
      (`ActiveWorkoutScreen`) and changed afterwards
      (`EditWorkoutScreen`), viewed read-only in the workout detail
      modal and, since the entry below, inline in the profile's history
      list too. Files live in the private `workout-media` Storage bucket;
      `workout_media` holds the metadata.
      The bytes go through a SECOND queue
      (`apps/mobile/lib/media-queue.ts`), never the sync queue. The sync
      queue rewrites itself in full on every enqueue and blocks on its
      head, so a video would both bloat every subsequent set write and
      lock all of them behind itself. The metadata row is still a normal
      `add_media` action in the sync queue – enqueued only AFTER the
      bytes land – which is what gives it its FK ordering for free: FIFO
      puts it behind the `start_workout` of a workout that may exist
      nowhere but the queue. Bytes-then-row is not interchangeable; the
      other order shows a broken image in history until the file arrives.
      Storage policies key on the FIRST path segment being `auth.uid()`,
      with no table lookup. That is a requirement, not an optimisation:
      the upload happens before the workout row has synced, so a policy
      joining `workouts` would reject the exact flow the app is built for.
      `on delete cascade` does NOT reach Storage, so every workout/media
      deletion also queues an explicit object removal, and an upload that
      has not run yet is cancelled. Cancelling records the id in a
      persisted `cancelled` set – without it a photo deleted mid-upload
      reappears as a row – and the caller ALWAYS also queues
      `delete_media`, which lands behind any `add_media` that won the
      race.
      No `order_index`, unlike sets and exercises. There the number is
      user-visible identity guarded by a unique constraint, and that
      constraint is what forces the whole counter apparatus. For media a
      collision would not reorder a gallery but make an upsert overwrite
      another row's `storage_path` – a lost photo. Ordering is
      `(added_at, id)`, with `added_at` set by the client so it reflects
      when the user added the file, not when it synced.
      `EditWorkoutScreen` now requires a drained media queue as well as a
      drained sync queue: media that has not reached the server is absent
      from the response and would look deleted. Unlike `drainQueue()` it
      does not await the flush – the head can be a twenty-megabyte video.

- [x] Editable profile details on a subpage under Profil
      (`apps/mobile/screens/ProfileSettingsScreen.tsx`, its own branch in
      the App.tsx router for the same two reasons as EditWorkoutScreen:
      the tab bar has no business being visible in a subpage, and coming
      back re-mounts ProfileScreen, which is what reloads it). Avatar,
      display name, home gym, birth date, body weight, height, short bio.
      The profile page itself is now READ-ONLY, and that is what removed
      the inline name field together with its blur-save and its
      save-on-unmount rescue - the whole apparatus existed only because a
      TextInput could be unmounted mid-edit by the tab bar.
      Everything is written on "Spara" as ONE upsert. They are columns of
      a single row, so per-field saving would be N round trips and a
      half-saved profile; it is also what lets "Avbryt" mean something.
      A picked image is a LOCAL PREVIEW until then - uploading on pick
      would leave a file in the bucket for every picture the user tried
      and rejected.
      The bytes go straight to Storage, NOT through the media queue. That
      queue exists for files big enough to bloat the sync queue, uploads
      that must survive days offline, and a video that must not block the
      sets behind it - none of which apply to a small image written from
      a screen that already requires a connection. Own private bucket
      `avatars`, not a folder inside `workout-media`: that bucket allows
      50 MB videos, and its local staging directory is swept by
      `sweepOrphanedMedia` on every app start.
      Every upload gets a FRESH uuid path. Reusing one path per user
      would leave both the signed-URL cache (keyed by path) and React
      Native's Image cache (keyed by URI) serving the previous picture.
      Order is upload → write row → delete the old object; a row write
      that fails deletes the object it just uploaded. The reverse order
      can leave a profile pointing at a file that is already gone
- [x] A workout's media shown inline in the profile's history list
      (`ProfileScreen.tsx`), not just after opening it. A card with media
      gets a 4:3 cover carousel on top, cropped, kant-i-kant with the
      card's rounded corners; a card with none is unchanged. Multiple
      files page horizontally with dots; tapping a tile opens
      `MediaViewer` on that item, tapping the text below still opens the
      workout detail modal.
      This is what makes `fetchWorkoutHistory`'s media genuinely looked
      at in the list itself, so the comment that used to justify NOT
      signing there ("nobody has opened it yet") no longer holds:
      `ProfileScreen` now signs every page's paths in ONE
      `signMediaUrls()` call right after the page loads, keyed by the
      same `${bucket}:${path}` cache `WorkoutDetailModal` already uses -
      opening a workout after scrolling past it costs nothing further.
      Rows render immediately with an empty placeholder tile; a failed
      signing round never surfaces as an error, same reasoning as the
      detail modal - not something the user typed and not something
      they could fix.
      New component `WorkoutMediaCarousel.tsx`, not a reuse of
      `MediaStrip`: that one is a picker strip with its own chrome
      (title, counter, 96px tiles) for the editing screens - different
      job from a full-bleed carousel in a history card.
- [x] The global exercise catalog now actually ships to a real project, and
      users can add their own exercises. The catalog was checked off at the
      top of this list from day one, but `supabase/seed.sql` only runs on
      `supabase db reset` (local dev) - `supabase db push`, the only command
      this repo's workflow uses against a real Supabase project, never
      touches it. The 26 rows moved into a real migration,
      `20260825090000_seed_global_exercises.sql` (a plain insert is safe -
      a migration runs exactly once); `seed.sql` now just points at it, so
      a local `db reset` doesn't insert the list twice.
      Custom exercises reuse plumbing that already existed: RLS already let
      a user insert their own row (`exercises_insert_own`), it was only the
      UI that was missing. Creation goes through the offline sync queue via
      a new `create_exercise` action - a client-generated id upserted into
      `exercises`, same pattern as `add_exercise`, so a workout logged fully
      offline can reference an exercise created in the same session (FIFO
      guarantees the create lands first). The exercise catalog cache
      (`EXERCISE_CACHE_KEY` in `queries.ts`) gets the new row appended too,
      not just the screen's in-memory state - otherwise a custom exercise
      created offline vanishes from the picker if the app is killed before
      `create_exercise` reaches the server.
      New shared component `apps/mobile/components/ExercisePicker.tsx`,
      replacing an identical Modal+FlatList that used to be duplicated in
      both `ActiveWorkoutScreen` and `EditWorkoutScreen` - both screens now
      needed the same search box and "add new" form, so keeping them
      duplicated meant writing it twice. Muscle group is picked from chips
      matching the 6 groups the seed data already uses
      (`apps/mobile/lib/muscle-groups.ts`), plus "annat" for free text -
      `muscle_group` has no enum in the database, so this is only a UI
      nudge to stop the same group fragmenting into casing/spelling
      variants. A name that already exists in the loaded catalog
      (case-insensitive) is blocked with a message pointing at the existing
      row rather than silently creating a duplicate.
      `ExercisePicker` now opens on a muscle-group chip screen (the 6 seeded
      groups, plus "Alla" for the old flat list and "Övrigt" catching
      anything - null or free-text from "annat" - that doesn't match one of
      the 6) instead of the flat list directly, so browsing scales as the
      catalog grows. The search box stays visible through every state and
      always searches the full catalog regardless of the active group -
      typing is the escape hatch for "I know the name but not the group".
      Deliberately has NO memory of the last-picked group across openings:
      the existing reset-on-close effect (already used for the search text
      and the create form) resets it too, so the picker always starts at
      the group screen. Creating a new exercise from inside a group
      pre-selects that group in the form - `formGroup` (the value about to
      be written) and `browseGroup` (which list is on screen) are
      deliberately separate state, since a search performed while inside a
      group must not change what the create form would save.
      The seeded catalog itself is now also available on a device that has
      NEVER had a successful fetch (a fresh install with no connection
      yet) - `fetchExerciseCatalog()`'s existing live-fetch → AsyncStorage
      cache fallback gets a third tier, `DEFAULT_EXERCISE_CATALOG`
      (`apps/mobile/lib/default-exercise-catalog.ts`), a static copy of the
      26 seeded rows kept in sync by hand with the seed migration. Its
      entries get synthetic ids and `fallback: true`, since they don't
      correspond to real `exercises` rows - the migration's ids are
      `gen_random_uuid()`, unknowable ahead of time. Picking one routes
      through `ExercisePicker`'s existing `onCreate` prop first (same
      mechanism as "Lägg till egen övning"), so it becomes the user's own
      real, syncable row before it's ever referenced by a
      `workout_exercises.exercise_id`. If the device later gets a real
      connection, that exercise may briefly show twice (the true global
      row plus the user's own copy, same name) - accepted tradeoff to
      avoid pinning fixed ids onto already-pushed production data.
      `fetchExerciseCatalog()`'s session-level promise memoization also
      had to learn not to remember a fallback result as "done" - otherwise
      reconnecting mid-session would keep serving the bundled list until
      the app was force-quit, since nothing else would ever trigger a
      retry.
- [ ] Body weight over time. Today `body_weight_kg` is one current
      value; a history is its own table plus a chart on the web, not a
      column to swap out later

## Open questions (to resolve before the relevant part is built)
- Login for the MVP: is email/password enough, or Apple/Google
  right away?
- Units: kg as default with lbs as a setting – OK?
- Should the web app also be able to log workouts, or is it
  stats-only?
- Should the web app show workout media? Nothing reads `workout_media`
  there today.
- Should the web app show the profile at all? It has never read
  `profiles`, so the avatar and the new details are mobile-only.
- The kg/lbs setting still has no UI. `profiles.unit` exists but nothing
  reads it, and a toggle that changes nothing would be worse than none -
  it needs every weight in both apps to honour it first.

## Environment
- Node 20+, pnpm 9+, Expo CLI, Supabase CLI
- `.env` in the repo root: SUPABASE_URL, SUPABASE_ANON_KEY
