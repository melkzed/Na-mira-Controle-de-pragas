import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Repeat, Trash2, TriangleAlert } from 'lucide-react';
import { PageHeader, Stagger } from '../components/ui/misc';
import { StatCard } from '../components/StatCard';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Segmented } from '../components/ui/Segmented';
import { Table, type Column } from '../components/ui/Table';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer } from '@/application/repository';
import { useFinanceStore, useRecurringPayablesStore } from '@/store/entityStores';
import { uid } from '@/store/createEntityStore';
import { toast } from '@/store/toastStore';
import { Drawer } from '../components/ui/Drawer';
import { Field, Input, Select } from '../components/ui/Field';
import { Check } from 'lucide-react';
import type { FinanceEntry, RecurringPayable } from '@/domain/types';
import { FinanceEntryStatus, RECURRENCE_FREQ_LABEL, type FinanceEntryType, type RecurrenceFreq } from '@/domain/enums';
import { daysUntil, formatCompactCurrency, formatCurrency } from '@/lib/utils';
import { fmtDate } from '@/lib/date';
import { useEffect, useState } from 'react';

const statusMeta: Record<FinanceEntryStatus, { label: string; tone: any }> = {
  pago: { label: 'Pago', tone: 'success' },
  pendente: { label: 'Pendente', tone: 'warning' },
  atrasado: { label: 'Atrasado', tone: 'danger' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
};

/** Frequências mensais suportadas por contas recorrentes (intervalo em meses). */
const PAYABLE_FREQ: { value: RecurrenceFreq; months: number }[] = [
  { value: 'mensal', months: 1 }, { value: 'bimestral', months: 2 }, { value: 'trimestral', months: 3 }, { value: 'semestral', months: 6 }, { value: 'anual', months: 12 },
];
const monthsFor = (f: RecurrenceFreq) => PAYABLE_FREQ.find((p) => p.value === f)?.months ?? 1;
const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Próximas datas de vencimento de uma conta recorrente (a partir do mês atual). */
function occurrenceDates(p: RecurringPayable, count: number): Date[] {
  const M = monthsFor(p.frequency);
  const day = Math.min(p.dueDay || 1, 28);
  const now = new Date();
  const anchor = new Date(p.createdAt);
  let d = new Date(anchor.getFullYear(), anchor.getMonth(), day);
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d < firstOfMonth) d = new Date(d.getFullYear(), d.getMonth() + M, day);
  const out: Date[] = [];
  for (let i = 0; i < count; i++) { out.push(new Date(d)); d = new Date(d.getFullYear(), d.getMonth() + M, day); }
  return out;
}

/** Gera os lançamentos futuros das contas recorrentes (idempotente). Retorna quantos criou. */
function generateRecurring(count = 3): number {
  const finance = useFinanceStore.getState();
  const payables = useRecurringPayablesStore.getState().items.filter((p) => p.active);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let created = 0;
  payables.forEach((p) => {
    occurrenceDates(p, count).forEach((date) => {
      const monthKey = toDateStr(date).slice(0, 7);
      const dup = finance.items.some((e) => e.recurringId === p.id && (e.dueDate ?? '').slice(0, 7) === monthKey);
      if (!dup) {
        finance.add({ id: uid('fe'), orgId: 'org-namira', type: 'despesa', status: date < today ? 'atrasado' : 'pendente', description: p.description, amount: p.amount, dueDate: toDateStr(date), recurringId: p.id, createdAt: new Date().toISOString() });
        created += 1;
      }
    });
  });
  return created;
}

