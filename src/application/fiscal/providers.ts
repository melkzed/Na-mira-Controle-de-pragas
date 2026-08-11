/**
 * Provedores de emissão de NFS-e.
 *
 * Arquitetura multi-provedor:
 *  - "Governo · NFS-e Nacional": monta a DPS (Declaração de Prestação de
 *    Serviços) no padrão nacional da Receita Federal e transmite através de
 *    um BACKEND (Edge Function) que guarda o certificado e-CNPJ e faz a
 *    assinatura + o TLS mútuo com o webservice do governo.
 *  - "Focus NFe": monta o payload no formato da API da Focus NFe e transmite
 *    através de um BACKEND (Edge Function) que guarda o token secreto da
 *    conta Focus NFe — sem necessidade de certificado próprio.
 *
 * IMPORTANTE: em ambos os casos, a chamada ao provedor externo NÃO pode
 * ocorrer no navegador (certificado/token ficariam expostos no bundle
 * público). Sem `backendUrl` configurado, o provedor opera em modo SIMULADO,
 * retornando o que seria enviado — a UI e o fluxo são idênticos ao real.
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
  /** 'processando' = provedor aceitou mas a autorização ainda não saiu (ex.: Focus NFe assíncrona). */
  status: 'emitida' | 'processando' | 'rejeitada';
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
      tpAmb: cfg.environment === 'producao' ? 1 : 2, // 1=produção, 2=homologação
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

/**
 * Monta o payload de emissão de NFS-e no formato aceito pela API da Focus NFe
 * (subconjunto — o schema exato varia por plugin municipal; alguns municípios
 * exigem campos adicionais, confirme com a Focus NFe ao ativar o CNPJ).
 * Referência: https://focusnfe.com.br/doc/#nfse-emitir-nota
 */
export function buildFocusNfePayload(input: EmitInput, cfg: FiscalConfig) {
  const t = input.taxes;
  return {
    prestador: { cnpj: input.prestador.cnpj.replace(/\D/g, '') },
    tomador: input.tomador.documento
      ? {
          [input.tomador.pessoaJuridica ? 'cnpj' : 'cpf']: input.tomador.documento.replace(/\D/g, ''),
          razao_social: input.tomador.nome,
        }
      : undefined,
    servico: {
      discriminacao: input.description,
      item_lista_servico: cfg.itemListaServico.replace('.', ''),
      valor_servicos: input.amount,
      iss_retido: t.issRetido,
      aliquota: t.issRate * 100,
      optante_simples_nacional: cfg.regime === 'simples',
    },
  };
}

/** Provedor Focus NFe (transmite via backend + token; simula sem backend). */
export const focusNfeProvider = {
  id: 'focusnfe',
  label: 'Focus NFe',
  async emit(input: EmitInput, cfg: FiscalConfig): Promise<EmitResult> {
    const payload = buildFocusNfePayload(input, cfg);

    if (cfg.backendUrl) {
      // Emissão real: o backend chama a API da Focus NFe com o token secreto.
      try {
        const res = await fetch(cfg.backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload, ref: input.serviceOrderId ?? crypto.randomUUID(), ambiente: cfg.environment }),
        });
        const data = await res.json();
        if (!res.ok || data.status === 'rejeitada' || data.status === 'erro_autorizacao') {
          return { status: 'rejeitada', provider: this.id, message: data.message ?? data.erros?.[0]?.mensagem ?? `Rejeição da Focus NFe (${res.status}).`, dps: payload };
        }
        if (data.status === 'processando') {
          // Focus NFe aceitou mas a prefeitura ainda não autorizou — comum em
          // municípios mais lentos. O backend faz algumas tentativas curtas de
          // consulta antes de devolver isso; confirme depois no painel da Focus NFe.
          return { status: 'processando', provider: this.id, protocol: data.ref, message: data.message ?? 'Aguardando autorização da prefeitura.', dps: payload };
        }
        return { status: 'emitida', provider: this.id, accessKey: data.chaveAcesso ?? data.numero, protocol: data.protocolo ?? data.ref, verificationCode: data.codigoVerificacao, message: data.message, dps: payload };
      } catch (e) {
        return { status: 'rejeitada', provider: this.id, message: e instanceof Error ? e.message : 'Falha ao contatar o backend fiscal.', dps: payload };
      }
    }

    // Modo simulado (sem backend/token): retorna o que seria enviado.
    return {
      status: 'emitida',
      provider: this.id,
      accessKey: 'SIM-' + Date.now().toString().slice(-10),
      protocol: 'SIM-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      message: 'Simulação — configure o backend (supabase/functions/emitir-nfse-focus) e o token da Focus NFe para emitir de verdade.',
      dps: payload,
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
  if (id === 'governo-nacional') return governoNacionalProvider;
  if (id === 'focusnfe') return focusNfeProvider;
  return simuladoProvider;
}

/** Rótulo curto do provedor pelo id salvo na nota (Invoice.provider) — usado fora deste módulo. */
export function providerLabel(id?: string): string {
  if (id === 'governo-nacional') return 'NFS-e Nacional';
  if (id === 'focusnfe') return 'Focus NFe';
  return 'simulação';
}
