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
import { useCustomersStore } from '@/store/customersStore';
import { localPassword } from '@/store/localPasswords';
import { documentDigits, looksLikeDocument, verifyPassword } from '@/lib/password';
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

/**
 * Login do cliente no Portal: CPF/CNPJ + senha definida pelo administrador.
 *
 * O cliente não é um usuário de `public.users` — é um `Customer`. Para o resto
 * do app (rotas, guardas, cabeçalho) enxergar sempre a mesma coisa, montamos
 * um `User` sintético de papel `cliente` apontando para o cadastro dele em
 * `customerId`; é por esse campo que o Portal filtra tudo.
 */
async function authenticateCustomer(login: string, password: string): Promise<AuthResult> {
  const digits = documentDigits(login);
  const customer = useCustomersStore
    .getState()
    .customers.find((c) => documentDigits(c.document ?? '') === digits);
  if (!customer || !customer.portalAccess || !customer.isActive) return { user: null, error: 'invalid_email' };
  if (!(await verifyPassword(password, customer.portalPasswordHash))) return { user: null, error: 'invalid_password' };
  return {
    user: {
      id: `cliente-${customer.id}`,
      orgId: customer.orgId,
      name: customer.name,
      email: customer.email ?? '',
      phone: customer.phone,
      role: 'cliente',
      isActive: true,
      customerId: customer.id,
    },
  };
}

/** Reconstrói o usuário sintético do cliente a partir do cadastro — usado
 *  para reidratar a sessão do Portal ao recarregar a página. */
export function customerSessionUser(customerId: string): User | null {
  const c = useCustomersStore.getState().customers.find((x) => x.id === customerId);
  if (!c || !c.portalAccess || !c.isActive) return null;
  return {
    id: `cliente-${c.id}`, orgId: c.orgId, name: c.name, email: c.email ?? '',
    phone: c.phone, role: 'cliente', isActive: true, customerId: c.id,
  };
}

export async function authenticate(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();

  // CPF/CNPJ no lugar do e-mail = tentativa de login do Portal do Cliente.
  // Vale nos dois modos: o acesso do cliente é do cadastro dele, não do
  // Supabase Auth (que só conhece a equipe interna).
  if (looksLikeDocument(normalized)) return authenticateCustomer(normalized, password);

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
  // Técnico cadastrado com senha definida pelo administrador usa a senha
  // dele; os usuários de exemplo continuam na senha de demonstração.
  const expected = localPassword(normalized) ?? DEMO_PASSWORD;
  if (password !== expected) return { user: null, error: 'invalid_password' };
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
  { email: 'rafael@namira.com', role: 'funcionario', label: 'Funcionário · Supervisão' },
  { email: 'camila@namira.com', role: 'funcionario', label: 'Funcionário · Contabilidade' },
  { email: 'diego@namira.com', role: 'tecnico', label: 'Técnico' },
];

/** Rota inicial após o login, conforme o papel. */
export function landingPathFor(user: User): string {
  if (user.role === 'cliente') return '/portal';
  return user.role === 'tecnico' ? '/campo' : '/';
}
