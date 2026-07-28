/**
 * Provedores de emissão de NFS-e.
 *
 * Arquitetura multi-provedor. O provedor "Governo · NFS-e Nacional" monta a DPS
 * (Declaração de Prestação de Serviços) no padrão nacional da Receita Federal e
 * a transmite através de um BACKEND (Edge Function) que guarda o certificado
 * e-CNPJ e faz a assinatura + o TLS mútuo com o webservice do governo.
 *
 * IMPORTANTE: a assinatura e a transmissão NÃO podem ocorrer no navegador (o
 * certificado ficaria exposto e o governo não aceita chamada direta do front).
 * Sem `backendUrl` configurado, o provedor opera em modo SIMULADO, retornando o
 * que seria enviado — a UI e o fluxo são idênticos ao real.
 */
import type { InvoiceTaxes } from '@/domain/types';
import type { FiscalConfig } from '@/store/settingsStore';

export interface EmitInput {
  serviceOrderId?: string;
  customerId?: string;
  description: string;
  amount: number;
  taxes: InvoiceTaxes;
  prestador: { cnpj: string; razaoSocial: string; municipioIbge: string; regime: string };
  tomador: { documento?: string; nome?: string; pessoaJuridica: boolean };
}

export interface EmitResult {
  status: 'emitida' | 'rejeitada';
  provider: string;
  accessKey?: string;
  protocol?: string;
  verificationCode?: string;
  message?: string;
  /** Payload (DPS) que foi/ seria transmitido ao governo. */
  dps?: unknown;
}

/** Monta a DPS no padrão NFS-e Nacional (subconjunto representativo). */
export function buildDps(input: EmitInput, cfg: FiscalConfig) {
  const now = new Date().toISOString();
  const t = input.taxes;
  return {
    infDPS: {
      tpAmb: 2, // 1=produção, 2=homologação
      dhEmi: now,
      verAplic: 'NaMira-1.0',
      serie: '00001',
      dCompet: now.slice(0, 10),
      prest: { CNPJ: input.prestador.cnpj.replace(/\D/g, ''), regTrib: { opSimpNac: cfg.regime === 'simples' ? 1 : 2 } },
      toma: input.tomador.documento
        ? { [input.tomador.pessoaJuridica ? 'CNPJ' : 'CPF']: input.tomador.documento.replace(/\D/g, ''), xNome: input.tomador.nome }
        : undefined,
      serv: {
        locPrest: { cLocPrestacao: cfg.municipioIbge },
        cServ: { cTribNac: cfg.itemListaServico.replace('.', ''), xDescServ: input.description },
      },
      valores: {
        vServPrest: { vServ: input.amount.toFixed(2) },
        trib: {
          tribMun: { tribISSQN: 1, cLocIncid: cfg.municipioIbge, pAliq: (t.issRate * 100).toFixed(2), vISSQN: t.iss.toFixed(2), tpRetISSQN: t.issRetido ? 1 : 2 },
          totTrib: { vTotTrib: { vTotTribFed: (t.irrf + t.pis + t.cofins + t.csll + t.inss).toFixed(2), vTotTribMun: t.iss.toFixed(2) } },
        },
      },
    },
  };
}

/** Gera uma chave de acesso no formato do padrão nacional (50 dígitos) — simulação. */
function fakeAccessKey(municipioIbge: string, cnpj: string): string {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.random().toString().slice(2, 2 + 20).padEnd(20, '0');
  return `${municipioIbge}${ym}${cnpj.replace(/\D/g, '').padStart(14, '0')}${rand}`.slice(0, 50).padEnd(50, '0');
}

/** Provedor Governo · NFS-e Nacional (transmite via backend; simula sem backend). */
export const governoNacionalProvider = {
  id: 'governo-nacional',
  label: 'Governo · NFS-e Nacional',
  async emit(input: EmitInput, cfg: FiscalConfig): Promise<EmitResult> {
    const dps = buildDps(input, cfg);

    if (cfg.backendUrl) {
      // Emissão real: o backend assina com o e-CNPJ e transmite ao governo.
      try {
        const res = await fetch(cfg.backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dps, prestador: input.prestador }),
        });
        const data = await res.json();
        if (!res.ok || data.status === 'rejeitada') {
          return { status: 'rejeitada', provider: this.id, message: data.message ?? `Rejeição do governo (${res.status}).`, dps };
        }
        return { status: 'emitida', provider: this.id, accessKey: data.chaveAcesso, protocol: data.protocolo, verificationCode: data.codigoVerificacao, dps };
      } catch (e) {
        return { status: 'rejeitada', provider: this.id, message: e instanceof Error ? e.message : 'Falha ao contatar o backend fiscal.', dps };
      }
    }

    // Modo simulado (sem backend/certificado): retorna o que seria enviado.
    return {
      status: 'emitida',
      provider: this.id,
      accessKey: fakeAccessKey(cfg.municipioIbge, input.prestador.cnpj),
      protocol: 'SIM-' + Date.now().toString().slice(-10),
      verificationCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
      message: 'Simulação — configure o backend e o certificado e-CNPJ para emitir no governo.',
      dps,
    };
  },
};

/** Provedor de simulação pura (sem intenção de transmissão). */
export const simuladoProvider = {
  id: 'simulado',
  label: 'Simulação (sem transmissão)',
  async emit(input: EmitInput, cfg: FiscalConfig): Promise<EmitResult> {
    return {
      status: 'emitida',
      provider: this.id,
      accessKey: fakeAccessKey(cfg.municipioIbge, input.prestador.cnpj),
      protocol: 'SIM-' + Date.now().toString().slice(-10),
      verificationCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
      dps: buildDps(input, cfg),
    };
  },
};

export function getProvider(id: string) {
  return id === 'governo-nacional' ? governoNacionalProvider : simuladoProvider;
}
