import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { createSupabaseClient } from "@repcount/shared";

const { supabaseUrl, supabaseAnonKey } = Constants.expoConfig?.extra ?? {};

if (typeof supabaseUrl !== "string" || typeof supabaseAnonKey !== "string") {
  throw new Error(
    "SUPABASE_URL/SUPABASE_ANON_KEY saknas. Kontrollera .env i repo-roten.",
  );
}

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