export function FinanceiroPage() {
  const { items: entries, add } = useFinanceStore();
  const [tab, setTab] = useState<'receber' | 'pagar'>('receber');
  const [formOpen, setFormOpen] = useState(false);

  // Gera automaticamente os lançamentos futuros das contas recorrentes.
  useEffect(() => { generateRecurring(3); }, []);

  // Aviso de vencimento: contas a pagar vencidas ou vencendo em até 7 dias.
  const dueSoon = entries.filter((e) => e.type === 'despesa' && (e.status === 'pendente' || e.status === 'atrasado') && e.dueDate && (daysUntil(e.dueDate) ?? 99) <= 7);

  const totals = useMemo(() => {
    const receber = entries.filter((e) => e.type === 'receita' && e.status !== 'pago' && e.status !== 'cancelado').reduce((s, e) => s + e.amount, 0);
    const pagar = entries.filter((e) => e.type === 'despesa' && e.status !== 'pago' && e.status !== 'cancelado').reduce((s, e) => s + e.amount, 0);
    const recebido = entries.filter((e) => e.type === 'receita' && e.status === 'pago').reduce((s, e) => s + e.amount, 0);
    const pago = entries.filter((e) => e.type === 'despesa' && e.status === 'pago').reduce((s, e) => s + e.amount, 0);
    return { receber, pagar, saldo: recebido - pago, recebido };
  }, [entries]);

  const rows = entries.filter((e) => (tab === 'receber' ? e.type === 'receita' : e.type === 'despesa'));

  const columns: Column<FinanceEntry>[] = [
    { key: 'desc', header: 'Descrição', render: (e) => (
      <div><p className="font-medium">{e.description}</p>{e.customerId && <p className="text-xs text-muted-foreground">{getCustomer(e.customerId)?.name}</p>}</div>
    ) },
    { key: 'due', header: 'Vencimento', render: (e) => {
      if (!e.dueDate) return '—';
      const d = daysUntil(e.dueDate) ?? 99;
      const warn = (e.status === 'pendente' || e.status === 'atrasado') && d <= 7;
      return <span className={warn ? (d < 0 ? 'font-semibold text-danger' : 'font-semibold text-warning') : 'text-foreground'}>{fmtDate(e.dueDate)}{warn ? (d < 0 ? ` · venceu` : d === 0 ? ' · hoje' : ` · em ${d}d`) : ''}</span>;
    } },
    { key: 'amount', header: 'Valor', align: 'right', render: (e) => <span className={tab === 'receber' ? 'font-semibold text-success' : 'font-semibold text-foreground'}>{formatCurrency(e.amount)}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (e) => {
      const overdue = e.status === 'pendente' && e.dueDate && (daysUntil(e.dueDate) ?? 1) < 0;
      const st = overdue ? 'atrasado' : e.status;
      return <Badge tone={statusMeta[st].tone} dot>{statusMeta[st].label}</Badge>;
    } },
  ];

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Fluxo de caixa, contas a pagar e a receber"
        actions={<Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Novo lançamento</Button>}
      />

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Saldo em caixa" value={totals.saldo} icon="Wallet" tone="brand" format={formatCompactCurrency} />
        <StatCard label="A receber" value={totals.receber} icon="TrendingUp" tone="success" format={formatCompactCurrency} />
        <StatCard label="A pagar" value={totals.pagar} icon="TrendingDown" tone="danger" format={formatCompactCurrency} />
        <StatCard label="Recebido no mês" value={totals.recebido} icon="CircleDollarSign" tone="info" format={formatCompactCurrency} />
      </Stagger>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="DRE simplificado" subtitle="Receita x Despesa mensal" />
          <CardBody>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={seed.revenueSeries} margin={{ left: -18, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'rgb(var(--color-muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--color-muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip cursor={{ fill: 'rgb(var(--color-muted) / 0.5)' }} content={({ active, payload, label }: any) => active && payload?.length ? (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-elevated">
                    <p className="mb-1 font-semibold text-foreground">{label}</p>
                    {payload.map((p: any, i: number) => <p key={i} className="text-muted-foreground">{p.name}: <span className="font-semibold text-foreground">{formatCompactCurrency(p.value)}</span></p>)}
                  </div>
                ) : null} />
                <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[6, 6, 0, 0]} barSize={18} />
                <Bar dataKey="despesa" name="Despesa" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Resumo do mês" />
          <CardBody className="space-y-3">
            <SummaryRow label="Receita bruta" value={seed.revenueSeries.at(-1)!.receita} tone="success" />
            <SummaryRow label="Despesas" value={-seed.revenueSeries.at(-1)!.despesa} tone="danger" />
            <div className="border-t border-border pt-3">
              <SummaryRow label="Lucro líquido" value={seed.revenueSeries.at(-1)!.receita - seed.revenueSeries.at(-1)!.despesa} tone="brand" bold />
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Margem de lucro: <span className="font-semibold text-foreground">{Math.round(((seed.revenueSeries.at(-1)!.receita - seed.revenueSeries.at(-1)!.despesa) / seed.revenueSeries.at(-1)!.receita) * 100)}%</span>
            </div>
          </CardBody>
        </Card>
      </div>

      {dueSoon.length > 0 && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft/40 p-3 text-sm text-warning">
          <TriangleAlert size={16} className="shrink-0" />
          {dueSoon.length} conta(s) a pagar vencendo em até 7 dias — total {formatCurrency(dueSoon.reduce((s, e) => s + e.amount, 0))}.
        </div>
      )}

      <div className="mt-6">
        <div className="mb-4">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'receber', label: 'Contas a receber' }, { value: 'pagar', label: 'Contas a pagar' }]} />
        </div>
        <Table columns={columns} rows={rows} keyField={(e) => e.id} />
      </div>

      <RecurringPayablesPanel />

      <FinanceForm open={formOpen} defaultType={tab === 'receber' ? 'receita' : 'despesa'} onClose={() => setFormOpen(false)} onSave={(e) => { add(e); setFormOpen(false); }} />
    </div>
  );
}

