import { create } from 'zustand';
import { orgProfile } from '@/infrastructure/seed/data';
import { DEFAULT_TAX_CONFIG, type TaxRegime } from '@/application/fiscal/tax';
import { onSupabaseSession, supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { useAppStore } from './appStore';

/**
 * Configurações da organização (dual-mode, SINGLETON — ver
 * docs/ARCHITECTURE.md §3.1/§3.2): assinaturas digitais, emergência (CIT) e
 * a configuração fiscal (NFS-e Nacional + tributação). Mapeia pra
 * `fiscal_settings` (uma linha por organização); `fiscal` é um objeto
 * aninhado no domínio mas colunas soltas na tabela, então usa toRow/fromRow
 * manual em vez do conversor genérico.
 */
const KEY = 'namira-settings';
const TABLE = 'fiscal_settings';

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
  /** Item da lista de serviços (LC 116, padrão nacional) — ex.: 7.13 (limpeza,
   *  higiene, desinfecção, controle de pragas e congêneres) ou 14.02, conforme
   *  a atividade. NÃO é necessariamente igual ao código tributário do
   *  município — municípios que ainda usam webservice próprio (não migrados
   *  pro NFS-e Nacional) costumam ter sua própria tabela de códigos internos. */
  itemListaServico: string;
  /** Código de tributação do MUNICÍPIO (ex.: "código CES" ou equivalente),
   *  quando o município exige um código próprio além do item LC 116 — comum
   *  em municípios com webservice próprio. Deixe em branco se o município
   *  usa só o item LC 116 (a maioria dos que já migraram pro NFS-e Nacional). */
  codigoTributarioMunicipal: string;
  /** Tipos de tributo disponíveis ao lançar uma despesa (DARF, IPTU, ISS,
   *  taxa municipal…). Editável em Fiscal — cada empresa tem os seus, então
   *  não dá para fixar uma lista no código. */
  taxKinds: string[];
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
  codigoTributarioMunicipal: '',
  taxKinds: ['DARF', 'IPTU', 'Concessionária', 'ISS', 'INSS', 'FGTS', 'Taxa municipal'],
  issRate: DEFAULT_TAX_CONFIG.issRate,
  regime: DEFAULT_TAX_CONFIG.regime,
  issRetido: DEFAULT_TAX_CONFIG.issRetido,
  retencoes: DEFAULT_TAX_CONFIG.retencoes,
  inssRetido: DEFAULT_TAX_CONFIG.inssRetido,
  irrfRate: DEFAULT_TAX_CONFIG.irrfRate,
};

/** Textos que saem nos documentos impressos e que cada empresa ajusta ao seu
 *  jeito de trabalhar (prazos de reentrada, garantias, ressalvas legais). */
export interface DocumentTexts {
  /** Itens da seção "Medidas de Segurança / Orientações" do laudo. */
  safetyMeasures: string[];
  /** Parágrafo de abertura do certificado. Aceita os marcadores
   *  {{empresa}}, {{cnpj}}, {{cliente}}, {{documento}} e {{endereco}}. */
  certificateDeclaration: string;
  /** Observação livre no fim do laudo (garantias, condições). Vazio = não sai. */
  laudoNotes: string;
}

export const DEFAULT_DOCUMENT_TEXTS: DocumentTexts = {
  safetyMeasures: [
    'Aguardar no mínimo 2 a 6 (duas a seis) horas para permitir o ingresso de pessoas e animais',
    'Abrir as janelas para arejar o ambiente antes de ocupar o local desinfectado',
    'Observar um prazo maior para acesso de crianças, idosos e pessoas alérgicas ao local tratado',
    'Lavar com detergente as louças e utensílios expostos aos vapores do inseticida',
    'Aguardar 72 horas para limpar o ambiente tratado',
    'O produto possui eficácia de até 3 meses, a depender da manutenção do cliente',
    'Desocupação do local onde será aplicado o produto por parte do cliente',
    'Não retornamos ao local para retirada das pragas',
  ],
  certificateDeclaration:
    'A {{empresa}}, CNPJ {{cnpj}}, declara para os devidos fins que prestou serviço(s) para '
    + '{{cliente}}, CPF/CNPJ {{documento}}, situado à {{endereco}}, conforme área tratada, '
    + 'pragas-alvo, produtos químicos e garantia abaixo descritos.',
  laudoNotes: '',
};

