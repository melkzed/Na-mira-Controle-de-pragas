import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowLeftRight, Banknote, Check, CheckCheck, Clock, Landmark, Lock, Paperclip,
  PiggyBank, Plus, Repeat, ThumbsDown, ThumbsUp, Trash2, TriangleAlert,
} from 'lucide-react';
import { PageHeader, Stagger } from '../components/ui/misc';
import { StatCard } from '../components/StatCard';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Segmented } from '../components/ui/Segmented';
import { Table, type Column } from '../components/ui/Table';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer } from '@/application/repository';
import { useFinanceStore, useRecurringPayablesStore, useBankAccountsStore, useChecksStore, useLoansStore } from '@/store/entityStores';
import { useBankTransactionsStore, accountBalance, TRANSACTION_SIGN } from '@/store/bankTransactionsStore';
import { useCashClosingStore } from '@/store/cashClosingStore';
import { uid } from '@/store/createEntityStore';
import { currentOrgId } from '@/store/appStore';
import { toast } from '@/store/toastStore';
import { Drawer } from '../components/ui/Drawer';
import { Field, Input, Select } from '../components/ui/Field';
import type { BankAccount, Check as CheckEntity, FinanceEntry, LoanInvestment, PaymentMethodKind, RecurringPayable, TaxKind } from '@/domain/types';
import { FinanceEntryStatus, RECURRENCE_FREQ_LABEL, type FinanceEntryType, type RecurrenceFreq } from '@/domain/enums';
import { daysUntil, formatCompactCurrency, formatCurrency } from '@/lib/utils';
import { fmtDate, parseDateInput, toDateInputValue } from '@/lib/date';

const statusMeta: Record<FinanceEntryStatus, { label: string; tone: any }> = {
  pago: { label: 'Pago', tone: 'success' },
  pendente: { label: 'Pendente', tone: 'warning' },
  atrasado: { label: 'Atrasado', tone: 'danger' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
};

const PAYMENT_METHOD_LABEL: Record<PaymentMethodKind, string> = {
  cheque: 'Cheque', debito_conta: 'Débito em conta', eletronico: 'Eletrônico', dinheiro: 'Dinheiro',
};
const TAX_KIND_LABEL: Record<TaxKind, string> = { darf: 'DARF', iptu: 'IPTU', concessionaria: 'Concessionária' };

/** Frequências mensais suportadas por contas recorrentes (intervalo em meses). */
const PAYABLE_FREQ: { value: RecurrenceFreq; months: number }[] = [
  { value: 'mensal', months: 1 }, { value: 'bimestral', months: 2 }, { value: 'trimestral', months: 3 }, { value: 'semestral', months: 6 }, { value: 'anual', months: 12 },
];
const monthsFor = (f: RecurrenceFreq) => PAYABLE_FREQ.find((p) => p.value === f)?.months ?? 1;
const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const netAmount = (e: FinanceEntry) => e.amount - (e.discount ?? 0);

/** Próximas datas de vencimento de uma conta recorrente (a partir do mês atual). */
function occurrenceDates(p: RecurringPayable, count: number): Date[] {
  const M = monthsFor(p.frequency);
  const day = Math.min(p.dueDay || 1, 28);
  const now = new Date();
  const anchor = p.startDate ? parseDateInput(p.startDate) : new Date(p.createdAt);
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
  const today = today0();
  let created = 0;
  payables.forEach((p) => {
    occurrenceDates(p, count).forEach((date) => {
      const monthKey = toDateStr(date).slice(0, 7);
      const dup = finance.items.some((e) => e.recurringId === p.id && (e.dueDate ?? '').slice(0, 7) === monthKey);
      if (!dup) {
        finance.add({ id: uid('fe'), orgId: currentOrgId(), type: 'despesa', status: date < today ? 'atrasado' : 'pendente', description: p.description, amount: p.amount, dueDate: toDateStr(date), recurringId: p.id, approvalStatus: 'pendente', createdAt: new Date().toISOString() });
        created += 1;
      }
    });
  });
  return created;
}

export function FinanceiroPage() {
  const [tab, setTab] = useState<'geral' | 'bancos' | 'cheques' | 'emprestimos' | 'fechamento'>('geral');

  useEffect(() => { generateRecurring(3); }, []);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Fluxo de caixa, contas a pagar/receber, bancos e conciliação"
      />

      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'geral', label: 'Visão geral' },
          { value: 'bancos', label: 'Bancos' },
          { value: 'cheques', label: 'Cheques' },
          { value: 'emprestimos', label: 'Empréstimos/Aplicações' },
          { value: 'fechamento', label: 'Fechamento de caixa' },
        ]} />
      </div>

      {tab === 'geral' && <VisaoGeralTab />}
      {tab === 'bancos' && <BancosTab />}
      {tab === 'cheques' && <ChequesTab />}
      {tab === 'emprestimos' && <EmprestimosTab />}
      {tab === 'fechamento' && <FechamentoTab />}
    </div>
  );
}

