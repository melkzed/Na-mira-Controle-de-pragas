// Supabase Edge Function — Convite de novo funcionário (login real).
//
// A tela "Novo técnico" (TecnicosPage) chama esta função em vez de inserir
// direto em public.users, porque criar um LOGIN de verdade (não só uma linha
// de cadastro) exige a Service Role Key — que nunca pode ficar no navegador.
// Fluxo: valida que quem está chamando é admin/supervisor da própria
// organização → cria o login → grava public.users já com auth_user_id
// vinculado.
//
// A senha é definida pelo administrador no formulário e vai no corpo da
// requisição (sempre por HTTPS, e nunca gravada em lugar nenhum além do
// Supabase Auth, que guarda só o hash). Se o corpo não trouxer senha, cai no
// convite por e-mail — é o caso da importação por planilha sem coluna SENHA.
//
// Também atende `action: 'redefinir_senha'`, para o administrador trocar a
// senha de um técnico que esqueceu a dele.
//
// Deploy:  supabase functions deploy convidar-tecnico
// Não precisa configurar nenhum secret — SUPABASE_URL, SUPABASE_ANON_KEY e
// SUPABASE_SERVICE_ROLE_KEY já existem automaticamente no ambiente da função.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// O supabase-js manda cabeçalhos próprios em toda chamada (`x-client-info`,
// `apikey`, e versões novas também `x-supabase-api-version`). Se qualquer um
// deles ficar de fora do Access-Control-Allow-Headers, o navegador barra o
// preflight e a requisição nem chega a rodar — o erro aparece como CORS, não
// como falha da função. Por isso a lista abaixo é fixa E o preflight ainda
// devolve de volta o que o navegador pediu.
const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type, x-supabase-api-version';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': ALLOW_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Resposta do preflight, ecoando os cabeçalhos que o navegador anunciou. */
function preflight(req: Request): Response {
  const requested = req.headers.get('Access-Control-Request-Headers');
  return new Response('ok', {
    headers: {
      ...cors,
      'Access-Control-Allow-Headers': requested ?? ALLOW_HEADERS,
      'Access-Control-Max-Age': '86400',
    },
  });
}

const ALLOWED_ROLES = ['admin', 'supervisor', 'financeiro', 'atendimento', 'estoque', 'tecnico'];
const CAN_INVITE = ['admin', 'supervisor'];