interface SettingsState {
  companySignature?: string;
  signatures: Record<string, string>;
  emergencyPhone: string;
  emergencyInfo: string;
  fiscal: FiscalConfig;
  documentTexts: DocumentTexts;
  setCompanySignature: (dataUrl?: string) => void;
  setUserSignature: (userId: string, dataUrl?: string) => void;
  setEmergency: (phone: string, info: string) => void;
  setFiscal: (patch: Partial<FiscalConfig>) => void;
  setDocumentTexts: (patch: Partial<DocumentTexts>) => void;
}

type Persisted = Pick<SettingsState, 'companySignature' | 'signatures' | 'emergencyPhone' | 'emergencyInfo' | 'fiscal' | 'documentTexts'>;

interface SettingsRow {
  company_signature: string | null;
  signatures: Record<string, string> | null;
  emergency_phone: string | null;
  emergency_info: string | null;
  provider: string | null;
  backend_url: string | null;
  environment: string | null;
  municipio_ibge: string | null;
  item_lista_servico: string | null;
  codigo_tributario_municipal: string | null;
  iss_rate: number | null;
  regime: string | null;
  iss_retido: boolean | null;
  retencoes: boolean | null;
  inss_retido: boolean | null;
  irrf_rate: number | null;
  document_texts: DocumentTexts | null;
}

function fromRow(row: SettingsRow): Persisted {
  return {
    companySignature: row.company_signature ?? undefined,
    documentTexts: { ...DEFAULT_DOCUMENT_TEXTS, ...(row.document_texts ?? {}) },
    signatures: row.signatures ?? {},
    emergencyPhone: row.emergency_phone ?? orgProfile.emergencyPhone,
    emergencyInfo: row.emergency_info ?? orgProfile.emergencyInfo,
    fiscal: {
      ...DEFAULT_FISCAL,
      provider: (row.provider as FiscalConfig['provider']) ?? DEFAULT_FISCAL.provider,
      backendUrl: row.backend_url ?? DEFAULT_FISCAL.backendUrl,
      environment: (row.environment as FiscalConfig['environment']) ?? DEFAULT_FISCAL.environment,
      municipioIbge: row.municipio_ibge ?? DEFAULT_FISCAL.municipioIbge,
      itemListaServico: row.item_lista_servico ?? DEFAULT_FISCAL.itemListaServico,
      codigoTributarioMunicipal: row.codigo_tributario_municipal ?? DEFAULT_FISCAL.codigoTributarioMunicipal,
      issRate: row.iss_rate ?? DEFAULT_FISCAL.issRate,
      regime: (row.regime as TaxRegime) ?? DEFAULT_FISCAL.regime,
      issRetido: row.iss_retido ?? DEFAULT_FISCAL.issRetido,
      retencoes: row.retencoes ?? DEFAULT_FISCAL.retencoes,
      inssRetido: row.inss_retido ?? DEFAULT_FISCAL.inssRetido,
      irrfRate: row.irrf_rate ?? DEFAULT_FISCAL.irrfRate,
    },
  };
}
function toRow(s: Persisted): Partial<SettingsRow> {
  return {
    company_signature: s.companySignature ?? null,
    document_texts: s.documentTexts,
    signatures: s.signatures,
    emergency_phone: s.emergencyPhone,
    emergency_info: s.emergencyInfo,
    provider: s.fiscal.provider,
    backend_url: s.fiscal.backendUrl,
    environment: s.fiscal.environment,
    municipio_ibge: s.fiscal.municipioIbge,
    item_lista_servico: s.fiscal.itemListaServico,
    codigo_tributario_municipal: s.fiscal.codigoTributarioMunicipal,
    iss_rate: s.fiscal.issRate,
    regime: s.fiscal.regime,
    iss_retido: s.fiscal.issRetido,
    retencoes: s.fiscal.retencoes,
    inss_retido: s.fiscal.inssRetido,
    irrf_rate: s.fiscal.irrfRate,
  };
}

