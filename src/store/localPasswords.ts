/**
 * Senhas do modo standalone (sem Supabase).
 *
 * No modo standalone não existe Supabase Auth: o app roda 100% no navegador
 * e todos os usuários de exemplo entram com a senha de demonstração. Quando o
 * administrador define uma senha ao cadastrar um técnico, é aqui que ela
 * fica, só para a demonstração se comportar como o sistema de verdade.
 *
 * Isto NÃO é armazenamento de credencial: com Supabase ligado (produção) esta
 * store nunca é usada — a senha vai direto para o Supabase Auth, que guarda
 * apenas o hash, e nada dela sobra no navegador.
 */
const STORAGE_KEY = 'namira-local-passwords';

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
    /* ignora JSON inválido */
  }
  return {};
}

function save(map: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* cota excedida — ignora */
  }
}

/** Guarda (ou limpa, com `undefined`) a senha local de um e-mail. */
export function setLocalPassword(email: string, password?: string) {
  const map = load();
  const key = email.trim().toLowerCase();
  if (password) map[key] = password;
  else delete map[key];
  save(map);
}

/** Senha definida para este e-mail, se houver. */
export function localPassword(email: string): string | undefined {
  return load()[email.trim().toLowerCase()];
}
