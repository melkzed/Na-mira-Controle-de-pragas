import { PageHeader } from '../components/ui/misc';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import * as seed from '@/infrastructure/seed/data';
import { ROLE_META, type UserRole } from '@/domain/enums';
import type { User } from '@/domain/types';

const permissionMatrix: { module: string; roles: UserRole[] }[] = [
  { module: 'Dashboard', roles: ['admin', 'supervisor', 'financeiro', 'atendimento', 'estoque'] },
  { module: 'Agenda / Ordens', roles: ['admin', 'supervisor', 'atendimento'] },
  { module: 'Clientes / CRM', roles: ['admin', 'supervisor', 'atendimento'] },
  { module: 'Estoque / Produtos', roles: ['admin', 'supervisor', 'estoque'] },
  { module: 'Financeiro / Fiscal', roles: ['admin', 'financeiro'] },
  { module: 'Relatórios', roles: ['admin', 'supervisor', 'financeiro'] },
  { module: 'App do Técnico', roles: ['tecnico', 'admin', 'supervisor'] },
];
const ALL_ROLES: UserRole[] = ['admin', 'supervisor', 'financeiro', 'atendimento', 'estoque', 'tecnico'];

export function ConfigPage() {
  const columns: Column<User>[] = [
    { key: 'name', header: 'Usuário', render: (u) => (
      <div className="flex items-center gap-2.5"><Avatar name={u.name} size="sm" /><div><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div></div>
    ) },
    { key: 'role', header: 'Perfil', render: (u) => <Badge tone="brand">{ROLE_META[u.role].label}</Badge> },
    { key: 'phone', header: 'Telefone', render: (u) => <span className="text-muted-foreground">{u.phone ?? '—'}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (u) => <Badge tone={u.isActive ? 'success' : 'neutral'} dot>{u.isActive ? 'Ativo' : 'Inativo'}</Badge> },
  ];

  return (
    <div>
      <PageHeader title="Configurações" description="Usuários, permissões e preferências da organização" actions={<Button>Convidar usuário</Button>} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Usuários e equipe" subtitle={`${seed.users.length} usuários`} />
          <CardBody className="p-0">
            <div className="px-4 pb-4"><Table columns={columns} rows={seed.users} keyField={(u) => u.id} /></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Organização" />
          <CardBody className="space-y-2.5 text-sm">
            <Row label="Nome" value={seed.orgProfile.name} />
            <Row label="Razão social" value={seed.orgProfile.legalName} />
            <Row label="CNPJ" value={seed.orgProfile.cnpj} />
            <Row label="Cidade" value={`${seed.orgProfile.city}/${seed.orgProfile.state}`} />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Matriz de permissões (RBAC)" subtitle="Controle de acesso por perfil" />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Módulo</th>
                  {ALL_ROLES.map((r) => <th key={r} className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{ROLE_META[r].label}</th>)}
                </tr>
              </thead>
              <tbody>
                {permissionMatrix.map((row) => (
                  <tr key={row.module} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{row.module}</td>
                    {ALL_ROLES.map((r) => (
                      <td key={r} className="px-3 py-3 text-center">
                        {row.roles.includes(r) ? <span className="inline-block h-2 w-2 rounded-full bg-brand" /> : <span className="inline-block h-2 w-2 rounded-full bg-border" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return <div className="flex items-center justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">{label}</span><span className="font-medium text-foreground">{value}</span></div>;
}
