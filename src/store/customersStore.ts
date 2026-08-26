import { create } from 'zustand';
import type { Customer, CustomerContact, ContactSchedule, Reservoir, ServiceContract } from '@/domain/types';
import { customers as seedCustomers } from '@/infrastructure/seed/data';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/store/toastStore';

/**
 * Store reativa de Clientes.
 *
 * Modo standalone (sem Supabase): fonte de verdade em runtime a partir do
 * seed + persistência em localStorage — cada navegador com sua própria cópia.
 *
 * Modo Supabase: os dados são compartilhados de verdade entre todos os
 * usuários da organização. Escritas são otimistas (a UI atualiza na hora, sem
 * esperar a rede) e desfeitas com um toast de erro se a gravação falhar. Uma
 * assinatura Realtime mantém os clientes sincronizados ao vivo entre abas e
 * dispositivos — a interface (add/update/remove, tudo síncrono) não muda,
 * então nenhuma tela precisou ser alterada para ganhar isso.
 */

const STORAGE_KEY = 'namira-customers';
const TABLE = 'customers';

export type CustomerInput = Omit<Customer, 'id' | 'orgId' | 'createdAt' | 'isActive'> &
  Partial<Pick<Customer, 'isActive'>>;

interface CustomersState {
  customers: Customer[];
  add: (input: CustomerInput) => Customer;
  update: (id: string, patch: Partial<Customer>) => void;
  remove: (id: string) => void;
  reset: () => void;
}

function load(): Customer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Customer[];
  } catch {
    /* ignora JSON inválido */
  }
  return seedCustomers;
}

function persist(customers: Customer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
  } catch {
    /* cota excedida — ignora */
  }
}

function uid(): string {
  return 'c-' + Math.random().toString(36).slice(2, 9);
}

/** Formato das colunas em public.customers (snake_case) — ver db/schema.sql
 *  e db/migrate_customers_realtime.sql. */
interface CustomerRow {
  id: string;
  org_id: string;
  type: string;
  name: string;
  company_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  contacts: CustomerContact[] | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  property_type: string | null;
  area_m2: number | null;
  room_count: number | null;
  notes: string | null;
  permanent_notes: string | null;
  monitoring_contracted: boolean;
  portal_access: boolean | null;
  portal_password_hash: string | null;
  portal_password_set_at: string | null;
  registration_status: string | null;
  economic_activity: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_at: string;
  registration_tier: string | null;
  local_structure: string[] | null;
  reservoirs: Reservoir[] | null;
  contact_schedule: ContactSchedule | null;
  contracts: ServiceContract[] | null;
  complementary_services: string[] | null;
}

function fromRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    orgId: row.org_id,
    type: row.type as Customer['type'],
    name: row.name,
    companyName: row.company_name ?? undefined,
    document: row.document ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    contacts: row.contacts ?? undefined,
    cep: row.cep ?? undefined,
    street: row.street ?? undefined,
    number: row.number ?? undefined,
    complement: row.complement ?? undefined,
    district: row.district ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    propertyType: row.property_type ?? undefined,
    areaM2: row.area_m2 ?? undefined,
    roomCount: row.room_count ?? undefined,
    notes: row.notes ?? undefined,
    permanentNotes: row.permanent_notes ?? undefined,
    monitoringContracted: row.monitoring_contracted,
    portalAccess: row.portal_access ?? undefined,
    portalPasswordHash: row.portal_password_hash ?? undefined,
    portalPasswordSetAt: row.portal_password_set_at ?? undefined,
    registrationStatus: row.registration_status ?? undefined,
    economicActivity: row.economic_activity ?? undefined,
    tags: row.tags ?? [],
    isActive: row.is_active,
    createdAt: row.created_at,
    registrationTier: (row.registration_tier as Customer['registrationTier']) ?? undefined,
    localStructure: row.local_structure ?? undefined,
    reservoirs: row.reservoirs ?? undefined,
    contactSchedule: row.contact_schedule ?? undefined,
    contracts: row.contracts ?? undefined,
    complementaryServices: row.complementary_services ?? undefined,
  };
}

