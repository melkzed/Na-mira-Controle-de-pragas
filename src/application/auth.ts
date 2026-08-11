/**
 * Aplicação — autenticação.
 * Com Supabase configurado (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY), usa
 * Supabase Auth de verdade — cada funcionário com e-mail e senha próprios,
 * sessão compartilhada entre dispositivos via o mesmo backend.
 * Sem essas variáveis, cai no modo standalone (seed em memória) para
 * desenvolvimento/demonstração sem backend — mesma assinatura das funções,
 * a tela de login não muda.
 */
import type { User } from '@/domain/types';
import type { UserRole } from '@/domain/enums';
import { useUsersStore } from '@/store/entityStores';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';

/** Senha única de demonstração — vale só no modo standalone (sem Supabase). */
export const DEMO_PASSWORD = 'namira123';

export interface AuthResult {
  user: User | null;
  error?: 'invalid_email' | 'invalid_password' | 'unknown';
}

interface UsersRow {
  id: string;
  org_id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
}

function rowToUser(row: UsersRow): User {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    role: row.role,
    isActive: row.is_active,
  };
}

/** Busca o registro de aplicação (public.users) vinculado ao usuário logado
 *  no Supabase Auth — é esse registro que carrega org/role/nome exibidos no app. */
async function fetchAppUser(authUserId: string): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, org_id, name, email, phone, avatar_url, role, is_active')
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) {
    console.error('[auth] fetchAppUser: nenhuma linha em public.users para', authUserId, error);
    return null;
  }
  return rowToUser(data as UsersRow);
}

export async function authenticate(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();

  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
    if (error || !data.user) return { user: null, error: 'invalid_password' };
    const user = await fetchAppUser(data.user.id);
    if (!user) {
      // Login válido no Supabase Auth, mas sem cadastro correspondente em
      // public.users (ou usuário inativo) — trata como acesso negado.
      await supabase.auth.signOut();
      return { user: null, error: 'invalid_email' };
    }
    return { user };
  }

  // Modo standalone (sem Supabase configurado): valida contra o seed local.
  const found = useUsersStore.getState().items.find((u) => u.email.toLowerCase() === normalized && u.isActive);
  if (!found) return { user: null, error: 'invalid_email' };
  if (password !== DEMO_PASSWORD) return { user: null, error: 'invalid_password' };
  return { user: found };
}

/** Reidrata o usuário a partir de uma sessão Supabase já persistida (recarregar
 *  a página, outra aba). No modo standalone não há sessão a resolver aqui —
 *  a store cuida disso sincronamente pelo localStorage simples. */
export async function getSessionUser(): Promise<User | null> {
  if (!supabaseEnabled || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  const authUser = data.session?.user;
  if (!authUser) return null;
  return fetchAppUser(authUser.id);
}

export async function signOut(): Promise<void> {
  if (supabaseEnabled && supabase) await supabase.auth.signOut();
}

/** Contas de demonstração exibidas na tela de login (acesso rápido) — só no
 *  modo standalone; com Supabase configurado, cada funcionário usa a própria
 *  conta e este atalho não aparece. */
export const demoAccounts: { email: string; role: string; label: string }[] = supabaseEnabled ? [] : [
  { email: 'marina@namira.com', role: 'admin', label: 'Administrador' },
  { email: 'rafael@namira.com', role: 'supervisor', label: 'Supervisor' },
  { email: 'camila@namira.com', role: 'financeiro', label: 'Financeiro' },
  { email: 'diego@namira.com', role: 'tecnico', label: 'Técnico' },
];

/** Rota inicial após o login, conforme o papel. */
export function landingPathFor(user: User): string {
  return user.role === 'tecnico' ? '/campo' : '/';
}
