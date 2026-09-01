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

/**
 * Domínio (camelCase) → linha Postgres (snake_case).
 *
 * `undefined` vira `null` por padrão, que é o certo num UPDATE: o domínio usa
 * `undefined` para "campo vazio", e limpar um campo tem de gravar NULL.
 *
 * Num INSERT a regra se inverte, e é aí que mora um erro fácil de cometer:
 * coluna `not null default X` recusa NULL explícito — o padrão só entra quando
 * a coluna é OMITIDA da inserção. Mandar `null` num campo opcional que o
 * usuário não preencheu derruba a criação inteira com
 * "null value in column ... violates not-null constraint". Por isso `insert`
 * usa `omitUndefined`, deixando o banco aplicar o próprio padrão.
 */
export function toSnakeRow<T extends Record<string, unknown>>(
  obj: T,
  omitUndefined = false,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined && omitUndefined) continue;
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