function load(): Persisted {
  const base: Persisted = { companySignature: undefined, signatures: {}, emergencyPhone: orgProfile.emergencyPhone, emergencyInfo: orgProfile.emergencyInfo, fiscal: DEFAULT_FISCAL, documentTexts: DEFAULT_DOCUMENT_TEXTS };
  if (supabaseEnabled) return base;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw); return { ...base, ...p, fiscal: { ...DEFAULT_FISCAL, ...(p.fiscal ?? {}) }, documentTexts: { ...DEFAULT_DOCUMENT_TEXTS, ...(p.documentTexts ?? {}) } }; }
  } catch {
    /* ignora */
  }
  return base;
}
const persist = (s: SettingsState) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ companySignature: s.companySignature, signatures: s.signatures, emergencyPhone: s.emergencyPhone, emergencyInfo: s.emergencyInfo, fiscal: s.fiscal, documentTexts: s.documentTexts }));
  } catch {
    /* cota — ignora */
  }
};

function syncRemote(prev: SettingsState) {
  if (!supabaseEnabled || !supabase) return;
  const orgId = useAppStore.getState().currentUser?.orgId;
  if (!orgId) return; // sessão ainda resolvendo — próxima carga reconcilia
  const s = useSettingsStore.getState();
  supabase
    .from(TABLE)
    .upsert({ org_id: orgId, ...toRow(s) }, { onConflict: 'org_id' })
    .then(({ error }) => {
      if (error) {
        useSettingsStore.setState(prev);
        toast('Não foi possível salvar as configurações — tente novamente.', { tone: 'danger' });
      }
    });
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  setCompanySignature: (dataUrl) => {
    const prev = get();
    set({ companySignature: dataUrl });
    if (supabaseEnabled) syncRemote(prev); else persist(get());
  },
  setUserSignature: (userId, dataUrl) => {
    const prev = get();
    const next = { ...prev.signatures };
    if (dataUrl) next[userId] = dataUrl; else delete next[userId];
    set({ signatures: next });
    if (supabaseEnabled) syncRemote(prev); else persist(get());
  },
  setEmergency: (emergencyPhone, emergencyInfo) => {
    const prev = get();
    set({ emergencyPhone, emergencyInfo });
    if (supabaseEnabled) syncRemote(prev); else persist(get());
  },
  setFiscal: (patch) => {
    const prev = get();
    set({ fiscal: { ...prev.fiscal, ...patch } });
    if (supabaseEnabled) syncRemote(prev); else persist(get());
  },
  setDocumentTexts: (patch) => {
    const prev = get();
    set({ documentTexts: { ...prev.documentTexts, ...patch } });
    if (supabaseEnabled) syncRemote(prev); else persist(get());
  },
}));

if (supabaseEnabled && supabase) {
  // A carga inicial espera a sessão: sem ela o RLS devolve zero linhas.
  onSupabaseSession(() => {
    if (!supabase) return;
    supabase
      .from(TABLE)
      .select('*')
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) {
          useSettingsStore.setState(fromRow(data as unknown as SettingsRow));
        }
      });
  });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const orgId = useAppStore.getState().currentUser?.orgId;
      const row = payload.new as { org_id?: string } | null;
      if (!row || (orgId && row.org_id !== orgId)) return;
      useSettingsStore.setState(fromRow(row as unknown as SettingsRow));
    })
    .subscribe();
}
