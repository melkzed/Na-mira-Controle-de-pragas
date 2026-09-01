// Supabase Edge Function — Login do Portal do Cliente.
//
// O cliente entra com CPF/CNPJ + senha definida pelo administrador. Isso não
// passa pelo Supabase Auth do jeito comum por dois motivos:
//
//  1. A senha do portal fica em `customers.portal_password_hash`. Conferir no
//     navegador exigiria que qualquer visitante pudesse LER a tabela de
//     clientes — documento, endereço, telefone e o próprio hash. A chave
//     anônima vai no bundle, então "qualquer visitante" é literal.
//  2. Sem sessão do Auth, o cliente não tem JWT, e sem JWT o RLS não deixa ele
//     ler nem os próprios atendimentos. O Portal simplesmente não funcionava
//     com RLS ligado.
//
// Aqui a conferência acontece no servidor, com a Service Role. Dando certo, a
// função garante um usuário de Auth para aquele cliente e devolve um
// `token_hash` de uso único; o navegador troca esse token por uma sessão de
// verdade (`verifyOtp`). A partir daí o cliente é um usuário autenticado
// normal, com claims `app_role: 'cliente'` e `customer_id`, e o RLS faz o
// resto (ver db/migrate_portal_rls.sql).
//
// Deploy:  supabase functions deploy login-cliente --no-verify-jwt
// O `--no-verify-jwt` é obrigatório: quem chama ainda não tem sessão nenhuma.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type, x-supabase-api-version';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': ALLOW_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function preflight(req: Request): Response {
  const requested = req.headers.get('Access-Control-Request-Headers');
  return new Response('ok', {
    headers: { ...cors, 'Access-Control-Allow-Headers': requested ?? ALLOW_HEADERS, 'Access-Control-Max-Age': '86400' },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Mesma mensagem para documento inexistente e senha errada: dizer qual dos
 *  dois falhou entrega ao atacante quais CPFs estão cadastrados. */
const RECUSA = 'Documento ou senha inválidos.';

const digitos = (v: string) => (v ?? '').replace(/\D/g, '');

async function sha256(texto: string): Promise<string> {
  const data = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Confere a senha contra o registro `sal:hash` — mesmo formato de lib/password.ts. */
async function conferirSenha(senha: string, guardado?: string | null): Promise<boolean> {
  if (!guardado) return false;
  const [sal, hash] = guardado.split(':');
  if (!sal || !hash) return false;
  return (await sha256(sal + senha)) === hash;
}

/** E-mail interno do login do cliente.
 *
 *  Sintético de propósito: o e-mail do cadastro pode estar vazio, repetido
 *  entre clientes, ou ser o mesmo de um funcionário — e qualquer um desses
 *  casos quebraria o login. O domínio `.invalid` é reservado por norma
 *  (RFC 2606), então nenhuma mensagem sai por engano para um endereço real. */
const emailDoCliente = (customerId: string) => `cliente.${customerId}@portal.invalid`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Função mal configurada: falta SUPABASE_SERVICE_ROLE_KEY.' }, 500);

  let body: { documento?: string; senha?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const doc = digitos(body.documento ?? '');
  const senha = body.senha ?? '';
  if (doc.length !== 11 && doc.length !== 14) return json({ error: RECUSA }, 401);
  if (!senha) return json({ error: RECUSA }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // O documento é guardado formatado ("123.456.789-00"), então a comparação
  // precisa ser pelos dígitos — daí a função auxiliar no banco.
  const { data: clientes, error: erroBusca } = await admin
    .rpc('portal_cliente_por_documento', { doc });
  if (erroBusca) return json({ error: `Falha ao consultar o cadastro: ${erroBusca.message}` }, 500);

  const cliente = (clientes ?? [])[0] as
    | { id: string; org_id: string; name: string; portal_access: boolean; is_active: boolean; portal_password_hash: string | null }
    | undefined;

  if (!cliente || !cliente.portal_access || !cliente.is_active) return json({ error: RECUSA }, 401);
  if (!(await conferirSenha(senha, cliente.portal_password_hash))) return json({ error: RECUSA }, 401);

  const email = emailDoCliente(cliente.id);

  // Usuário de Auth do cliente: criado na primeira entrada. A senha é
  // aleatória e nunca sai daqui — quem autentica é esta função, e a sessão
  // sai por token de uso único.
  const { data: existente } = await admin
    .from('users')
    .select('id, auth_user_id')
    .eq('customer_id', cliente.id)
    .eq('role', 'cliente')
    .maybeSingle();

  let authUserId = existente?.auth_user_id as string | undefined;

  if (!authUserId) {
    const senhaInterna = crypto.randomUUID() + crypto.randomUUID();
    const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
      email,
      password: senhaInterna,
      email_confirm: true,
      user_metadata: { customer_id: cliente.id, portal: true },
    });
    if (erroCriar || !criado?.user) {
      // Já existe no Auth (função reimplantada, linha de users apagada): busca
      // pelo e-mail em vez de falhar.
      const { data: lista } = await admin.auth.admin.listUsers();
      const achado = lista?.users?.find((u) => u.email === email);
      if (!achado) return json({ error: `Não foi possível preparar o acesso: ${erroCriar?.message ?? 'erro desconhecido'}` }, 500);
      authUserId = achado.id;
    } else {
      authUserId = criado.user.id;
    }
  }

  // Linha em public.users: é dela que o hook de Auth tira org_id, app_role e
  // customer_id para os claims do JWT — sem ela o RLS nega tudo.
  const { error: erroUpsert } = await admin.from('users').upsert(
    {
      id: existente?.id ?? crypto.randomUUID(),
      org_id: cliente.org_id,
      name: cliente.name,
      email,
      role: 'cliente',
      is_active: true,
      auth_user_id: authUserId,
      customer_id: cliente.id,
    },
    { onConflict: 'id' },
  );
  if (erroUpsert) return json({ error: `Não foi possível preparar o acesso: ${erroUpsert.message}` }, 500);

  // Token de uso único: o navegador troca por uma sessão real com verifyOtp.
  const { data: link, error: erroLink } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (erroLink || !link?.properties?.hashed_token) {
    return json({ error: `Não foi possível abrir a sessão: ${erroLink?.message ?? 'token não gerado'}` }, 500);
  }

  return json({ token_hash: link.properties.hashed_token, customer_id: cliente.id, name: cliente.name });
});
