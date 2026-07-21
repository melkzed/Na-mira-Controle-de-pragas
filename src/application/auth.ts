/**
 * Aplicação — autenticação.
 * No modo standalone (seed), valida credenciais contra os usuários de exemplo.
 * Ao integrar o Supabase, troque `authenticate` por uma chamada ao Supabase Auth
 * mantendo a mesma assinatura — as telas de login não mudam.
 */
import type { User } from '@/domain/types';
import { users } from '@/infrastructure/seed/data';

/** Senha única de demonstração para todos os usuários de exemplo. */
export const DEMO_PASSWORD = 'namira123';

/**
 * Credenciais específicas (contas reais). Têm senha própria, distinta da senha
 * de demonstração, e não aparecem no acesso rápido da tela de login.
 */
const ACCOUNT_PASSWORDS: Record<string, string> = {
  'namiracomercial@gmail.com': 'vanessa@adm',
};

export interface AuthResult {
  user: User | null;
  error?: 'invalid_email' | 'invalid_password';
}

export function authenticate(email: string, password: string): AuthResult {
  const normalized = email.trim().toLowerCase();
  const user = users.find((u) => u.email.toLowerCase() === normalized && u.isActive);
  if (!user) return { user: null, error: 'invalid_email' };
  // Contas com senha própria exigem essa senha; as demais aceitam a senha demo.
  const expected = ACCOUNT_PASSWORDS[normalized] ?? DEMO_PASSWORD;
  if (password !== expected) return { user: null, error: 'invalid_password' };
  return { user };
}

/** Contas de demonstração exibidas na tela de login (acesso rápido). */
export const demoAccounts: { email: string; role: string; label: string }[] = [
  { email: 'marina@namira.com', role: 'admin', label: 'Administrador' },
  { email: 'rafael@namira.com', role: 'supervisor', label: 'Supervisor' },
  { email: 'camila@namira.com', role: 'financeiro', label: 'Financeiro' },
  { email: 'diego@namira.com', role: 'tecnico', label: 'Técnico' },
];

/** Rota inicial após o login, conforme o papel. */
export function landingPathFor(user: User): string {
  return user.role === 'tecnico' ? '/campo' : '/';
}
