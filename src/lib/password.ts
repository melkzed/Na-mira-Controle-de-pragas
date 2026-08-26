/**
 * Senha do Portal do Cliente — guarda e conferência.
 *
 * O administrador define a senha do cliente, então ela precisa ficar
 * registrada em algum lugar. O que fica gravado é só o **hash** (SHA-256 com
 * sal aleatório por cliente): dá para conferir no login, mas não dá para ler
 * a senha de volta — nem o administrador, nem quem abrir o `localStorage`.
 * Por isso a tela só oferece "redefinir", nunca "ver a senha".
 *
 * Isto atende o modo standalone. Quando o Portal passar pelo Supabase Auth, a
 * conferência sai daqui e vai para o Auth (que já guarda só o hash) — a
 * assinatura destas funções é o único ponto a trocar.
 */

/** Sal aleatório de 16 bytes, em hexadecimal. */
function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Gera o registro a guardar: `sal:hash`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomSalt();
  return `${salt}:${await sha256(salt + password)}`;
}

/** Confere a senha contra o registro guardado. */
export async function verifyPassword(password: string, stored?: string): Promise<boolean> {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return (await sha256(salt + password)) === hash;
}

/** Sugestão de senha forte para o administrador entregar ao cliente.
 *  Sem caracteres ambíguos (O/0, l/1) — a senha costuma ser ditada por
 *  telefone ou copiada de um papel. */
export function suggestPassword(length = 10): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
}

/** Só os dígitos de um CPF/CNPJ — o login do Portal aceita com ou sem máscara. */
export function documentDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** O que o usuário digitou parece um CPF/CNPJ (e não um e-mail)? */
export function looksLikeDocument(value: string): boolean {
  if (value.includes('@')) return false;
  const d = documentDigits(value);
  return d.length === 11 || d.length === 14;
}
