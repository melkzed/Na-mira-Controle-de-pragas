/**
 * Consulta de CNPJ na Receita via BrasilAPI (pública, sem chave).
 * https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 * Retorna dados para preenchimento automático do cadastro do cliente.
 */
export interface CnpjData {
  companyName?: string; // razão social
  tradeName?: string; // nome fantasia
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  cep?: string;
  registrationStatus?: string; // situação cadastral
  economicActivity?: string; // CNAE principal
  phone?: string;
  email?: string;
}

export async function lookupCnpj(rawCnpj: string): Promise<CnpjData> {
  const cnpj = rawCnpj.replace(/\D/g, '');
  if (cnpj.length !== 14) throw new Error('CNPJ inválido.');

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'CNPJ não encontrado na Receita.' : 'Falha ao consultar a Receita.');
  }
  const d = await res.json();

  const cep = d.cep ? String(d.cep).replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2') : undefined;
  return {
    companyName: d.razao_social || undefined,
    tradeName: d.nome_fantasia || undefined,
    street: d.logradouro || undefined,
    number: d.numero || undefined,
    complement: d.complemento || undefined,
    district: d.bairro || undefined,
    city: d.municipio || undefined,
    state: d.uf || undefined,
    cep,
    registrationStatus: d.descricao_situacao_cadastral || undefined,
    economicActivity: d.cnae_fiscal_descricao || undefined,
    phone: d.ddd_telefone_1 ? formatPhone(d.ddd_telefone_1) : undefined,
    email: d.email || undefined,
  };
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  return raw;
}