/** Visão geral: KPIs, DRE, contas a pagar/receber (com aprovação, desconto, agrupamento, prorrogação e emissão de pagamento). */
function VisaoGeralTab() {
  const { items: entries, add, update } = useFinanceStore();
  const [subTab, setSubTab] = useState<'receber' | 'pagar'>('receber');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [payDialogEntries, setPayDialogEntries] = useState<FinanceEntry[] | null>(null);

  // Aviso de vencimento: contas a pagar vencidas ou vencendo em até 7 dias.
  const dueSoon = entries.filter((e) => e.type === 'despesa' && (e.status === 'pendente' || e.status === 'atrasado') && e.dueDate && (daysUntil(e.dueDate) ?? 99) <= 7);

  const totals = useMemo(() => {
    const receber = entries.filter((e) => e.type === 'receita' && e.status !== 'pago' && e.status !== 'cancelado').reduce((s, e) => s + netAmount(e), 0);
    const pagar = entries.filter((e) => e.type === 'despesa' && e.status !== 'pago' && e.status !== 'cancelado').reduce((s, e) => s + netAmount(e), 0);
    const recebido = entries.filter((e) => e.type === 'receita' && e.status === 'pago').reduce((s, e) => s + netAmount(e), 0);
    const pago = entries.filter((e) => e.type === 'despesa' && e.status === 'pago').reduce((s, e) => s + netAmount(e), 0);
    return { receber, pagar, saldo: recebido - pago, recebido };
  }, [entries]);

  const tributos = useMemo(() => {
    const monthKey = toDateInputValue(new Date()).slice(0, 7);
    const doMes = entries.filter((e) => e.taxKind && (e.dueDate ?? '').slice(0, 7) === monthKey);
    return { pendentes: doMes.filter((e) => e.status !== 'pago').reduce((s, e) => s + netAmount(e), 0), count: doMes.length };
  }, [entries]);

  const rows = entries.filter((e) => (subTab === 'receber' ? e.type === 'receita' : e.type === 'despesa'));

  const attachFiscalDoc = (entryId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => { update(entryId, { fiscalDocumentName: file.name, fiscalDocumentUrl: String(reader.result) }); toast('Documento fiscal anexado.', { tone: 'success' }); };
    reader.readAsDataURL(file);
  };

  const approve = (e: FinanceEntry, ok: boolean) => {
    update(e.id, ok ? { approvalStatus: 'aprovado' } : { approvalStatus: 'reprovado', status: 'cancelado' });
    toast(ok ? 'Pagamento aprovado.' : 'Pagamento reprovado.', { tone: ok ? 'success' : 'danger' });
  };

  const postpone = (e: FinanceEntry) => {
    const base = e.dueDate ? parseDateInput(e.dueDate) : new Date();
    base.setDate(base.getDate() + 30);
    update(e.id, { dueDate: toDateStr(base), status: 'pendente', postponedFrom: e.postponedFrom ?? e.dueDate });
    toast(`Vencimento prorrogado para ${fmtDate(toDateStr(base))}.`, { tone: 'success' });
  };

  const toggleSelect = (id: string) => setSelectedIds((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  const payableSelected = entries.filter((e) => selectedIds.includes(e.id));

  const columns: Column<FinanceEntry>[] = [
    ...(subTab === 'pagar' ? [{
      key: 'sel', header: '', render: (e: FinanceEntry) => (
        (e.status === 'pendente' || e.status === 'atrasado') && (e.approvalStatus ?? 'aprovado') === 'aprovado' ? (
          <input type="checkbox" checked={selectedIds.includes(e.id)} onChange={() => toggleSelect(e.id)} onClick={(ev) => ev.stopPropagation()} className="h-4 w-4 rounded border-border" aria-label={`Selecionar ${e.description}`} />
        ) : null
      ),
    } as Column<FinanceEntry>] : []),
    { key: 'desc', header: 'Descrição', render: (e) => (
      <div>
        <p className="font-medium">{e.description}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {e.customerId && <span className="text-xs text-muted-foreground">{getCustomer(e.customerId)?.name}</span>}
          {e.taxKind && <Badge tone="info" className="text-[10px]">{TAX_KIND_LABEL[e.taxKind]}</Badge>}
          {e.discount ? <Badge tone="brand" className="text-[10px]">desconto {formatCurrency(e.discount)}</Badge> : null}
          {e.postponedFrom && <Badge tone="warning" className="text-[10px]">prorrogada</Badge>}
        </div>
      </div>
    ) },
    { key: 'due', header: 'Vencimento', render: (e) => {
      if (!e.dueDate) return '—';
      const d = daysUntil(e.dueDate) ?? 99;
      const warn = (e.status === 'pendente' || e.status === 'atrasado') && d <= 7;
      return <span className={warn ? (d < 0 ? 'font-semibold text-danger' : 'font-semibold text-warning') : 'text-foreground'}>{fmtDate(e.dueDate)}{warn ? (d < 0 ? ` · venceu` : d === 0 ? ' · hoje' : ` · em ${d}d`) : ''}</span>;
    } },
    { key: 'amount', header: 'Valor', align: 'right', render: (e) => <span className={subTab === 'receber' ? 'font-semibold text-success' : 'font-semibold text-foreground'}>{formatCurrency(netAmount(e))}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (e) => {
      const overdue = e.status === 'pendente' && e.dueDate && (daysUntil(e.dueDate) ?? 1) < 0;
      const st = overdue ? 'atrasado' : e.status;
      return (
        <div className="flex flex-col items-end gap-1">
          <Badge tone={statusMeta[st].tone} dot>{statusMeta[st].label}</Badge>
          {e.type === 'despesa' && (e.status === 'pendente' || e.status === 'atrasado') && (e.approvalStatus ?? 'pendente') !== 'aprovado' && (
            <Badge tone="warning" className="text-[10px]">aprovação pendente</Badge>
          )}
          {e.status === 'pago' && e.paidAt && <span className="text-[10px] text-muted-foreground">pago em {fmtDate(e.paidAt)}</span>}
          {e.paymentMethod && <span className="text-[10px] text-muted-foreground">{PAYMENT_METHOD_LABEL[e.paymentMethod]}</span>}
        </div>
      );
    } },
    { key: 'acoes', header: 'Ações', align: 'right', render: (e) => {
      if (e.status === 'pago' || e.status === 'cancelado') {
        return e.fiscalDocumentUrl ? <a href={e.fiscalDocumentUrl} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="text-xs text-brand underline">nota fiscal</a> : null;
      }
      if (e.type === 'despesa' && (e.approvalStatus ?? 'pendente') === 'pendente') {
        return (
          <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
            <button onClick={() => approve(e, true)} aria-label="Aprovar" className="rounded-md p-1.5 text-success hover:bg-success-soft"><ThumbsUp size={14} /></button>
            <button onClick={() => approve(e, false)} aria-label="Reprovar" className="rounded-md p-1.5 text-danger hover:bg-danger-soft"><ThumbsDown size={14} /></button>
          </div>
        );
      }
      return (
        <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
          {e.type === 'despesa' && (
            <button onClick={() => postpone(e)} aria-label="Prorrogar vencimento" title="Prorrogar 30 dias" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-warning"><Clock size={14} /></button>
          )}
          <label className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-brand" title="Anexar documento fiscal">
            <Paperclip size={14} />
            <input type="file" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) attachFiscalDoc(e.id, f); ev.target.value = ''; }} />
          </label>
          <Button size="sm" onClick={() => setPayDialogEntries([e])}>Pagar</Button>
        </div>
      );
    } },
  ];

  return (
    <>
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
            {tributos.count > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <p className="mb-0.5 font-semibold text-foreground">Tributos do mês (DARF/IPTU/Concessionárias)</p>
                <p className="text-muted-foreground">{tributos.count} lançamento(s) · pendente {formatCurrency(tributos.pendentes)}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {dueSoon.length > 0 && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft/40 p-3 text-sm text-warning">
          <TriangleAlert size={16} className="shrink-0" />
          {dueSoon.length} conta(s) a pagar vencendo em até 7 dias — total {formatCurrency(dueSoon.reduce((s, e) => s + netAmount(e), 0))}.
        </div>
      )}

      <div className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Segmented value={subTab} onChange={(v) => { setSubTab(v); setSelectedIds([]); }} options={[{ value: 'receber', label: 'Contas a receber' }, { value: 'pagar', label: 'Contas a pagar' }]} />
          <div className="flex gap-2">
            {subTab === 'pagar' && payableSelected.length > 0 && (
              <Button size="sm" leftIcon={<CheckCheck size={14} />} onClick={() => setPayDialogEntries(payableSelected)}>Pagar selecionados ({payableSelected.length})</Button>
            )}
            <Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Novo lançamento</Button>
          </div>
        </div>
        <Table columns={columns} rows={rows} keyField={(e) => e.id} />
      </div>

      <RecurringPayablesPanel />

      <FinanceForm open={formOpen} defaultType={subTab === 'receber' ? 'receita' : 'despesa'} onClose={() => setFormOpen(false)} onSave={(e) => { add(e); setFormOpen(false); }} />
      <PaymentDialog
        entries={payDialogEntries}
        onClose={() => { setPayDialogEntries(null); setSelectedIds([]); }}
      />
    </>
  );
}

