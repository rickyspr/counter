import { createSupabaseClient } from "@counter/shared";

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "SUPABASE_URL/SUPABASE_ANON_KEY saknas. Kontrollera .env i repo-roten.",
  );
}

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
