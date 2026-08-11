/**
 * Aplicação — permissões granulares por departamento/usuário.
 * Camada acima do papel (UserRole): o papel continua controlando o
 * essencial (admin vs. resto, técnico isolado no App de Campo); o
 * departamento e as exceções por usuário controlam o acesso fino aos
 * módulos administrativos (Configurações → Departamento).
 */
import type { Department, User } from '@/domain/types';
import { type PermissionModule } from '@/domain/enums';
import { useDepartmentsStore } from '@/store/entityStores';
import { navItems, CAMPO_ITEM, legacyModulesForRole, type NavItem } from './navigation';

/** Módulos que o usuário acessa hoje, já considerando departamento + exceções. */
export function modulesForUser(user: User, departments?: Department[]): PermissionModule[] {
  if (user.role === 'admin') return legacyModulesForRole('admin');
  if (user.role === 'tecnico') return []; // técnico só usa o App de Campo (/campo), fora deste controle

  const depts = departments ?? useDepartmentsStore.getState().items;
  const dept = user.departmentId ? depts.find((d) => d.id === user.departmentId && d.isActive !== false) : undefined;
  // Sem departamento atribuído: mantém o comportamento anterior (baseado só
  // no papel), pra não trancar usuários existentes ao ativar esta função.
  const base = dept ? dept.modules : legacyModulesForRole(user.role);

  const overrides = user.permissionOverrides ?? {};
  const set = new Set(base);
  for (const [mod, granted] of Object.entries(overrides) as [PermissionModule, boolean][]) {
    if (granted) set.add(mod);
    else set.delete(mod);
  }
  return [...set];
}

export function hasModuleAccess(user: User, module: PermissionModule, departments?: Department[]): boolean {
  if (user.role === 'admin') return true;
  return modulesForUser(user, departments).includes(module);
}

/** Itens de navegação visíveis para o usuário — usado no Sidebar e no ⌘K.
 *  Aceita `departments` para permitir assinatura reativa (useDepartmentsStore
 *  no componente) — sem isso, mudanças no departamento só refletiriam após
 *  outro re-render por outro motivo. */
export function navForUser(user: User, departments?: Department[]): NavItem[] {
  if (user.role === 'tecnico') {
    // Técnico acessa apenas o painel de campo.
    return [CAMPO_ITEM];
  }
  const allowed = new Set(modulesForUser(user, departments));
  return navItems.filter((n) => allowed.has(n.module));
}
