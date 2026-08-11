import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true quando as variáveis de ambiente do Supabase estão configuradas.
 *  Controla se o app usa o backend real (Supabase) ou o modo standalone
 *  (seed em memória + localStorage) — ver .env.example / docs/ARCHITECTURE.md. */
export const supabaseEnabled = !!url && !!anonKey;

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;