/** Mínimo do Supabase Auth. Mantido aqui para a mensagem sair em português. */
const MIN_PASSWORD = 6;
const senhaCurta = () => `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;

/** Prioridade para escolher a linha de public.users quando existe mais de uma
 *  para a mesma pessoa (cadastro duplicado: convidada como técnica e depois
 *  promovida por SQL, por exemplo). Quem manda é o papel mais permissivo. */
const ROLE_RANK: Record<string, number> = {
  admin: 6, supervisor: 5, financeiro: 4, atendimento: 3, estoque: 2, tecnico: 1,
};

interface CallerRow {
  id: string;
  org_id: string;
  role: string;
  is_active: boolean;
  email: string | null;
  auth_user_id: string | null;
}

function bestRow(rows: CallerRow[]): CallerRow | null {
  const ranked = [...rows].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return (ROLE_RANK[b.role] ?? 0) - (ROLE_RANK[a.role] ?? 0);
  });
  return ranked[0] ?? null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json({ error: 'Use POST.', code: 'method' }, 405);

  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    if (!token) return json({ error: 'Não autenticado — faça login novamente.', code: 'no_token' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Cliente "como quem chamou" — só para descobrir quem é (RLS normal).
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) {
      return json({ error: 'Sessão expirada — saia e entre de novo para convidar.', code: 'bad_session' }, 401);
    }

    // A partir daqui, service role — bypassa RLS de propósito (só depois de
    // confirmar quem está chamando e que tem permissão pra convidar).
    const admin = createClient(supabaseUrl, serviceKey);

    const authId = authData.user.id;
    const authEmail = (authData.user.email ?? '').trim().toLowerCase();

    // Procura o cadastro de quem chamou. Antes era só por auth_user_id com
    // .maybeSingle() — o que quebrava em dois casos reais: cadastro criado à
    // mão (sem auth_user_id preenchido) e cadastro duplicado (maybeSingle vira
    // erro). Agora busca pelos dois caminhos e escolhe a melhor linha.
    const byAuth = await admin
      .from('users')
      .select('id, org_id, role, is_active, email, auth_user_id')
      .eq('auth_user_id', authId);

    let rows = (byAuth.data ?? []) as CallerRow[];
    let matchedByEmail = false;
    if (rows.length === 0 && authEmail) {
      const byEmail = await admin
        .from('users')
        .select('id, org_id, role, is_active, email, auth_user_id')
        .ilike('email', authEmail);
      rows = (byEmail.data ?? []) as CallerRow[];
      matchedByEmail = rows.length > 0;
    }

    const callerRow = bestRow(rows);
    if (!callerRow) {
      return json({
        error: `Seu login (${authEmail || authId}) não tem cadastro em Técnicos/Equipe. Peça a um administrador para cadastrar o seu e-mail no sistema.`,
        code: 'caller_not_found',
      }, 403);
    }
    if (!callerRow.is_active) {
      return json({ error: 'Seu cadastro está inativo — peça a um administrador para reativá-lo.', code: 'caller_inactive' }, 403);
    }
    if (!CAN_INVITE.includes(callerRow.role)) {
      return json({
        error: `Seu acesso é "${callerRow.role}" e só admin ou supervisor podem cadastrar técnicos. Peça a um administrador para alterar o seu papel.`,
        code: 'caller_role',
      }, 403);
    }
    // Cadastro achado pelo e-mail: vincula agora, para o login e as políticas
    // de RLS pararem de depender desse resgate na próxima vez.
    if (matchedByEmail && !callerRow.auth_user_id) {
      await admin.from('users').update({ auth_user_id: authId }).eq('id', callerRow.id);
    }

    const body = await req.json().catch(() => ({}));

    // ── Redefinir a senha de um técnico já cadastrado ─────────────────────
    if (body.action === 'redefinir_senha') {
      const targetId = String(body.userId ?? '');
      const password = String(body.password ?? '');
      if (!targetId || !password) return json({ error: 'Informe o técnico e a nova senha.', code: 'missing_fields' }, 400);
      if (password.length < MIN_PASSWORD) return json({ error: senhaCurta(), code: 'weak_password' }, 400);

      // Só dentro da própria organização — o id vem do navegador.
      const { data: target } = await admin
        .from('users')
        .select('id, auth_user_id, org_id')
        .eq('id', targetId)
        .eq('org_id', callerRow.org_id)
        .maybeSingle();
      if (!target?.auth_user_id) {
        return json({ error: 'Esse técnico ainda não tem login vinculado — cadastre-o novamente para criar o acesso.', code: 'target_not_found' }, 404);
      }
      const { error: updateError } = await admin.auth.admin.updateUserById(target.auth_user_id, { password });
      if (updateError) return json({ error: updateError.message, code: 'update_failed' }, 400);
      return json({ ok: true });
    }

    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = body.phone ? String(body.phone).trim() : null;
    const fieldAppAccess = body.fieldAppAccess !== false;
    const role = ALLOWED_ROLES.includes(body.role) ? body.role : 'tecnico';
    const redirectTo = body.redirectTo ? String(body.redirectTo) : undefined;
    const password = body.password ? String(body.password) : '';

    if (!name || !email) return json({ error: 'Nome e e-mail são obrigatórios.', code: 'missing_fields' }, 400);
    if (password && password.length < MIN_PASSWORD) return json({ error: senhaCurta(), code: 'weak_password' }, 400);

    const { data: existing } = await admin
      .from('users')
      .select('id')
      .eq('org_id', callerRow.org_id)
      .eq('email', email)
      .maybeSingle();
    if (existing) return json({ error: 'Já existe um funcionário com esse e-mail nesta organização.', code: 'duplicate' }, 409);

    // Com senha definida pelo administrador, o login já nasce pronto para uso
    // (email_confirm: true dispensa a confirmação por e-mail, que aqui só
    // atrasaria o primeiro acesso). Sem senha, convida por e-mail.
    let authUser: { id: string } | null = null;
    if (password) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (createError || !created?.user) {
        return json({
          error: createError?.message ?? 'Não foi possível criar o login do técnico.',
          code: 'create_failed',
        }, 400);
      }
      authUser = created.user;
    } else {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { name },
        redirectTo,
      });
      if (inviteError || !invited?.user) {
        return json({
          error: inviteError?.message ?? 'Não foi possível enviar o convite por e-mail.',
          code: 'invite_failed',
        }, 400);
      }
      authUser = invited.user;
    }

    const newUser = {
      id: crypto.randomUUID(),
      org_id: callerRow.org_id,
      auth_user_id: authUser.id,
      name,
      email,
      phone,
      role,
      is_active: true,
      field_app_access: fieldAppAccess,
    };
    const { error: insertError } = await admin.from('users').insert(newUser);
    if (insertError) {
      // O login já existe, mas o cadastro em public.users falhou — avisa com
      // uma mensagem que explica o que aconteceu de verdade.
      return json({
        error: `O login foi criado, mas houve um erro ao salvar o cadastro: ${insertError.message}`,
        code: 'insert_failed',
      }, 500);
    }

    return json({ user: newUser, invited: !password });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro interno.', code: 'exception' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
