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

/**
 * Mensagem de erro real de uma Edge Function.
 *
 * `supabase.functions.invoke` devolve `data: null` sempre que a função
 * responde com status fora do 2xx — ou seja, justamente quando ela explicou
 * o motivo (403 "sem permissão", 409 "e-mail já cadastrado"…). O corpo da
 * resposta fica escondido em `error.context`, que é o `Response` original.
 * Sem isso o usuário só vê "Edge Function returned a non-2xx status code" e
 * ninguém descobre o que houve de verdade.
 */
export async function functionErrorMessage(error: unknown, data: unknown, fallback: string): Promise<string> {
  const fromData = (data as { error?: string } | null)?.error;
  if (fromData) return fromData;
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      try {
        const text = await context.clone().text();
        if (text.trim()) return text.trim();
      } catch { /* corpo já consumido — cai no fallback */ }
    }
  }
  return fallback;
}

/**
 * Converte um builder do PostgREST numa Promise de verdade.
 *
 * O builder é um `PromiseLike`: tem `.then`, não tem `.catch`. Encadear
 * `.catch` direto nele compila em runtime mas quebra o `tsc`
 * ("Property 'catch' does not exist on type 'PromiseLike<void>'") — e é
 * justamente onde queremos capturar falha de rede, que não vira `error` na
 * resposta, e sim exceção. `Promise.resolve` adota o thenable preservando o
 * tipo da resposta, então `.then`/`.catch` seguem tipados.
 */
export function asPromise<T>(builder: PromiseLike<T>): Promise<T> {
  return Promise.resolve(builder);
}
