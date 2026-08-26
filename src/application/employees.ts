/**
 * Aplicação — criação e acesso de funcionários (equipe interna).
 *
 * Vale para qualquer departamento, não só técnico: o cadastro é o mesmo, o
 * que muda é o papel e o departamento (que define as permissões padrão —
 * ver `application/permissions.ts`).
 *
 * Com o Supabase ligado, criar um LOGIN exige a Service Role Key, que nunca
 * pode ficar no navegador: quem cria é a Edge Function `convidar-tecnico`
 * (ver docs/ARCHITECTURE.md §3.4), que recebe a senha definida pelo
 * administrador e devolve o cadastro já gravado. Sem senha, ela cai no
 * convite por e-mail. Sem Supabase, grava o cadastro local e guarda a senha
 * em `store/localPasswords.ts`, que só existe na demonstração.
 */
import type { User } from '@/domain/types';
import type { UserRole } from '@/domain/enums';
import { useUsersStore } from '@/store/entityStores';
import { currentOrgId } from '@/store/appStore';
import { setLocalPassword } from '@/store/localPasswords';
import { ensureTechnicianStockLocation } from '@/store/stockLocations';
import { functionErrorMessage, supabase, supabaseEnabled } from '@/lib/supabaseClient';

/** Mínimo aceito pelo Supabase Auth — mesma regra da Edge Function. */
export const MIN_PASSWORD = 6;

export interface EmployeeInput {
  id: string;
  name: string;
  email: string;
  phone?: string;
  /** Senha definida pelo administrador. Sem ela, o funcionário recebe convite
   *  por e-mail para criar a própria (caminho da importação por planilha). */
  password?: string;
  role: UserRole;
  departmentId?: string;
  isActive?: boolean;
  fieldAppAccess?: boolean;
  hideFinancialValues?: boolean;
}

/** Cria o funcionário de verdade. Devolve o id do cadastro criado; lança erro
 *  com a mensagem que o usuário precisa ler. */
export async function createEmployee(input: EmployeeInput): Promise<string> {
  const {
    name, email, phone, password, role, departmentId,
    isActive = true, fieldAppAccess = role === 'tecnico', hideFinancialValues,
  } = input;

  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase.functions.invoke('convidar-tecnico', {
      body: {
        name, email, phone, password, role, fieldAppAccess,
        redirectTo: `${window.location.origin}/definir-senha`,
      },
    });
    if (error || data?.error) {
      throw new Error(await functionErrorMessage(error, data, 'Não foi possível cadastrar o funcionário — tente novamente.'));
    }
    const id = String(data?.user?.id ?? input.id);
    // Departamento e demais campos que a função não conhece ficam por conta
    // da store (escrita otimista + Supabase, ver createEntityStore).
    if (departmentId || hideFinancialValues || !isActive) {
      useUsersStore.getState().update(id, { departmentId, hideFinancialValues, isActive });
    }
    if (role === 'tecnico') ensureTechnicianStockLocation(id, name);
    return id;
  }

  useUsersStore.getState().add({
    id: input.id, orgId: currentOrgId(), name, email, phone, role,
    isActive, fieldAppAccess, departmentId, hideFinancialValues,
  });
  if (password) setLocalPassword(email, password);
  if (role === 'tecnico') ensureTechnicianStockLocation(input.id, name);
  return input.id;
}

/** Troca a senha de um funcionário já cadastrado (o administrador define). */
export async function resetEmployeePassword(user: User, password: string): Promise<void> {
  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase.functions.invoke('convidar-tecnico', {
      body: { action: 'redefinir_senha', userId: user.id, password },
    });
    if (error || data?.error) {
      throw new Error(await functionErrorMessage(error, data, 'Não foi possível alterar a senha — tente novamente.'));
    }
    return;
  }
  setLocalPassword(user.email, password);
}
