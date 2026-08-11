import { create } from 'zustand';
import { orgProfile } from '@/infrastructure/seed/data';
import { DEFAULT_TAX_CONFIG, type TaxRegime } from '@/application/fiscal/tax';

/**
 * Configurações da organização (persistidas): assinaturas digitais, emergência
 * (CIT) e a configuração fiscal (NFS-e Nacional + tributação).
 */
const KEY = 'namira-settings';

/** Configuração fiscal — provedor de emissão e tributação. */
export interface FiscalConfig {
  /** 'governo-nacional' = NFS-e Nacional direto (backend + certificado e-CNPJ);
   *  'focusnfe' = via Focus NFe (backend + token, sem certificado próprio); 'simulado'. */
  provider: 'governo-nacional' | 'focusnfe' | 'simulado';
  /** URL do backend que assina/transmite (Edge Function) — específica do provedor selecionado. Vazio = simulação. */
  backendUrl: string;
  /** Ambiente de emissão — homologação não tem validade fiscal. */
  environment: 'homologacao' | 'producao';
  /** Código IBGE do município do prestador. */
  municipioIbge: string;
  /** Item da lista de serviços (LC 116) — dedetização = 14.02. */
  itemListaServico: string;
  issRate: number;
  regime: TaxRegime;
  issRetido: boolean;
  retencoes: boolean;
  inssRetido: boolean;
  irrfRate: number;
}

const DEFAULT_FISCAL: FiscalConfig = {
  provider: 'simulado',
  backendUrl: '',
  environment: 'homologacao',
  municipioIbge: '3550308', // São Paulo/SP
  itemListaServico: '14.02',
  issRate: DEFAULT_TAX_CONFIG.issRate,
  regime: DEFAULT_TAX_CONFIG.regime,
  issRetido: DEFAULT_TAX_CONFIG.issRetido,
  retencoes: DEFAULT_TAX_CONFIG.retencoes,
  inssRetido: DEFAULT_TAX_CONFIG.inssRetido,
  irrfRate: DEFAULT_TAX_CONFIG.irrfRate,
};

interface SettingsState {
  companySignature?: string;
  signatures: Record<string, string>;
  emergencyPhone: string;
  emergencyInfo: string;
  fiscal: FiscalConfig;
  setCompanySignature: (dataUrl?: string) => void;
  setUserSignature: (userId: string, dataUrl?: string) => void;
  setEmergency: (phone: string, info: string) => void;
  setFiscal: (patch: Partial<FiscalConfig>) => void;
}

type Persisted = Pick<SettingsState, 'companySignature' | 'signatures' | 'emergencyPhone' | 'emergencyInfo' | 'fiscal'>;

function load(): Persisted {
  const base: Persisted = { companySignature: undefined, signatures: {}, emergencyPhone: orgProfile.emergencyPhone, emergencyInfo: orgProfile.emergencyInfo, fiscal: DEFAULT_FISCAL };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw); return { ...base, ...p, fiscal: { ...DEFAULT_FISCAL, ...(p.fiscal ?? {}) } }; }
  } catch {
    /* ignora */
  }
  return base;
}
const persist = (s: SettingsState) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ companySignature: s.companySignature, signatures: s.signatures, emergencyPhone: s.emergencyPhone, emergencyInfo: s.emergencyInfo, fiscal: s.fiscal }));
  } catch {
    /* cota — ignora */
  }
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  setCompanySignature: (dataUrl) => { set({ companySignature: dataUrl }); persist(get()); },
  setUserSignature: (userId, dataUrl) => {
    const next = { ...get().signatures };
    if (dataUrl) next[userId] = dataUrl; else delete next[userId];
    set({ signatures: next });
    persist(get());
  },
  setEmergency: (emergencyPhone, emergencyInfo) => { set({ emergencyPhone, emergencyInfo }); persist(get()); },
  setFiscal: (patch) => { set({ fiscal: { ...get().fiscal, ...patch } }); persist(get()); },
}));