/** Assistente de emissão de pagamento — forma de pagamento, banco/cheque, agrupamento e desconto já aplicado. */
function PaymentDialog({ entries, onClose }: { entries: FinanceEntry[] | null; onClose: () => void }) {
  const update = useFinanceStore((s) => s.update);
  const accounts = useBankAccountsStore((s) => s.items);
  const addTransaction = useBankTransactionsStore((s) => s.add);
  const addCheck = useChecksStore((s) => s.add);
  const [method, setMethod] = useState<PaymentMethodKind>('eletronico');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [checkNumber, setCheckNumber] = useState('');
  const [paidAt, setPaidAt] = useState(toDateInputValue(new Date()));

  useEffect(() => { if (entries) { setMethod('eletronico'); setAccountId(accounts[0]?.id ?? ''); setCheckNumber(''); setPaidAt(toDateInputValue(new Date())); } }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entries || entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + netAmount(e), 0);
  const isReceita = entries[0].type === 'receita';
  const account = accounts.find((a) => a.id === accountId);

  const confirm = () => {
    const effectiveDate = paidAt || toDateInputValue(new Date());
    const groupId = entries.length > 1 ? uid('grp') : undefined;
    entries.forEach((e) => update(e.id, { status: 'pago', paidAt: effectiveDate, paymentMethod: method, bankAccountId: (method === 'debito_conta' || method === 'eletronico') ? accountId : undefined, groupId }));

    if ((method === 'debito_conta' || method === 'eletronico') && account) {
      addTransaction({
        accountId: account.id,
        type: isReceita ? 'recebimento' : 'pagamento',
        amount: total,
        date: effectiveDate,
        description: entries.length > 1 ? `Pagamento agrupado (${entries.length} lançamentos)` : entries[0].description,
        relatedFinanceEntryId: entries[0].id,
      });
    }
    if (method === 'cheque') {
      addCheck({
        id: uid('chk'), orgId: currentOrgId(), number: checkNumber.trim() || `CHQ-${Date.now().toString().slice(-6)}`,
        bank: account?.bank ?? 'Banco', amount: total, issueDate: effectiveDate, status: 'emitido', financeEntryId: entries[0].id,
      });
    }
    toast(entries.length > 1 ? `${entries.length} lançamentos pagos (${formatCurrency(total)}).` : `Lançamento pago (${formatCurrency(total)}).`, { tone: 'success' });
    onClose();
  };

  return (
    <Drawer open={!!entries} onClose={onClose} title={isReceita ? 'Registrar recebimento' : 'Emitir pagamento'} subtitle={`${entries.length} lançamento(s) · total ${formatCurrency(total)}`}
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={confirm} leftIcon={<Check size={15} />}>Confirmar</Button></div>}>
      <div className="space-y-4">
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
          {entries.map((e) => <div key={e.id} className="flex items-center justify-between text-sm"><span className="text-foreground">{e.description}</span><span className="font-medium text-foreground">{formatCurrency(netAmount(e))}</span></div>)}
        </div>
        <Field label="Data do pagamento" hint="Pré-preenchida com hoje — ajuste se o pagamento foi antecipado ou já ocorreu em outra data">
          <Input type="date" value={paidAt} onChange={(ev) => setPaidAt(ev.target.value)} onClick={(ev) => ev.currentTarget.showPicker?.()} />
        </Field>
        <Field label="Forma de pagamento">
          <Select value={method} onChange={(ev) => setMethod(ev.target.value as PaymentMethodKind)}>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethodKind[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
          </Select>
        </Field>
        {(method === 'debito_conta' || method === 'eletronico') && (
          <Field label="Conta bancária" hint="Débito interligado com o banco — gera a movimentação no extrato">
            <Select value={accountId} onChange={(ev) => setAccountId(ev.target.value)}>
              {accounts.length === 0 && <option value="">Nenhuma conta cadastrada</option>}
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.alias ?? a.bank} · {a.bank}</option>)}
            </Select>
          </Field>
        )}
        {method === 'cheque' && (
          <Field label="Número do cheque"><Input value={checkNumber} onChange={(ev) => setCheckNumber(ev.target.value)} placeholder="Ex.: 000123" /></Field>
        )}
      </div>
    </Drawer>
  );
}

