/**
 * Conversão genérica de chaves entre camelCase (domínio TS) e snake_case
 * (colunas Postgres) — só no nível raiz do objeto. Valores aninhados (jsonb:
 * arrays, objetos) passam intactos, exatamente como o Supabase espera/retorna.
 * Usado pela store genérica de entidades (createEntityStore) para evitar
 * repetir um toRow/fromRow manual em cada um dos ~16 módulos simples.
 */

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Domínio (camelCase) → linha Postgres (snake_case). `undefined` vira `null`
 *  (o Postgres não tem "ausente", só NULL). */
export function toSnakeRow<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    row[camelToSnake(key)] = value === undefined ? null : value;
  }
  return row;
}

/** Linha Postgres (snake_case) → domínio (camelCase). `null` vira
 *  `undefined` (campos opcionais do domínio usam `?:`, não `| null`). */
export function fromSnakeRow<T>(row: Record<string, unknown>): T {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    obj[snakeToCamel(key)] = value === null ? undefined : value;
  }
  return obj as T;
}
