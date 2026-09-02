/**
 * Traduz a recusa do banco para uma frase que a pessoa consiga agir.
 *
 * O erro do PostgREST vem em inglês e por código ("23502", "42501"), e a
 * mensagem que aparecia no lugar — "verifique a configuração do banco" — não
 * ajuda ninguém: quem está cadastrando não configura banco, e quem configura
 * não está vendo a tela. Aqui cada código vira a causa concreta e, quando
 * existe, o que fazer.
 *
 * O texto original continua no console para investigação.
 */

/** Nome da coluna citada na mensagem do Postgres, se houver. */
function coluna(message?: string): string | undefined {
  return message?.match(/column "([^"]+)"/)?.[1];
}

export function dbErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  acao = 'salvar',
): string {
  if (!error) return `Não foi possível ${acao} — tente novamente.`;
  const col = coluna(error.message);

  switch (error.code) {
    case '23502': // not_null_violation
      return col
        ? `Falta preencher um campo obrigatório (${col}).`
        : 'Falta preencher um campo obrigatório.';
    case '23505': // unique_violation
      return 'Já existe um registro com esses dados.';
    case '23503': // foreign_key_violation
      return 'Este registro está vinculado a outro e não pode ser alterado ou excluído. Remova o vínculo antes.';
    case '23514': // check_violation
      return 'Um dos valores informados não é aceito neste campo.';
    case '22P02': // invalid_text_representation
      return 'Um dos valores está num formato que o banco não aceita.';
    case '22001': // string_data_right_truncation
      return 'Um dos textos é maior do que o campo comporta.';
    case '42501': // insufficient_privilege (RLS)
      return 'Sem permissão para esta operação. Saia e entre de novo; se continuar, fale com o administrador.';
    case 'PGRST204': // coluna inexistente no schema cache
      return col
        ? `O banco não tem o campo "${col}" — falta aplicar uma migração.`
        : 'O banco está desatualizado — falta aplicar uma migração.';
    case '42883': // undefined_function
      return 'Falta uma função no banco — provavelmente uma migração não foi aplicada.';
    default:
      return error.message
        ? `Não foi possível ${acao}: ${error.message}`
        : `Não foi possível ${acao} — tente novamente.`;
  }
}