/** Contas a pagar recorrentes — geração automática de lançamentos futuros,
 *  com status (a pagar/paga/vencida) e baixa direto por aqui — cada linha
 *  reflete o lançamento (FinanceEntry) mais relevante gerado por ela. */
function RecurringPayablesPanel() {
  const { items, add, update, remove } = useRecurringPayablesStore();
  const entries = useFinanceStore((s) => s.items);
  const [formOpen, setFormOpen] = useState(false);
  const [payDialogEntries, setPayDialogEntries] = useState<FinanceEntry[] | null>(null);

  const gerar = () => {
    const n = generateRecurring(3);
    toast(n > 0 ? `${n} lançamento(s) futuro(s) gerado(s).` : 'Lançamentos já estão em dia.', { tone: n > 0 ? 'success' : 'info' });
  };

  /** Lançamento mais relevante desta conta: o próximo em aberto (pendente/
   *  atrasado) ou, se não houver, o mais recente já pago. */
  const relevantEntry = (p: RecurringPayable): FinanceEntry | undefined => {
    const linked = entries.filter((e) => e.recurringId === p.id);
    const open = linked.filter((e) => e.status === 'pendente' || e.status === 'atrasado').sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
    if (open.length) return open[0];
    return [...linked.filter((e) => e.status === 'pago')].sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''))[0];
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
        {items.map((p) => {
          const next = relevantEntry(p);
          const overdue = !!next && next.status === 'pendente' && !!next.dueDate && (daysUntil(next.dueDate) ?? 1) < 0;
          const entryStatus = next ? (overdue ? 'atrasado' : next.status) : undefined;
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{p.description}{p.category ? <span className="ml-1 font-normal text-muted-foreground">· {p.category}</span> : null}</p>
                <p className="text-xs text-muted-foreground">
                  {RECURRENCE_FREQ_LABEL[p.frequency]} · {next?.dueDate ? `vence ${fmtDate(next.dueDate)}` : `vence dia ${p.dueDay}`} · {formatCurrency(p.amount)}
                  {next?.status === 'pago' && next.paidAt && <> · pago em {fmtDate(next.paidAt)}</>}
                </p>
              </div>
              {entryStatus && <Badge tone={statusMeta[entryStatus].tone} dot>{statusMeta[entryStatus].label}</Badge>}
              <Badge tone={p.active ? 'success' : 'neutral'} dot>{p.active ? 'Ativa' : 'Pausada'}</Badge>
              {next && (next.status === 'pendente' || next.status === 'atrasado') && (
                <Button size="sm" onClick={() => setPayDialogEntries([next])}>Pagar</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => update(p.id, { active: !p.active })}>{p.active ? 'Pausar' : 'Ativar'}</Button>
              <button onClick={() => { remove(p.id); toast('Conta recorrente removida.', { tone: 'danger', action: { label: 'Desfazer', onClick: () => add(p) } }); }} aria-label={`Excluir ${p.description}`} className="rounded-md p-1 text-muted-foreground hover:text-danger"><Trash2 size={15} /></button>
            </div>
          );
        })}
      </CardBody>
      <RecurringForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(p) => { add(p); setFormOpen(false); generateRecurring(3); toast('Conta recorrente cadastrada.', { tone: 'success' }); }} />
      <PaymentDialog entries={payDialogEntries} onClose={() => setPayDialogEntries(null)} />
    </Card>
  );
}

function RecurringForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (p: RecurringPayable) => void }) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Aluguel');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurrenceFreq>('mensal');
  const [startDate, setStartDate] = useState(toDateInputValue(new Date()));
  const [touched, setTouched] = useState(false);

  useEffect(() => { if (open) { setDescription(''); setCategory('Aluguel'); setAmount(''); setFrequency('mensal'); setStartDate(toDateInputValue(new Date())); setTouched(false); } }, [open]);

  const valid = description.trim() && Number(amount) > 0 && startDate;
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const dueDay = Math.min(Math.max(parseDateInput(startDate).getDate(), 1), 28);
    onSave({ id: uid('rp'), orgId: currentOrgId(), description: description.trim(), category: category.trim() || undefined, amount: Number(amount), frequency, dueDay, startDate, active: true, createdAt: new Date().toISOString() });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Nova conta recorrente" subtitle="Gera lançamentos a pagar automaticamente"
      footer={<div className="flex items-center justify-between gap-2"><span className="text-xs text-danger">{touched && !valid ? 'Preencha descrição, valor e primeiro vencimento.' : ''}</span><div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!valid}>Cadastrar</Button></div></div>}>
      <div className="space-y-4">
        <Field label="Descrição" required><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel da sede" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Categoria"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{['Aluguel', 'Salários', 'Água', 'Energia', 'Internet', 'Telefonia', 'Contrato', 'Impostos', 'Outros'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Valor (R$)" required><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Frequência"><Select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceFreq)}>{PAYABLE_FREQ.map((f) => <option key={f.value} value={f.value}>{RECURRENCE_FREQ_LABEL[f.value]}</option>)}</Select></Field>
          <Field label="Primeiro vencimento" required hint="Dia, mês e ano — define quando a recorrência começa">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} />
          </Field>
        </div>
      </div>
    </Drawer>
  );
}

function FinanceForm({ open, defaultType, onClose, onSave }: { open: boolean; defaultType: FinanceEntryType; onClose: () => void; onSave: (e: FinanceEntry) => void }) {
  const [type, setType] = useState<FinanceEntryType>(defaultType);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('');
  const [status, setStatus] = useState<FinanceEntryStatus>('pendente');
  const [dueDate, setDueDate] = useState('');
  const [taxKind, setTaxKind] = useState<TaxKind | ''>('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) { setType(defaultType); setDescription(''); setAmount(''); setDiscount(''); setStatus('pendente'); setDueDate(''); setTaxKind(''); setTouched(false); }
  }, [open, defaultType]);

  const valid = description.trim() && Number(amount) > 0;
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onSave({
      id: uid('fe'), orgId: currentOrgId(), type, status,
      description: description.trim(), amount: Number(amount),
      discount: discount ? Number(discount) : undefined,
      dueDate: dueDate || undefined,
      paidAt: status === 'pago' ? (dueDate || toDateInputValue(new Date())) : undefined,
      approvalStatus: type === 'despesa' ? 'pendente' : undefined,
      taxKind: type === 'despesa' && taxKind ? taxKind : undefined,
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
          <Field label="Desconto vinculado (R$)"><Input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00" /></Field>
          <Field label="Vencimento"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as FinanceEntryStatus)}>
              {(['pendente', 'pago', 'atrasado', 'cancelado'] as FinanceEntryStatus[]).map((s) => <option key={s} value={s}>{statusMeta[s].label}</option>)}
            </Select>
          </Field>
          {type === 'despesa' && (
            <Field label="Tributo (opcional)" className="col-span-2">
              <Select value={taxKind} onChange={(e) => setTaxKind(e.target.value as TaxKind | '')}>
                <option value="">Não é tributo</option>
                {(Object.keys(TAX_KIND_LABEL) as TaxKind[]).map((k) => <option key={k} value={k}>{TAX_KIND_LABEL[k]}</option>)}
              </Select>
            </Field>
          )}
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

// ── Bancos ──────────────────────────────────────────────────────────────────

/** Contas bancárias — saldo, extrato eletrônico, depósitos, transferências e conciliação. */
function BancosTab() {
  const accounts = useBankAccountsStore((s) => s.items);
  const addAccount = useBankAccountsStore((s) => s.add);
  const transactions = useBankTransactionsStore((s) => s.transactions);
  const [formOpen, setFormOpen] = useState(false);
  const [statementAccount, setStatementAccount] = useState<BankAccount | null>(null);
  const [depositAccount, setDepositAccount] = useState<BankAccount | null>(null);
  const [transferAccount, setTransferAccount] = useState<BankAccount | null>(null);

  const totalSaldo = accounts.reduce((s, a) => s + accountBalance(a.id, a.openingBalance), 0);
  const naoConciliados = transactions.filter((t) => !t.reconciled).length;

  return (
    <div>
      <Stagger className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Saldo total em bancos" value={totalSaldo} icon="Landmark" tone="brand" format={formatCompactCurrency} />
        <StatCard label="Contas ativas" value={accounts.filter((a) => a.isActive).length} icon="Building2" tone="info" />
        <StatCard label="Movimentações não conciliadas" value={naoConciliados} icon="ArrowLeftRight" tone={naoConciliados > 0 ? 'warning' : 'success'} />
      </Stagger>

      <div className="mb-3 flex justify-end">
        <Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Nova conta bancária</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => {
          const saldo = accountBalance(a.id, a.openingBalance);
          return (
            <Card key={a.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand"><Landmark size={22} /></div>
                <Badge tone={a.isActive ? 'success' : 'neutral'} dot>{a.isActive ? 'Ativa' : 'Inativa'}</Badge>
              </div>
              <p className="mt-3 text-lg font-bold tracking-tight text-foreground">{a.alias ?? a.bank}</p>
              <p className="text-sm text-muted-foreground">{a.bank}{a.agency ? ` · ag. ${a.agency}` : ''} · cc {a.account}</p>
              <p className="mt-3 text-2xl font-bold text-foreground">{formatCurrency(saldo)}</p>
              <div className="mt-4 grid grid-cols-3 gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setDepositAccount(a)}>Depositar</Button>
                <Button size="sm" variant="outline" onClick={() => setTransferAccount(a)}>Transferir</Button>
                <Button size="sm" variant="outline" onClick={() => setStatementAccount(a)}>Extrato</Button>
              </div>
            </Card>
          );
        })}
        {accounts.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conta bancária cadastrada.</p>}
      </div>

      <BankAccountForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(a) => { addAccount(a); setFormOpen(false); toast('Conta bancária cadastrada.', { tone: 'success' }); }} />
      <DepositDialog account={depositAccount} onClose={() => setDepositAccount(null)} />
      <TransferDialog account={transferAccount} accounts={accounts} onClose={() => setTransferAccount(null)} />
      <StatementDrawer account={statementAccount} onClose={() => setStatementAccount(null)} />
    </div>
  );
}

function BankAccountForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (a: BankAccount) => void }) {
  const [bank, setBank] = useState('');
  const [agency, setAgency] = useState('');
  const [account, setAccount] = useState('');
  const [alias, setAlias] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => { if (open) { setBank(''); setAgency(''); setAccount(''); setAlias(''); setOpeningBalance(''); setTouched(false); } }, [open]);

  const valid = bank.trim() && account.trim();
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onSave({ id: uid('bank'), orgId: currentOrgId(), bank: bank.trim(), agency: agency.trim() || undefined, account: account.trim(), alias: alias.trim() || undefined, openingBalance: Number(openingBalance) || 0, isActive: true });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Nova conta bancária" subtitle="Saldo por banco e contas"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!valid}>Cadastrar</Button></div>}>
      <div className="space-y-4">
        <Field label="Banco" required><Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Ex.: Banco do Brasil" />{touched && !bank.trim() && <span className="mt-1 block text-xs text-danger">Informe o banco.</span>}</Field>
        <Field label="Apelido"><Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Ex.: Conta principal" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Agência"><Input value={agency} onChange={(e) => setAgency(e.target.value)} /></Field>
          <Field label="Conta" required><Input value={account} onChange={(e) => setAccount(e.target.value)} />{touched && !account.trim() && <span className="mt-1 block text-xs text-danger">Informe a conta.</span>}</Field>
        </div>
        <Field label="Saldo inicial (R$)"><Input type="number" min={0} step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}

function DepositDialog({ account, onClose }: { account: BankAccount | null; onClose: () => void }) {
  const addTransaction = useBankTransactionsStore((s) => s.add);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => { if (account) { setAmount(''); setDescription(''); } }, [account]);
  if (!account) return null;

  const submit = () => {
    const v = Number(amount);
    if (!(v > 0)) return;
    addTransaction({ accountId: account.id, type: 'deposito', amount: v, date: toDateInputValue(new Date()), description: description.trim() || 'Depósito' });
    toast(`Depósito de ${formatCurrency(v)} registrado em ${account.alias ?? account.bank}.`, { tone: 'success' });
    onClose();
  };

  return (
    <Drawer open={!!account} onClose={onClose} title="Registrar depósito" subtitle={account.alias ?? account.bank}
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!(Number(amount) > 0)}>Depositar</Button></div>}>
      <div className="space-y-4">
        <Field label="Valor (R$)" required><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Descrição"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Depósito em espécie" /></Field>
      </div>
    </Drawer>
  );
}

function TransferDialog({ account, accounts, onClose }: { account: BankAccount | null; accounts: BankAccount[]; onClose: () => void }) {
  const addTransaction = useBankTransactionsStore((s) => s.add);
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const others = accounts.filter((a) => a.id !== account?.id);
  useEffect(() => { if (account) { setToId(others[0]?.id ?? ''); setAmount(''); } }, [account]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!account) return null;

  const submit = () => {
    const v = Number(amount);
    const dest = accounts.find((a) => a.id === toId);
    if (!(v > 0) || !dest) return;
    const pairId = uid('xfer');
    const date = toDateInputValue(new Date());
    addTransaction({ accountId: account.id, type: 'transferencia_saida', amount: v, date, description: `Transferência para ${dest.alias ?? dest.bank}`, transferPairId: pairId });
    addTransaction({ accountId: dest.id, type: 'transferencia_entrada', amount: v, date, description: `Transferência de ${account.alias ?? account.bank}`, transferPairId: pairId });
    toast(`Transferência de ${formatCurrency(v)} realizada.`, { tone: 'success' });
    onClose();
  };

  return (
    <Drawer open={!!account} onClose={onClose} title="Transferência bancária" subtitle={`De ${account.alias ?? account.bank}`}
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<ArrowLeftRight size={15} />} disabled={!(Number(amount) > 0) || !toId}>Transferir</Button></div>}>
      <div className="space-y-4">
        <Field label="Conta destino" required>
          <Select value={toId} onChange={(e) => setToId(e.target.value)}>
            {others.length === 0 && <option value="">Cadastre outra conta</option>}
            {others.map((a) => <option key={a.id} value={a.id}>{a.alias ?? a.bank}</option>)}
          </Select>
        </Field>
        <Field label="Valor (R$)" required><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}

