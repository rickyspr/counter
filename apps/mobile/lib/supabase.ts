import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { createSupabaseClient } from "@repcount/shared";

const extra = Constants.expoConfig?.extra ?? {};

if (
  typeof extra.supabaseUrl !== "string" ||
  typeof extra.supabaseAnonKey !== "string"
) {
  throw new Error(
    "SUPABASE_URL/SUPABASE_ANON_KEY saknas. Kontrollera .env i repo-roten.",
  );
}

// Exporteras för uppladdningskön (media-queue.ts), som inte kan gå via
// supabase-js: filen måste streamas från disk med Expos File.upload för
// att en video inte ska läsas in i minnet i sin helhet. Den anropar
// alltså Storage-REST:et direkt och behöver både bas-URL och anon-nyckel.
// Uttryckligen typade, inte återexporterade ur `extra` - det objektet är
// otypat och exporten hade smittat anroparna med `any`.
export const supabaseUrl: string = extra.supabaseUrl;
export const supabaseAnonKey: string = extra.supabaseAnonKey;

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE (istället för implicit flow) rekommenderas av Supabase för
    // mobilappar utan client secret - används av Google-inloggningen.
    flowType: "pkce",
  },
});
