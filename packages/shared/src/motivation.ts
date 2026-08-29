// Motiverande text: hälsningen på mobilens Hem-skärm och den bekräftande
// meningen efter ett avslutat pass.
//
// Ligger i shared av samma skäl som stats-funktionerna: ren, testbar
// logik utan beroenden, som båda apparna kan komma att vilja ha. Texten
// SKRIVS aldrig till databasen (till skillnad från defaultWorkoutName),
// den är ren presentation - men seedningen och tid-på-dygnet-hinkarna är
// värda att testa.
//
// Allt val är DETERMINISTISKT via en seedad PRNG: samma indata ger alltid
// samma mening. Hem-hälsningen seedas på datum + hink så den är stabil
// hela dagen men byts till nästa, och skiljer morgon från kväll. Pass-
// berömmet seedas på passets sluttid, så samma pass alltid ger samma
// mening men två pass efter varandra ger olika.

// Lokal timme, precis som defaultWorkoutName - hinken handlar om klockan
// där användaren står, inte om UTC.
const MORNING_STARTS_AT = 5;
const DAY_STARTS_AT = 10;
const AFTERNOON_STARTS_AT = 14;
const EVENING_STARTS_AT = 18;

export type TimeOfDay = "natt" | "morgon" | "dag" | "eftermiddag" | "kväll";

export function timeOfDayBucket(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour < MORNING_STARTS_AT) return "natt";
  if (hour < DAY_STARTS_AT) return "morgon";
  if (hour < AFTERNOON_STARTS_AT) return "dag";
  if (hour < EVENING_STARTS_AT) return "eftermiddag";
  return "kväll";
}

// FNV-1a. Behöver bara vara stabil och sprida strängar jämnt över
// uint32 - inte kryptografiskt något.
function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32: liten deterministisk PRNG. Ett anrop räcker här - vi vill
// bara ha ett tal i [0, 1) ur en seed.
function seededUnit(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pickSeeded(list: readonly string[], seed: string): string {
  if (list.length === 0) return "";
  const index = Math.floor(seededUnit(hashString(seed)) * list.length);
  // noUncheckedIndexedAccess: index ligger alltid i [0, length) men
  // typen vet inte det.
  return list[index] ?? list[0] ?? "";
}

// Fyller i namnet i en mall. Två markörer:
//   {, name}   -> ", Rickard"  eller  ""      (bisats-suffix)
//   {name|dig} -> "Rickard"     eller  "dig"   (mitt i en mening)
// Så varje mall funkar både med och utan namn, utan trasig interpunktion.
function fillName(template: string, name: string): string {
  return template
    .replace(/\{name\|([^}]*)\}/g, (_, fallback: string) =>
      name ? name : fallback,
    )
    .replace(/\{, name\}/g, () => (name ? `, ${name}` : ""))
    .replace(/\{name\}/g, () => name);
}