function StatementDrawer({ account, onClose }: { account: BankAccount | null; onClose: () => void }) {
  const transactions = useBankTransactionsStore((s) => s.transactions);
  const toggleReconciled = useBankTransactionsStore((s) => s.toggleReconciled);
  if (!account) return null;
  const list = transactions.filter((t) => t.accountId === account.id).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Drawer open={!!account} onClose={onClose} title="Extrato eletrônico" subtitle={account.alias ?? account.bank}>
      <div className="space-y-2">
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma movimentação.</p>}
        {list.map((t) => {
          const sign = TRANSACTION_SIGN[t.type];
          return (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{t.description ?? t.type}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(t.date)}</p>
              </div>
              <span className={`text-sm font-semibold ${sign > 0 ? 'text-success' : 'text-danger'}`}>{sign > 0 ? '+' : '-'}{formatCurrency(t.amount)}</span>
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={t.reconciled} onChange={() => toggleReconciled(t.id)} className="h-3.5 w-3.5 rounded border-border" />
                conciliado
              </label>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}

// ── Cheques ─────────────────────────────────────────────────────────────────

const CHECK_STATUS_META: Record<CheckEntity['status'], { label: string; tone: any }> = {
  emitido: { label: 'Emitido', tone: 'warning' },
  compensado: { label: 'Compensado', tone: 'success' },
  devolvido: { label: 'Devolvido', tone: 'danger' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
};

function ChequesTab() {
  const { items, add, update } = useChecksStore();
  const [formOpen, setFormOpen] = useState(false);

  const columns: Column<CheckEntity>[] = [
    { key: 'number', header: 'Número', render: (c) => <span className="font-medium text-foreground">{c.number}</span> },
    { key: 'bank', header: 'Banco', render: (c) => c.bank },
    { key: 'payee', header: 'Beneficiário', render: (c) => c.payee ?? '—' },
    { key: 'issue', header: 'Emissão', render: (c) => fmtDate(c.issueDate) },
    { key: 'amount', header: 'Valor', align: 'right', render: (c) => <span className="font-semibold text-foreground">{formatCurrency(c.amount)}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (c) => <Badge tone={CHECK_STATUS_META[c.status].tone} dot>{CHECK_STATUS_META[c.status].label}</Badge> },
    { key: 'acoes', header: 'Ações', align: 'right', render: (c) => c.status === 'emitido' ? (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="outline" onClick={() => update(c.id, { status: 'compensado' })}>Compensar</Button>
        <Button size="sm" variant="outline" className="text-danger" onClick={() => update(c.id, { status: 'devolvido' })}>Devolver</Button>
      </div>
    ) : null },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} cheque(s) registrados</p>
        <Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Emitir cheque</Button>
      </div>
      <Table columns={columns} rows={items} keyField={(c) => c.id} />
      {items.length === 0 && <p className="mt-4 text-center text-sm text-muted-foreground">Nenhum cheque emitido ainda.</p>}
      <CheckForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(c) => { add(c); setFormOpen(false); toast('Cheque emitido.', { tone: 'success' }); }} />
    </div>
  );
}

function CheckForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (c: CheckEntity) => void }) {
  const [number, setNumber] = useState('');
  const [bank, setBank] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState(toDateInputValue(new Date()));
  const [touched, setTouched] = useState(false);

  useEffect(() => { if (open) { setNumber(''); setBank(''); setPayee(''); setAmount(''); setIssueDate(toDateInputValue(new Date())); setTouched(false); } }, [open]);

  const valid = number.trim() && bank.trim() && Number(amount) > 0;
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onSave({ id: uid('chk'), orgId: currentOrgId(), number: number.trim(), bank: bank.trim(), payee: payee.trim() || undefined, amount: Number(amount), issueDate, status: 'emitido' });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Emitir cheque" subtitle="Controle de compensação"
      footer={<div className="flex items-center justify-between gap-2"><span className="text-xs text-danger">{touched && !valid ? 'Preencha número, banco e valor.' : ''}</span><div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Banknote size={15} />} disabled={!valid}>Emitir</Button></div></div>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Número" required><Input value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
        <Field label="Banco" required><Input value={bank} onChange={(e) => setBank(e.target.value)} /></Field>
        <Field label="Beneficiário" className="col-span-2"><Input value={payee} onChange={(e) => setPayee(e.target.value)} /></Field>
        <Field label="Valor (R$)" required><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Data de emissão"><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
      </div>
    </Drawer>
  );
}

// ── Empréstimos e aplicações ─────────────────────────────────────────────────

