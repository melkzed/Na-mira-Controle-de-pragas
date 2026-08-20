/**
 * Consulta de CEP via BrasilAPI (pública, sem chave).
 * https://brasilapi.com.br/api/cep/v2/{cep}
 * Preenche o endereço automaticamente no cadastro de clientes (PF e PJ).
 * O host já está liberado no CSP (ver vercel.json).
 */
export interface CepData {
  street?: string;
  district?: string;
  city?: string;
  state?: string;
}

export async function lookupCep(rawCep: string): Promise<CepData> {
  const cep = rawCep.replace(/\D/g, '');
  if (cep.length !== 8) throw new Error('CEP inválido.');

  // Falha de rede (offline, DNS, bloqueio) rejeita com o "Failed to fetch" do
  // próprio navegador — em inglês e sem contexto. Traduz aqui, senão o texto
  // cru aparece para o usuário embaixo do campo de CEP.
  let res: Response;
  try {
    res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  } catch {
    throw new Error('Sem conexão para consultar o CEP — preencha o endereço manualmente.');
  }
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'CEP não encontrado.' : 'Falha ao consultar o CEP.');
  }
  const d = await res.json();
  return {
    street: d.street || undefined,
    district: d.neighborhood || undefined,
    city: d.city || undefined,
    state: d.state || undefined,
  };
}
