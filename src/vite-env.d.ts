/// <reference types="vite/client" />

/** As duas únicas variáveis de ambiente que o app lê. Juntas, elas decidem se
 *  ele roda contra o Supabase ou em modo standalone — ver `.env.example` e
 *  `supabaseEnabled` em src/lib/supabaseClient.ts. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
