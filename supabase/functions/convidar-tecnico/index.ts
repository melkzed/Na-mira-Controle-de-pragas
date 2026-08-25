// Supabase Edge Function — Convite de novo funcionário (login real).
//
// A tela "Novo técnico" (TecnicosPage) chama esta função em vez de inserir
// direto em public.users, porque criar um LOGIN de verdade (não só uma linha
// de cadastro) exige a Service Role Key — que nunca pode ficar no navegador.
// Fluxo: valida que quem está chamando é admin/supervisor da própria
// organização → convida por e-mail via Supabase Auth (o próprio Supabase
// manda o e-mail, com um link para a pessoa escolher a senha) → grava
// public.users já com auth_user_id vinculado.
//
// Deploy:  supabase functions deploy convidar-tecnico
// Não precisa configurar nenhum secret — SUPABASE_URL, SUPABASE_ANON_KEY e
// SUPABASE_SERVICE_ROLE_KEY já existem automaticamente no ambiente da função.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_ROLES = ['admin', 'supervisor', 'financeiro', 'atendimento', 'estoque', 'tecnico'];
const CAN_INVITE = ['admin', 'supervisor'];

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
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
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = body.phone ? String(body.phone).trim() : null;
    const fieldAppAccess = body.fieldAppAccess !== false;
    const role = ALLOWED_ROLES.includes(body.role) ? body.role : 'tecnico';
    const redirectTo = body.redirectTo ? String(body.redirectTo) : undefined;

    if (!name || !email) return json({ error: 'Nome e e-mail são obrigatórios.', code: 'missing_fields' }, 400);

    const { data: existing } = await admin
      .from('users')
      .select('id')
      .eq('org_id', callerRow.org_id)
      .eq('email', email)
      .maybeSingle();
    if (existing) return json({ error: 'Já existe um funcionário com esse e-mail nesta organização.', code: 'duplicate' }, 409);

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

    const newUser = {
      id: crypto.randomUUID(),
      org_id: callerRow.org_id,
      auth_user_id: invited.user.id,
      name,
      email,
      phone,
      role,
      is_active: true,
      field_app_access: fieldAppAccess,
    };
    const { error: insertError } = await admin.from('users').insert(newUser);
    if (insertError) {
      // O convite já foi enviado (o login existe) mas o cadastro em
      // public.users falhou — não dá pra desfazer o e-mail já mandado, então
      // avisa com uma mensagem que explica o que aconteceu de verdade.
      return json({
        error: `O convite foi enviado, mas houve um erro ao salvar o cadastro: ${insertError.message}`,
        code: 'insert_failed',
      }, 500);
    }

    return json({ user: newUser });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro interno.', code: 'exception' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