function toRow(c: Customer): CustomerRow {
  return {
    id: c.id,
    org_id: c.orgId,
    type: c.type,
    name: c.name,
    company_name: c.companyName ?? null,
    document: c.document ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    whatsapp: c.whatsapp ?? null,
    contacts: c.contacts ?? null,
    cep: c.cep ?? null,
    street: c.street ?? null,
    number: c.number ?? null,
    complement: c.complement ?? null,
    district: c.district ?? null,
    city: c.city ?? null,
    state: c.state ?? null,
    latitude: c.latitude ?? null,
    longitude: c.longitude ?? null,
    property_type: c.propertyType ?? null,
    area_m2: c.areaM2 ?? null,
    room_count: c.roomCount ?? null,
    notes: c.notes ?? null,
    permanent_notes: c.permanentNotes ?? null,
    monitoring_contracted: c.monitoringContracted ?? false,
    portal_access: c.portalAccess ?? false,
    portal_password_hash: c.portalPasswordHash ?? null,
    portal_password_set_at: c.portalPasswordSetAt ?? null,
    registration_status: c.registrationStatus ?? null,
    economic_activity: c.economicActivity ?? null,
    tags: c.tags ?? [],
    is_active: c.isActive,
    created_at: c.createdAt,
    registration_tier: c.registrationTier ?? null,
    local_structure: c.localStructure ?? null,
    reservoirs: c.reservoirs ?? null,
    contact_schedule: c.contactSchedule ?? null,
    contracts: c.contracts ?? null,
    complementary_services: c.complementaryServices ?? null,
  };
}

export const useCustomersStore = create<CustomersState>((set, get) => ({
  customers: supabaseEnabled ? [] : load(),
  add: (input) => {
    const customer: Customer = {
      id: uid(),
      orgId: useAppStore.getState().currentUser?.orgId ?? 'org-namira',
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
      ...input,
      tags: input.tags ?? [],
    };
    const next = [customer, ...get().customers];
    set({ customers: next });
    if (supabaseEnabled && supabase) {
      supabase.from(TABLE).insert(toRow(customer)).then(({ error }) => {
        if (error) {
          set({ customers: get().customers.filter((c) => c.id !== customer.id) });
          toast('Não foi possível salvar o cliente — tente novamente.', { tone: 'danger' });
        }
      });
    } else {
      persist(next);
    }
    return customer;
  },
  update: (id, patch) => {
    const prev = get().customers;
    const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
    set({ customers: next });
    if (supabaseEnabled && supabase) {
      const updated = next.find((c) => c.id === id);
      if (updated) {
        supabase.from(TABLE).update(toRow(updated)).eq('id', id).then(({ error }) => {
          if (error) {
            set({ customers: prev });
            toast('Não foi possível salvar as alterações — tente novamente.', { tone: 'danger' });
          }
        });
      }
    } else {
      persist(next);
    }
  },
  remove: (id) => {
    const prev = get().customers;
    const next = prev.filter((c) => c.id !== id);
    set({ customers: next });
    if (supabaseEnabled && supabase) {
      supabase.from(TABLE).delete().eq('id', id).then(({ error }) => {
        if (error) {
          set({ customers: prev });
          toast('Não foi possível excluir o cliente — tente novamente.', { tone: 'danger' });
        }
      });
    } else {
      persist(next);
    }
  },
  reset: () => {
    if (supabaseEnabled) return; // dado real e compartilhado — não faz sentido "resetar" pro seed
    persist(seedCustomers);
    set({ customers: seedCustomers });
  },
}));

if (supabaseEnabled && supabase) {
  supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .then(({ data, error }) => {
      if (!error && data) useCustomersStore.setState({ customers: (data as CustomerRow[]).map(fromRow) });
    });

  supabase
    .channel('customers-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const state = useCustomersStore.getState();
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id;
        if (oldId) useCustomersStore.setState({ customers: state.customers.filter((c) => c.id !== oldId) });
        return;
      }
      const customer = fromRow(payload.new as CustomerRow);
      const exists = state.customers.some((c) => c.id === customer.id);
      useCustomersStore.setState({
        customers: exists
          ? state.customers.map((c) => (c.id === customer.id ? customer : c))
          : [customer, ...state.customers],
      });
    })
    .subscribe();
}
