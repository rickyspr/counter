# Counter

Logga dina gympass och följ din utveckling över tid.

- **Mobilapp** (Expo/React Native): logga övningar, set, reps och vikt.
- **Webb** (React): statistik över tid – volym, passfrekvens, personbästa.
- **Backend**: Supabase (Postgres + Auth) med konto och synk mellan enheter.

Se [CLAUDE.md](CLAUDE.md) för arkitektur, datamodell och projektregler.

## Kom igång

Krav: Node 20+, pnpm 9+. Xcode krävs bara om du vill testa
Google-inloggning i mobilappen (se nedan).

```
pnpm install
```

Kopiera `.env.example` till `.env` i repo-roten och fyll i era
Supabase-uppgifter (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).

## Testa webben

```
pnpm --filter web dev
```

Öppna adressen som skrivs ut (t.ex. `http://localhost:5173`). Logga in
eller skapa konto, logga ett pass i mobilappen för att se statistik.
Under Profil kan du exportera hela din träningshistorik som CSV.

## Testa mobilappen

Två sätt att köra appen, beroende på vad du vill testa:

**Snabbast – Expo Go** (fungerar för inloggning med e-post/lösenord,
**inte** Google-inloggning):

```
pnpm --filter mobile start
```

Skanna QR-koden med Expo Go-appen (iOS/Android), eller tryck `i`/`a`
för att öppna i simulator/emulator.

**Med Google-inloggning – native build** (kräver Xcode, bara på Mac):

```
cd apps/mobile
npx expo run:ios
```

Bygger och installerar en riktig app i iOS-simulatorn (tar några
minuter första gången). Appen dyker upp som en egen ikon ("mobile") på
simulatorns hemskärm. Nästa gång räcker det med `pnpm --filter mobile
start` och att öppna appen direkt – ombyggnad (`expo run:ios`) behövs
bara igen om native-konfiguration (`app.config.ts`) eller
native-paket ändras.

## Lokal databas (valfritt)

Om du vill testa utan att röra den skarpa Supabase-databasen:

```
supabase start
```

Peka tillfälligt om `.env` mot URL:en och anon-nyckeln som kommandot
skriver ut (`API_URL`, `ANON_KEY`). `supabase db reset` återställer
den lokala databasen till migrationerna + seed-datat.

## Köra tester

```
pnpm --filter @counter/shared test
```