/** Contas a pagar recorrentes — geração automática de lançamentos futuros. */
function RecurringPayablesPanel() {
  const { items, add, update, remove } = useRecurringPayablesStore();
  const [formOpen, setFormOpen] = useState(false);

  const gerar = () => {
    const n = generateRecurring(3);
    toast(n > 0 ? `${n} lançamento(s) futuro(s) gerado(s).` : 'Lançamentos já estão em dia.', { tone: n > 0 ? 'success' : 'info' });
  };

  return (
    <Card className="mt-6">
      <CardHeader
        title={<span className="flex items-center gap-2"><Repeat size={16} className="text-brand" /> Contas a pagar recorrentes</span>}
        subtitle="Aluguel, salários, água, energia, contratos — geram lançamentos automaticamente"
        action={<div className="flex gap-2"><Button size="sm" variant="outline" onClick={gerar}>Gerar próximos</Button><Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setFormOpen(true)}>Nova conta</Button></div>}
      />
      <CardBody className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conta recorrente cadastrada.</p>}
        {items.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{p.description}{p.category ? <span className="ml-1 font-normal text-muted-foreground">· {p.category}</span> : null}</p>
              <p className="text-xs text-muted-foreground">{RECURRENCE_FREQ_LABEL[p.frequency]} · vence dia {p.dueDay} · {formatCurrency(p.amount)}</p>
            </div>
            <Badge tone={p.active ? 'success' : 'neutral'} dot>{p.active ? 'Ativa' : 'Pausada'}</Badge>
            <Button size="sm" variant="ghost" onClick={() => update(p.id, { active: !p.active })}>{p.active ? 'Pausar' : 'Ativar'}</Button>
            <button onClick={() => { remove(p.id); toast('Conta recorrente removida.', { tone: 'danger', action: { label: 'Desfazer', onClick: () => add(p) } }); }} aria-label={`Excluir ${p.description}`} className="rounded-md p-1 text-muted-foreground hover:text-danger"><Trash2 size={15} /></button>
          </div>
        ))}
      </CardBody>
      <RecurringForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(p) => { add(p); setFormOpen(false); generateRecurring(3); toast('Conta recorrente cadastrada.', { tone: 'success' }); }} />
    </Card>
  );
}

function RecurringForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (p: RecurringPayable) => void }) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Aluguel');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurrenceFreq>('mensal');
  const [dueDay, setDueDay] = useState('5');
  const [touched, setTouched] = useState(false);

  useEffect(() => { if (open) { setDescription(''); setCategory('Aluguel'); setAmount(''); setFrequency('mensal'); setDueDay('5'); setTouched(false); } }, [open]);

  const valid = description.trim() && Number(amount) > 0;
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onSave({ id: uid('rp'), orgId: 'org-namira', description: description.trim(), category: category.trim() || undefined, amount: Number(amount), frequency, dueDay: Math.min(Math.max(Number(dueDay) || 1, 1), 28), active: true, createdAt: new Date().toISOString() });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Nova conta recorrente" subtitle="Gera lançamentos a pagar automaticamente"
      footer={<div className="flex items-center justify-between gap-2"><span className="text-xs text-danger">{touched && !valid ? 'Preencha descrição e valor.' : ''}</span><div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!valid}>Cadastrar</Button></div></div>}>
      <div className="space-y-4">
        <Field label="Descrição" required><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel da sede" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Categoria"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{['Aluguel', 'Salários', 'Água', 'Energia', 'Internet', 'Telefonia', 'Contrato', 'Impostos', 'Outros'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Valor (R$)" required><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Frequência"><Select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceFreq)}>{PAYABLE_FREQ.map((f) => <option key={f.value} value={f.value}>{RECURRENCE_FREQ_LABEL[f.value]}</option>)}</Select></Field>
          <Field label="Dia de vencimento"><Input type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(e.target.value)} /></Field>
        </div>
      </div>
    </Drawer>
  );
}

function FinanceForm({ open, defaultType, onClose, onSave }: { open: boolean; defaultType: FinanceEntryType; onClose: () => void; onSave: (e: FinanceEntry) => void }) {
  const [type, setType] = useState<FinanceEntryType>(defaultType);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<FinanceEntryStatus>('pendente');
  const [dueDate, setDueDate] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) { setType(defaultType); setDescription(''); setAmount(''); setStatus('pendente'); setDueDate(''); setTouched(false); }
  }, [open, defaultType]);

  const valid = description.trim() && Number(amount) > 0;
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onSave({
      id: uid('fe'), orgId: 'org-namira', type, status,
      description: description.trim(), amount: Number(amount),
      dueDate: dueDate || undefined,
      paidAt: status === 'pago' ? (dueDate || new Date().toISOString().slice(0, 10)) : undefined,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Novo lançamento" subtitle="Receita ou despesa"
      footer={<div className="flex items-center justify-between gap-2"><span className="text-xs text-danger">{touched && !valid ? 'Preencha descrição e valor.' : ''}</span><div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!valid}>Lançar</Button></div></div>}>
      <div className="space-y-4">
        <Segmented value={type} onChange={setType} options={[{ value: 'receita', label: 'Receita' }, { value: 'despesa', label: 'Despesa' }]} />
        <Field label="Descrição" required><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Contrato mensal · Cliente X" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Valor (R$)" required><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Vencimento"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
          <Field label="Status" className="col-span-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value as FinanceEntryStatus)}>
              {(['pendente', 'pago', 'atrasado', 'cancelado'] as FinanceEntryStatus[]).map((s) => <option key={s} value={s}>{statusMeta[s].label}</option>)}
            </Select>
          </Field>
        </div>
      </div>
    </Drawer>
  );
}

function SummaryRow({ label, value, tone, bold }: { label: string; value: number; tone: string; bold?: boolean }) {
  const color = { success: 'text-success', danger: 'text-danger', brand: 'text-brand' }[tone] ?? 'text-foreground';
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`text-sm font-bold ${color}`}>{formatCurrency(value)}</span>
    </div>
  );
}
