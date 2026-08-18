import { create } from 'zustand';
import { orgProfile as seedOrgProfile } from '@/infrastructure/seed/data';
import { fromSnakeRow, toSnakeRow } from '@/lib/caseConvert';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { toast } from '@/store/toastStore';
import { useAppStore } from './appStore';

/**
 * Dados da empresa (Configurações → Empresa) — identidade, logo e responsável
 * técnico. É a fonte editável usada nos documentos impressos (Certificado,
 * Laudo, OS, NFS-e) e na emissão fiscal; o seed só fornece os valores
 * iniciais de demonstração.
 *
 * Dual-mode (ver docs/ARCHITECTURE.md §3.1/§3.2), mas SINGLETON — uma linha
 * por organização (a própria linha de `organizations`), sem lista/CRUD.
 */
export interface OrgProfile {
  name: string;
  legalName: string;
  cnpj: string;
  taxRegime: string;
  /** Inscrição Municipal — relevante para ISS/NFS-e. */
  municipalRegistration: string;
  /** Inscrição Estadual — só relevante se a empresa também emitir NF-e/NFC-e. */
  stateRegistration: string;
  street: string;
  district: string;
  city: string;
  state: string;
  cep: string;
  phone: string;
  email: string;
  /** Logo da empresa (data URL) — usado no cabeçalho dos documentos impressos. */
  logoDataUrl?: string;
  /** Responsável técnico — assina Certificado e Laudo (ver settingsStore.companySignature). */
  technicalResponsibleName: string;
  technicalResponsibleRole: string;
  technicalResponsibleRegistry: string;
}

const KEY = 'namira-org-profile';
const TABLE = 'organizations';

const DEFAULTS: OrgProfile = {
  name: seedOrgProfile.name,
  legalName: seedOrgProfile.legalName,
  cnpj: seedOrgProfile.cnpj,
  taxRegime: seedOrgProfile.taxRegime,
  municipalRegistration: '',
  stateRegistration: '',
  street: seedOrgProfile.street,
  district: seedOrgProfile.district,
  city: seedOrgProfile.city,
  state: seedOrgProfile.state,
  cep: seedOrgProfile.cep,
  phone: seedOrgProfile.phone,
  email: '',
  logoDataUrl: undefined,
  technicalResponsibleName: seedOrgProfile.technicalResponsibleName,
  technicalResponsibleRole: seedOrgProfile.technicalResponsibleRole,
  technicalResponsibleRegistry: seedOrgProfile.technicalResponsibleRegistry,
};

interface OrgProfileState {
  profile: OrgProfile;
  setProfile: (patch: Partial<OrgProfile>) => void;
}

function load(): OrgProfile {
  if (supabaseEnabled) return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignora */
  }
  return DEFAULTS;
}
const persist = (profile: OrgProfile) => {
  if (supabaseEnabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* cota — ignora */
  }
};

export const useOrgProfileStore = create<OrgProfileState>((set, get) => ({
  profile: load(),
  setProfile: (patch) => {
    const prev = get().profile;
    const profile = { ...prev, ...patch };
    set({ profile });
    if (supabaseEnabled && supabase) {
      const orgId = useAppStore.getState().currentUser?.orgId;
      if (!orgId) return; // sessão ainda resolvendo — próxima carga reconcilia
      supabase
        .from(TABLE)
        .update(toSnakeRow(patch as unknown as Record<string, unknown>))
        .eq('id', orgId)
        .then(({ error }) => {
          if (error) {
            set({ profile: prev });
            toast('Não foi possível salvar os dados da empresa — tente novamente.', { tone: 'danger' });
          }
        });
    } else {
      persist(profile);
    }
  },
}));

/** Leitura fora de componentes React (ex.: geração de PDF/NFS-e). */
export const getOrgProfile = (): OrgProfile => useOrgProfileStore.getState().profile;

if (supabaseEnabled && supabase) {
  supabase
    .from(TABLE)
    .select('*')
    .single()
    .then(({ data, error }) => {
      if (!error && data) {
        useOrgProfileStore.setState({ profile: { ...DEFAULTS, ...fromSnakeRow<Partial<OrgProfile>>(data as Record<string, unknown>) } });
      }
    });

  supabase
    .channel(`${TABLE}-sync`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: TABLE }, (payload) => {
      const orgId = useAppStore.getState().currentUser?.orgId;
      const row = payload.new as { id?: string } | null;
      if (!row || (orgId && row.id !== orgId)) return;
      useOrgProfileStore.setState({ profile: { ...DEFAULTS, ...fromSnakeRow<Partial<OrgProfile>>(row as Record<string, unknown>) } });
    })
    .subscribe();
}
