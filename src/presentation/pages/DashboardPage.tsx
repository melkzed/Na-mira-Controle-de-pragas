import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import { PageHeader, Stagger } from '../components/ui/misc';
import { StatCard } from '../components/StatCard';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Icon } from '../components/ui/Icon';
import { AppointmentStatusBadge } from '../components/StatusBadge';
import { computeDashboard, productConsumption } from '@/application/metrics';
import { appointmentsByDay, getCustomer, getServiceType, getUser } from '@/application/repository';
import * as seed from '@/infrastructure/seed/data';
import { APPOINTMENT_STATUS_META } from '@/domain/enums';
import { formatCompactCurrency, formatNumber } from '@/lib/utils';
import { fmtTime } from '@/lib/date';
import { useAppStore } from '@/store/appStore';

export function DashboardPage() {
  const m = useMemo(() => computeDashboard(), []);
  const consumption = useMemo(() => productConsumption().slice(0, 5), []);
  const notifications = useAppStore((s) => s.notifications);
  const todayIso = new Date().toISOString();
  const todayAppts = appointmentsByDay(todayIso);

  const statusData = Object.entries(APPOINTMENT_STATUS_META).map(([key, meta]) => ({
    name: meta.label,
    value: seed.appointments.filter((a) => a.status === key).length,
    tone: meta.tone,
  })).filter((d) => d.value > 0);

  const toneColor: Record<string, string> = {
    neutral: '#94a3b8', info: '#0ea5e9', warning: '#f59e0b',
    brand: '#10b981', success: '#22c55e', danger: '#ef4444',
  };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Visão geral da operação · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
      />

      {/* KPIs principais */}
      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Agendamentos hoje" value={m.todayAppointments} icon="CalendarClock" tone="brand" delta={12} />
        <StatCard label="Faturamento mensal" value={m.revenueMonth} icon="TrendingUp" tone="success" format={formatCompactCurrency} delta={8} />
        <StatCard label="Lucro do mês" value={m.profitMonth} icon="PiggyBank" tone="info" format={formatCompactCurrency} delta={6} />
        <StatCard label="Clientes ativos" value={m.activeCustomers} icon="Users" tone="brand" delta={4} hint={`${m.newCustomers} novos em 30 dias`} />
      </Stagger>

      {/* KPIs secundários */}
      <Stagger className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat label="Concluídos" value={m.completed} icon="CircleCheck" tone="success" />
        <MiniStat label="Pendentes" value={m.pending} icon="Clock" tone="warning" />
        <MiniStat label="Cancelados" value={m.cancelled} icon="CircleX" tone="danger" />
        <MiniStat label="Téc. em campo" value={m.techniciansWorking} icon="Hammer" tone="brand" />
        <MiniStat label="Téc. disponíveis" value={m.techniciansAvailable} icon="UserCheck" tone="info" />
        <MiniStat label="Veíc. em operação" value={m.vehiclesInOperation} icon="Truck" tone="neutral" />
      </Stagger>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Gráfico de faturamento */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Faturamento x Despesas"
            subtitle="Últimos 6 meses"
            action={<Badge tone="success" dot>+8% vs. mês anterior</Badge>}
          />
          <CardBody>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={seed.revenueSeries} margin={{ left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'rgb(var(--color-muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--color-muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip content={<ChartTooltip currency />} />
                <Area type="monotone" dataKey="receita" name="Receita" stroke="#10b981" strokeWidth={2.5} fill="url(#gRec)" />
                <Area type="monotone" dataKey="despesa" name="Despesa" stroke="#f59e0b" strokeWidth={2.5} fill="url(#gDes)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Distribuição de status */}
        <Card>
          <CardHeader title="Atendimentos por status" subtitle="Distribuição atual" />
          <CardBody>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3} stroke="none">
                  {statusData.map((d, i) => (
                    <Cell key={i} fill={toneColor[d.tone]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {statusData.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: toneColor[d.tone] }} />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="ml-auto font-semibold text-foreground">{d.value}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Agenda de hoje */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Agenda de hoje"
            subtitle={`${todayAppts.length} atendimentos programados`}
            action={<a href="/agenda" className="text-xs font-medium text-brand hover:underline">Ver agenda →</a>}
          />
          <CardBody className="space-y-2">
            {todayAppts.slice(0, 6).map((a) => {
              const cust = getCustomer(a.customerId);
              const st = getServiceType(a.serviceTypeId);
              const tech = getUser(a.technicianId);
              return (
                <motion.div
                  key={a.id}
                  whileHover={{ x: 3 }}
                  className="flex items-center gap-3 rounded-xl border border-border/60 p-3 transition hover:bg-muted/40"
                >
                  <div className="w-12 shrink-0 text-center">
                    <p className="text-sm font-semibold text-foreground">{fmtTime(a.scheduledStart)}</p>
                    <p className="text-[10px] text-muted-foreground">{a.estimatedMinutes}min</p>
                  </div>
                  <span className="h-9 w-1 rounded-full" style={{ background: st?.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{cust?.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{st?.name} · {a.address}</p>
                  </div>
                  {tech && <Avatar name={tech.name} size="xs" />}
                  <AppointmentStatusBadge status={a.status} />
                </motion.div>
              );
            })}
          </CardBody>
        </Card>

        {/* Alertas + notificações */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Alertas" subtitle="Requer atenção" />
            <CardBody className="space-y-2.5">
              <AlertRow icon="PackageX" tone="warning" label="Estoque baixo" value={`${m.lowStockCount} produtos`} />
              <AlertRow icon="CalendarX" tone="warning" label="Produtos vencendo" value={`${m.expiringCount} lotes`} />
              <AlertRow icon="TriangleAlert" tone="danger" label="Produtos vencidos" value={`${m.expiredCount} lotes`} />
              <AlertRow icon="FileWarning" tone="danger" label="Licenças a vencer" value={`${m.licensesExpiringSoon} docs`} />
              <AlertRow icon="Timer" tone="info" label="Tempo médio de atend." value={`${m.avgServiceMinutes} min`} />
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Produtos mais utilizados */}
        <Card className="lg:col-span-2">
          <CardHeader title="Produtos mais utilizados" subtitle="Consumo acumulado" />
          <CardBody>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={consumption.map((c) => ({ name: c.product.name.split(' ').slice(0, 2).join(' '), qty: c.qty }))} margin={{ left: -20, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgb(var(--color-muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--color-muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--color-muted) / 0.5)' }} />
                <Bar dataKey="qty" name="Qtd. usada" fill="#10b981" radius={[6, 6, 0, 0]} barSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Últimas movimentações / notificações */}
        <Card>
          <CardHeader title="Últimas movimentações" />
          <CardBody className="space-y-3">
            {notifications.slice(0, 5).map((n) => (
              <div key={n.id} className="flex gap-3">
                <Badge tone={n.tone} dot className="mt-0.5 shrink-0">{''}</Badge>
                <div className="leading-snug">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: any }) {
  const toneClass: Record<string, string> = {
    success: 'text-success', warning: 'text-warning', danger: 'text-danger',
    brand: 'text-brand', info: 'text-info', neutral: 'text-muted-foreground',
  };
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="rounded-xl border border-border bg-surface p-3.5">
      <div className="mb-1 flex items-center justify-between">
        <Icon name={icon} size={15} className={toneClass[tone]} />
      </div>
      <p className={`text-lg font-bold ${toneClass[tone]}`}>{formatNumber(value)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </motion.div>
  );
}

function AlertRow({ icon, tone, label, value }: { icon: string; tone: any; label: string; value: string }) {
  const toneClass: Record<string, string> = {
    success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger', brand: 'bg-brand-soft text-brand',
    info: 'bg-info-soft text-info', neutral: 'bg-muted text-muted-foreground',
  };
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClass[tone]}`}>
        <Icon name={icon} size={15} />
      </span>
      <span className="flex-1 text-sm text-foreground">{label}</span>
      <span className="text-sm font-semibold text-muted-foreground">{value}</span>
    </div>
  );
}

function ChartTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-elevated">
      {label && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          {p.name}: <span className="font-semibold text-foreground">{currency ? formatCompactCurrency(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}
