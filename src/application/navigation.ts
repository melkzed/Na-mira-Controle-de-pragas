/**
 * Aplicação — mapa de navegação + controle de acesso por papel (RBAC).
 * Cada item declara quais papéis podem vê-lo. Técnicos têm um app dedicado
 * e não enxergam módulos administrativos.
 */
import type { UserRole } from '@/domain/enums';

export interface NavItem {
  to: string;
  label: string;
  icon: string; // nome do ícone lucide
  roles: UserRole[];
  group: 'Operação' | 'Comercial' | 'Recursos' | 'Gestão' | 'Campo';
}

const ALL: UserRole[] = ['admin', 'supervisor', 'financeiro', 'atendimento', 'estoque', 'tecnico'];
const ADMIN: UserRole[] = ['admin', 'supervisor'];

export const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'LayoutDashboard', roles: ['admin', 'supervisor', 'financeiro', 'atendimento', 'estoque'], group: 'Operação' },
  { to: '/agenda', label: 'Agenda', icon: 'CalendarDays', roles: ['admin', 'supervisor', 'atendimento'], group: 'Operação' },
  { to: '/rotas', label: 'Roteirização', icon: 'Route', roles: ['admin', 'supervisor'], group: 'Operação' },
  { to: '/ordens', label: 'Ordens de Serviço', icon: 'ClipboardList', roles: ['admin', 'supervisor', 'atendimento'], group: 'Operação' },

  { to: '/clientes', label: 'Clientes', icon: 'Users', roles: ['admin', 'supervisor', 'atendimento', 'financeiro'], group: 'Comercial' },
  { to: '/crm', label: 'CRM', icon: 'Target', roles: ['admin', 'supervisor', 'atendimento'], group: 'Comercial' },
  { to: '/monitoramento', label: 'Monitoramento', icon: 'Radar', roles: ['admin', 'supervisor', 'atendimento'], group: 'Operação' },
  { to: '/nao-conformidade', label: 'Não Conformidade', icon: 'TriangleAlert', roles: ['admin', 'supervisor', 'atendimento'], group: 'Operação' },

  { to: '/estoque', label: 'Estoque', icon: 'Boxes', roles: ['admin', 'supervisor', 'estoque'], group: 'Recursos' },
  { to: '/produtos', label: 'Produtos', icon: 'FlaskConical', roles: ['admin', 'supervisor', 'estoque'], group: 'Recursos' },
  { to: '/equipamentos', label: 'Equipamentos', icon: 'Wrench', roles: ['admin', 'supervisor', 'estoque'], group: 'Recursos' },
  { to: '/veiculos', label: 'Veículos', icon: 'Truck', roles: ['admin', 'supervisor'], group: 'Recursos' },

  { to: '/financeiro', label: 'Financeiro', icon: 'Wallet', roles: ['admin', 'financeiro'], group: 'Gestão' },
  { to: '/fiscal', label: 'Fiscal', icon: 'FileText', roles: ['admin', 'financeiro'], group: 'Gestão' },
  { to: '/relatorios', label: 'Relatórios', icon: 'BarChart3', roles: ADMIN.concat('financeiro'), group: 'Gestão' },
  { to: '/config', label: 'Configurações', icon: 'Settings', roles: ['admin'], group: 'Gestão' },

  { to: '/campo', label: 'App do Técnico', icon: 'Smartphone', roles: ALL, group: 'Campo' },
];

export function navForRole(role: UserRole): NavItem[] {
  if (role === 'tecnico') {
    // Técnico acessa apenas o painel de campo.
    return navItems.filter((n) => n.to === '/campo');
  }
  return navItems.filter((n) => n.roles.includes(role));
}
