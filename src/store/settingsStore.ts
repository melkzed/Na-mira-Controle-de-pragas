import { create } from 'zustand';
import { orgProfile } from '@/infrastructure/seed/data';

/**
 * Configurações da organização (persistidas): assinaturas digitais da empresa e
 * dos técnicos, e dados de emergência (CIT) exibidos nos documentos.
 */
const KEY = 'namira-settings';

interface SettingsState {
  /** Assinatura digital da empresa (dataURL). */
  companySignature?: string;
  /** Assinatura digital por técnico (userId → dataURL). */
  signatures: Record<string, string>;
  /** Emergência toxicológica (CIT) — exibida nos documentos. */
  emergencyPhone: string;
  emergencyInfo: string;
  setCompanySignature: (dataUrl?: string) => void;
  setUserSignature: (userId: string, dataUrl?: string) => void;
  setEmergency: (phone: string, info: string) => void;
}

function load(): Pick<SettingsState, 'companySignature' | 'signatures' | 'emergencyPhone' | 'emergencyInfo'> {
  const base = { companySignature: undefined as string | undefined, signatures: {} as Record<string, string>, emergencyPhone: orgProfile.emergencyPhone, emergencyInfo: orgProfile.emergencyInfo };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch {
    /* ignora */
  }
  return base;
}
const persist = (s: SettingsState) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ companySignature: s.companySignature, signatures: s.signatures, emergencyPhone: s.emergencyPhone, emergencyInfo: s.emergencyInfo }));
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
}));