// Förnamnet att tilltala användaren med. Tomt = "inget namn": tilltala
// hen då utan namn istället för med en e-postadress eller "Namnlös".
export function firstName(displayName: string | null | undefined): string {
  if (!displayName) return "";
  const trimmed = displayName.trim();
  if (!trimmed || trimmed.includes("@")) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

interface GreetingPool {
  headline: readonly string[];
  subline: readonly string[];
}

const GREETINGS: Record<TimeOfDay, GreetingPool> = {
  natt: {
    headline: ["Sent uppe{, name}", "Nattläge{, name}", "Sena timmar{, name}", "Fortfarande igång{, name}"],
    subline: [
      "En sen kväll stoppar inte {name|dig}.",
      "Medan andra sover bygger {name|du} styrka.",
      "Nattens tystnad, dina lyft.",
      "Sent, men det räknas lika mycket.",
      "Disciplin är att träna när ingen ser på.",
      "Kort natt, starkt sinne – kör.",
      "Det här är hängivenhet, rakt av.",
    ],
  },
  morgon: {
    headline: ["Godmorgon{, name}", "God morgon{, name}", "Morgon{, name}", "Upp och kör{, name}"],
    subline: [
      "Dags att sätta tonen för dagen.",
      "Ingen har ångrat ett morgonpass.",
      "Vakna musklerna – nu kör vi{, name}.",
      "Först gymmet, sen resten av världen.",
      "Morgonpass är dagens bästa beslut.",
      "Ny dag, nya lyft{, name}.",
      "Börja dagen med att vinna.",
    ],
  },
  dag: {
    headline: ["Hej{, name}", "Mitt på dagen{, name}", "Middagsdags{, name}", "Dagpass{, name}"],
    subline: [
      "En paus från allt annat – väl använd.",
      "Mitt i dagen, mitt i steget framåt.",
      "Ladda om med järn{, name}.",
      "Lunchpass? Snyggt prioriterat.",
      "Bryt dagen med något som räknas.",
      "Halvvägs genom dagen, helt fokuserad.",
      "Nu tar {name|du} tag i det.",
    ],
  },
  eftermiddag: {
    headline: ["God eftermiddag{, name}", "Eftermiddag{, name}", "Halva dagen kvar{, name}", "Eftermiddagspass{, name}"],
    subline: [
      "Perfekt läge – kroppen är uppvärmd av dagen.",
      "Eftermiddagens bästa timme börjar nu.",
      "Trött? Passet fixar det{, name}.",
      "Avsluta arbetsdagen med en seger.",
      "Nu när kroppen vaknat på riktigt – kör.",
      "Släpp dagen. Lyft istället.",
      "Andra halvan av dagen tillhör {name|dig}.",
    ],
  },
  kväll: {
    headline: ["God kväll{, name}", "Kväll{, name}", "Kvällspass{, name}", "Dags att köra{, name}"],
    subline: [
      "Avsluta dagen starkare än du började den.",
      "Kvällspass: lugnet och järnet.",
      "Dagen är klar. Nu är det din tid.",
      "Ett pass nu och du somnar som en sten.",
      "Kvällen tillhör {name|dig}.",
      "Töm huvudet, fyll på med styrka.",
      "Sista rycket för dagen – gör det bra.",
    ],
  },
};

export interface HomeGreeting {
  headline: string;
  subline: string;
}

export function pickHomeGreeting({
  name,
  now,
}: {
  name: string;
  now: Date;
}): HomeGreeting {
  const bucket = timeOfDayBucket(now);
  const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const pool = GREETINGS[bucket];
  // Seeden tar INTE med namnet: när förnamnet laddas in (från cache/
  // profil) ska samma mening stå kvar och bara få ett namn tillagt, inte
  // bytas ut.
  return {
    headline: fillName(pickSeeded(pool.headline, `${dateKey}|${bucket}|head`), name),
    subline: fillName(pickSeeded(pool.subline, `${dateKey}|${bucket}|sub`), name),
  };
}

const PRAISE_GENERAL: readonly string[] = [
  "Snyggt jobbat{, name}!",
  "Starkt kört{, name}!",
  "Det där satt.",
  "Grymt pass{, name}!",
  "Klart och avklarat. Bra jobbat.",
  "Så ska det se ut{, name}.",
  "Ännu ett pass i banken.",
  "Bra där. Kroppen tackar dig senare.",
  "Avklarat – snyggt.",
  "Det räknas. Varenda rep.",
];

const PRAISE_BEAT_PREVIOUS: readonly string[] = [
  "Tyngre än förra gången. Det är progression{, name}.",
  "Nytt personligt kap i det passet – starkt!",
  "Du slog ditt tidigare resultat. Snyggt.",
  "Kurvan pekar uppåt. Fortsätt så.",
];

const PRAISE_LATE: readonly string[] = [
  "En sen kväll, men du körde ändå. Respekt.",
  "Sent på dygnet och ändå full insats. Starkt.",
  "Det här är hängivenhet. Bra jobbat{, name}.",
];

export function pickWorkoutPraise({
  name,
  endedAt,
  beatPrevious,
}: {
  name: string;
  endedAt: string;
  beatPrevious: boolean;
}): string {
  const candidates: string[] = [...PRAISE_GENERAL];
  // Dubblas för att väga upp de relevanta meningarna utan att helt
  // tränga ut de allmänna.
  if (beatPrevious) candidates.push(...PRAISE_BEAT_PREVIOUS, ...PRAISE_BEAT_PREVIOUS);
  if (timeOfDayBucket(new Date(endedAt)) === "natt") candidates.push(...PRAISE_LATE);
  return fillName(pickSeeded(candidates, endedAt), name);
}