function EmprestimosTab() {
  const { items, add, update } = useLoansStore();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} registro(s) — saldo real x teórico</p>
        <Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Novo empréstimo/aplicação</Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((l) => {
          const diff = l.realBalance - l.theoreticalBalance;
          return (
            <Card key={l.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand"><PiggyBank size={22} /></div>
                <Badge tone={l.kind === 'emprestimo' ? 'danger' : 'success'}>{l.kind === 'emprestimo' ? 'Empréstimo' : 'Aplicação'}</Badge>
              </div>
              <p className="mt-3 text-lg font-bold text-foreground">{l.description}</p>
              <p className="text-xs text-muted-foreground">Principal {formatCurrency(l.principal)}{l.rate ? ` · ${l.rate}% a.m.` : ''} · desde {fmtDate(l.startDate)}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-muted/40 p-2"><p className="text-[11px] text-muted-foreground">Saldo teórico</p><p className="font-semibold text-foreground">{formatCurrency(l.theoreticalBalance)}</p></div>
                <div className="rounded-lg bg-muted/40 p-2"><p className="text-[11px] text-muted-foreground">Saldo real</p><p className="font-semibold text-foreground">{formatCurrency(l.realBalance)}</p></div>
              </div>
              {diff !== 0 && <p className={`mt-1.5 text-xs ${diff > 0 ? 'text-success' : 'text-danger'}`}>{diff > 0 ? 'Real acima do teórico' : 'Real abaixo do teórico'} em {formatCurrency(Math.abs(diff))}</p>}
              <div className="mt-3 flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => { const v = Number(prompt(l.kind === 'emprestimo' ? 'Valor pago (reduz o saldo real):' : 'Valor de resgate (reduz o saldo real):') || 0); if (v > 0) update(l.id, { realBalance: Math.max(0, l.realBalance - v) }); }}>{l.kind === 'emprestimo' ? 'Registrar pagamento' : 'Registrar resgate'}</Button>
                <Button size="sm" variant="outline" onClick={() => { const v = Number(prompt(l.kind === 'emprestimo' ? 'Valor de novo saque (aumenta o saldo real):' : 'Valor de novo aporte (aumenta o saldo real):') || 0); if (v > 0) update(l.id, { realBalance: l.realBalance + v }); }}>{l.kind === 'emprestimo' ? 'Novo saque' : 'Novo aporte'}</Button>
                <Button size="sm" variant="ghost" onClick={() => update(l.id, { active: !l.active })}>{l.active ? 'Encerrar' : 'Reativar'}</Button>
              </div>
            </Card>
          );
        })}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum empréstimo ou aplicação cadastrado.</p>}
      </div>
      <LoanForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(l) => { add(l); setFormOpen(false); toast('Registro cadastrado.', { tone: 'success' }); }} />
    </div>
  );
}

function LoanForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (l: LoanInvestment) => void }) {
  const [kind, setKind] = useState<LoanInvestment['kind']>('emprestimo');
  const [description, setDescription] = useState('');
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [startDate, setStartDate] = useState(toDateInputValue(new Date()));
  const [dueDate, setDueDate] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => { if (open) { setKind('emprestimo'); setDescription(''); setPrincipal(''); setRate(''); setStartDate(toDateInputValue(new Date())); setDueDate(''); setTouched(false); } }, [open]);

  const valid = description.trim() && Number(principal) > 0;
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const p = Number(principal);
    onSave({ id: uid('loan'), orgId: currentOrgId(), kind, description: description.trim(), principal: p, rate: rate ? Number(rate) : undefined, startDate, dueDate: dueDate || undefined, theoreticalBalance: p, realBalance: p, active: true });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Novo empréstimo/aplicação" subtitle="Controle de saldo real, histórico e teórico"
      footer={<div className="flex items-center justify-between gap-2"><span className="text-xs text-danger">{touched && !valid ? 'Preencha descrição e principal.' : ''}</span><div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!valid}>Cadastrar</Button></div></div>}>
      <div className="space-y-4">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'emprestimo', label: 'Empréstimo' }, { value: 'aplicacao', label: 'Aplicação' }]} />
        <Field label="Descrição" required><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Capital de giro · Banco X" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Valor principal (R$)" required><Input type="number" min={0} step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></Field>
          <Field label="Taxa (% a.m.)"><Input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
          <Field label="Data de início"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
          <Field label="Vencimento"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
        </div>
      </div>
    </Drawer>
  );
}

// ── Fechamento de caixa ───────────────────────────────────────────────────────

function FechamentoTab() {
  const entries = useFinanceStore((s) => s.items);
  const { closings, close } = useCashClosingStore();
  const today = toDateInputValue(new Date());
  const alreadyClosed = closings.some((c) => c.date === today);

  const totalIn = entries.filter((e) => e.type === 'receita' && e.status === 'pago' && e.paidAt === today).reduce((s, e) => s + netAmount(e), 0);
  const totalOut = entries.filter((e) => e.type === 'despesa' && e.status === 'pago' && e.paidAt === today).reduce((s, e) => s + netAmount(e), 0);
  const balance = totalIn - totalOut;

  const doClose = () => {
    close({ date: today, totalIn, totalOut, balance });
    toast('Caixa do dia fechado.', { tone: 'success' });
  };

  return (
    <div>
      <Stagger className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Entradas de hoje" value={totalIn} icon="TrendingUp" tone="success" format={formatCompactCurrency} />
        <StatCard label="Saídas de hoje" value={totalOut} icon="TrendingDown" tone="danger" format={formatCompactCurrency} />
        <StatCard label="Saldo do dia" value={balance} icon="Wallet" tone="brand" format={formatCompactCurrency} />
      </Stagger>

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Fechamento de {fmtDate(today)}</p>
            <p className="text-xs text-muted-foreground">{alreadyClosed ? 'Caixa já fechado hoje.' : 'Confirma o resumo do dia e trava o fechamento.'}</p>
          </div>
          <Button leftIcon={<Lock size={16} />} onClick={doClose} disabled={alreadyClosed}>{alreadyClosed ? 'Já fechado' : 'Fechar caixa de hoje'}</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Histórico de fechamentos" />
        <CardBody className="space-y-2">
          {closings.length === 0 && <p className="text-sm text-muted-foreground">Nenhum fechamento registrado ainda.</p>}
          {closings.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
              <span className="font-medium text-foreground">{fmtDate(c.date)}</span>
              <span className="text-success">+{formatCurrency(c.totalIn)}</span>
              <span className="text-danger">-{formatCurrency(c.totalOut)}</span>
              <span className="font-semibold text-foreground">{formatCurrency(c.balance)}</span>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
