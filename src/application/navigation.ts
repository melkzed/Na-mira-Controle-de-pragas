/**
 * Aplicação — mapa de navegação (dado puro, sem dependência de permissions.ts
 * para evitar import circular — quem resolve o que cada usuário pode ver é
 * application/permissions.ts, que importa este arquivo).
 * Cada item declara o módulo (para permissão granular por departamento) e os
 * papéis que o veem por padrão quando o usuário não tem departamento
 * atribuído (compatibilidade). Técnicos têm um app dedicado e não enxergam
 * módulos administrativos.
 */
import type { UserRole, PermissionModule } from '@/domain/enums';

export interface NavItem {
  to: string;
  label: string;
  icon: string; // nome do ícone lucide
  module: PermissionModule;
  roles: UserRole[];
  group: 'Operação' | 'Comercial' | 'Recursos' | 'Gestão' | 'Campo';
}

const ADMIN: UserRole[] = ['admin', 'supervisor'];

/** Módulos agrupados como aparecem no menu — usado também na tela de
 *  permissões por setor, para o admin reconhecer o que está liberando. */
export function modulesByGroup(): { group: NavItem['group']; modules: PermissionModule[] }[] {
  const ordem: NavItem['group'][] = ['Operação', 'Comercial', 'Recursos', 'Gestão'];
  return ordem
    .map((group) => ({
      group,
      modules: navItems.filter((n) => n.group === group).map((n) => n.module) as PermissionModule[],
    }))
    .filter((g) => g.modules.length > 0);
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'LayoutDashboard', module: 'dashboard', roles: ['admin', 'supervisor', 'financeiro', 'atendimento', 'estoque'], group: 'Operação' },
  { to: '/agenda', label: 'Agenda', icon: 'CalendarDays', module: 'agenda', roles: ['admin', 'supervisor', 'atendimento'], group: 'Operação' },
  { to: '/rotas', label: 'Roteirização', icon: 'Route', module: 'rotas', roles: ['admin', 'supervisor'], group: 'Operação' },
  { to: '/ordens', label: 'Ordens de Serviço', icon: 'ClipboardList', module: 'ordens', roles: ['admin', 'supervisor', 'atendimento'], group: 'Operação' },

  { to: '/clientes', label: 'Clientes', icon: 'Users', module: 'clientes', roles: ['admin', 'supervisor', 'atendimento', 'financeiro'], group: 'Comercial' },
  { to: '/crm', label: 'CRM', icon: 'Target', module: 'crm', roles: ['admin', 'supervisor', 'atendimento'], group: 'Comercial' },
  { to: '/monitoramento', label: 'Monitoramento', icon: 'Radar', module: 'monitoramento', roles: ['admin', 'supervisor', 'atendimento'], group: 'Operação' },
  { to: '/nao-conformidade', label: 'Não Conformidade', icon: 'TriangleAlert', module: 'nao_conformidade', roles: ['admin', 'supervisor', 'atendimento'], group: 'Operação' },

  { to: '/estoque', label: 'Estoque', icon: 'Boxes', module: 'estoque', roles: ['admin', 'supervisor', 'estoque'], group: 'Recursos' },
  { to: '/produtos', label: 'Produtos', icon: 'FlaskConical', module: 'produtos', roles: ['admin', 'supervisor', 'estoque'], group: 'Recursos' },
  { to: '/equipamentos', label: 'Equipamentos', icon: 'Wrench', module: 'equipamentos', roles: ['admin', 'supervisor', 'estoque'], group: 'Recursos' },
  { to: '/tecnicos', label: 'Técnicos', icon: 'HardHat', module: 'tecnicos', roles: ['admin', 'supervisor'], group: 'Recursos' },
  { to: '/veiculos', label: 'Veículos', icon: 'Truck', module: 'veiculos', roles: ['admin', 'supervisor'], group: 'Recursos' },

  { to: '/financeiro', label: 'Financeiro', icon: 'Wallet', module: 'financeiro', roles: ['admin', 'financeiro'], group: 'Gestão' },
  { to: '/fiscal', label: 'Fiscal', icon: 'FileText', module: 'fiscal', roles: ['admin', 'financeiro'], group: 'Gestão' },
  { to: '/relatorios', label: 'Relatórios', icon: 'BarChart3', module: 'relatorios', roles: ADMIN.concat('financeiro'), group: 'Gestão' },
  { to: '/historico', label: 'Histórico', icon: 'History', module: 'historico', roles: ADMIN, group: 'Gestão' },
  { to: '/config', label: 'Configurações', icon: 'Settings', module: 'configuracoes', roles: ['admin'], group: 'Gestão' },
];

/** App do Técnico — controlado só pelo papel, fora do sistema de módulos. */
export const CAMPO_ITEM: NavItem = { to: '/campo', label: 'App do Técnico', icon: 'Smartphone', module: 'dashboard', roles: ['admin', 'supervisor', 'financeiro', 'atendimento', 'estoque', 'tecnico'], group: 'Campo' };

/** Acesso padrão por papel quando o usuário não tem departamento atribuído
 *  (compatibilidade com o RBAC anterior, baseado só no papel). */
export function legacyModulesForRole(role: UserRole): PermissionModule[] {
  if (role === 'admin') return navItems.map((n) => n.module);
  return navItems.filter((n) => n.roles.includes(role)).map((n) => n.module);
}
