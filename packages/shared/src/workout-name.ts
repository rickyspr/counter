// Förvalt namn på ett pass, härlett ur starttiden. Används både som grå
// platshållare medan passet loggas och som det namn som faktiskt SKRIVS
// när passet avslutas utan att ha döpts - se ActiveWorkoutScreen.
//
// Ligger i shared, inte i appen: värdet hamnar i databasen och är
// därmed inte ren presentation, och webben visar samma pass.
//
// Gränserna är valda så att ordet stämmer med vad man skulle säga på
// svenska, inte så att hinkarna blir lika stora.
// Speglar `workouts_name_length` i migrationen
// 20260821090000_workout_name.sql. Varje fält som skriver namnet måste
// begränsa sig till det här - ett brutet check-villkor ger 23514, som
// synk-kön klassar som permanent och alltså SLÄNGER.
export const WORKOUT_NAME_MAX_LENGTH = 80;

const NIGHT_ENDS_AT = 5;
const MORNING_ENDS_AT = 12;
const DAY_ENDS_AT = 18;

export function defaultWorkoutName(startedAt: string | Date): string {
  const date = typeof startedAt === "string" ? new Date(startedAt) : startedAt;

  // getHours(), inte getUTCHours(). Namnet handlar om klockan där
  // användaren står: ett pass 08:00 svensk sommartid är 06:00 UTC, och
  // med UTC-timmen hade det hetat "Gym på natten".
  const hour = date.getHours();

  if (hour < NIGHT_ENDS_AT) return "Gym på natten";
  if (hour < MORNING_ENDS_AT) return "Gym på förmiddagen";
  if (hour < DAY_ENDS_AT) return "Gym på dagen";
  return "Gym på kvällen";
}
