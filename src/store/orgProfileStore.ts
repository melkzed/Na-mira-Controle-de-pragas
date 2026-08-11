import { create } from 'zustand';
import { orgProfile as seedOrgProfile } from '@/infrastructure/seed/data';

/**
 * Dados da empresa (Configurações → Empresa) — identidade, logo e responsável
 * técnico. É a fonte editável usada nos documentos impressos (Certificado,
 * Laudo, OS, NFS-e) e na emissão fiscal; o seed só fornece os valores
 * iniciais de demonstração.
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
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignora */
  }
  return DEFAULTS;
}
const persist = (profile: OrgProfile) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* cota — ignora */
  }
};

export const useOrgProfileStore = create<OrgProfileState>((set, get) => ({
  profile: load(),
  setProfile: (patch) => {
    const profile = { ...get().profile, ...patch };
    set({ profile });
    persist(profile);
  },
}));

/** Leitura fora de componentes React (ex.: geração de PDF/NFS-e). */
export const getOrgProfile = (): OrgProfile => useOrgProfileStore.getState().profile;
