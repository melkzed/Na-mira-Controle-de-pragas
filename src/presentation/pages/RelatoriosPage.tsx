import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, FileText, Search, X } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { DateInput, Input, Select } from '../components/ui/Field';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer, getServiceType, getUser } from '@/application/repository';
import { useServiceOrdersStore } from '@/store/serviceOrdersStore';
import { useProductsStore, useUsersStore } from '@/store/entityStores';
import { useCustomersStore } from '@/store/customersStore';
import { downloadCsv, downloadXls } from '@/lib/export';
import { printDataReport } from '@/lib/printReports';
import type { DocumentOutput } from '@/lib/printDocuments';
import { DocumentActions } from '@/presentation/components/DocumentActions';
import { fmtDate, toDateInputValue } from '@/lib/date';
import { sortByName } from '@/lib/utils';
import { SERVICE_ORDER_STATUS_META, type ServiceOrderStatus } from '@/domain/enums';
import { REPORTS, REPORT_GROUPS, buildReport, reportsOfGroup, type ReportFilters } from '@/application/reports';

/** Os filtros e os construtores de relatório vivem em `application/reports.ts`.
 *  Esta tela só monta a barra de filtros e os cards. */
type Filters = ReportFilters;

const defaultFilters = (): Filters => ({
  search: '', customerId: '', technicianId: '', serviceTypeId: '', status: '',
  startDate: toDateInputValue(new Date(new Date().getFullYear(), 0, 1)),
  endDate: toDateInputValue(new Date()),
});

const fileName = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');

/** Atalhos que só preenchem período inicial/final — não substituem a escolha
 *  livre de datas, apenas evitam digitar um intervalo comum manualmente. */
const QUICK_RANGES: { label: string; days: number }[] = [
  { label: '7 dias', days: 7 },
  { label: '15 dias', days: 15 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
];

/** Datas que um atalho de período produziria hoje — usado tanto para aplicar
 *  quanto para saber se ele já está aplicado (e então desmarcar). */
function quickRangeDates(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 864e5);
  return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
}

export function RelatoriosPage() {
  const customers = useCustomersStore((s) => s.customers);
  const technicians = useUsersStore((s) => sortByName(s.items.filter((u) => u.role === 'tecnico')));
  useServiceOrdersStore((s) => s.orders); // reatividade das contagens
  useProductsStore((s) => s.items);

  const [f, setF] = useState<Filters>(defaultFilters);
  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));
  const def = useMemo(defaultFilters, []);
  const hasFilter = !!(f.search || f.customerId || f.technicianId || f.serviceTypeId || f.status) || f.startDate !== def.startDate || f.endDate !== def.endDate;

  // Período exibido de forma legível — respeita exatamente as datas escolhidas.
  const rangeLabel = `${f.startDate ? fmtDate(f.startDate) : '…'} até ${f.endDate ? fmtDate(f.endDate) : '…'}`;
  /** Qual atalho está aplicado agora, se algum — comparando as datas do
   *  filtro com o que cada atalho produziria hoje. */
  const activeQuickRange = QUICK_RANGES.find((qr) => {
    const r = quickRangeDates(qr.days);
    return f.startDate === r.startDate && f.endDate === r.endDate;
  })?.days;

  /** Um clique marca o período; outro clique no mesmo desmarca e devolve o
   *  intervalo padrão (do início do ano até hoje). */
  const toggleQuickRange = (days: number) => {
    if (activeQuickRange === days) {
      set({ startDate: def.startDate, endDate: def.endDate });
      return;
    }
    set(quickRangeDates(days));
  };

  /** Quantas linhas cada relatório devolve com os filtros atuais. Calculado
   *  uma vez por mudança de filtro — antes cada card reconstruía o próprio
   *  relatório a cada render. */
  const counts = useMemo(() => {
    const mapa: Record<string, number> = {};
    REPORTS.forEach((r) => { mapa[r.name] = r.build(f).rows.length; });
    return mapa;
  }, [f]);

  const subtitleFor = (name: string) => {
    const parts = [rangeLabel];
    if (f.customerId) parts.push(getCustomer(f.customerId)?.name ?? '');
    if (f.technicianId) parts.push(getUser(f.technicianId)?.name ?? '');
    if (f.serviceTypeId) parts.push(getServiceType(f.serviceTypeId)?.name ?? '');
    if (f.status) parts.push(SERVICE_ORDER_STATUS_META[f.status as ServiceOrderStatus]?.label ?? f.status);
    if (f.search) parts.push(`"${f.search}"`);
    return `${name} · ${parts.filter(Boolean).join(' · ')}`;
  };

  const exportPdf = (name: string, output: DocumentOutput = 'imprimir') => { const { columns, rows, summary } = buildReport(name, f); printDataReport(name, subtitleFor(name), columns, rows, summary, output); };
  const exportXls = (name: string) => { const { columns, rows } = buildReport(name, f); downloadXls(fileName(name), rows, columns, `${name} — ${rangeLabel}`); };
  const exportCsv = (name: string) => { const { columns, rows } = buildReport(name, f); downloadCsv(fileName(name), rows, columns); };

  return (
    <div>
      <PageHeader title="Relatórios" description="Filtre, pesquise e exporte exatamente o que precisa" />

      {/* Barra de filtros e pesquisa — aplica-se à exportação e às contagens.
       *  Período inicial/final são livres (qualquer intervalo); os demais
       *  filtros são opcionais e não exigem seleção para restringir só por data. */}
      <Card className="mb-6">
        <CardBody className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Período inicial</label>
              <DateInput type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} aria-label="Período inicial" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Período final</label>
              <DateInput type="date" value={f.endDate} min={f.startDate || undefined} onChange={(e) => set({ endDate: e.target.value })} aria-label="Período final" />
            </div>
            <div className="flex items-end gap-1.5">
              {QUICK_RANGES.map((qr) => {
                const ativo = activeQuickRange === qr.days;
                return (
                  <Button
                    key={qr.label}
                    type="button"
                    variant={ativo ? 'primary' : 'outline'}
                    size="sm"
                    aria-pressed={ativo}
                    title={ativo ? `Clique para desmarcar ${qr.label}` : `Últimos ${qr.label}`}
                    onClick={() => toggleQuickRange(qr.days)}
                  >
                    {qr.label}
                  </Button>
                );
              })}
            </div>
            {/* O `relative` precisa envolver só o campo: no contêiner
                `items-end` (mais alto que o input) o `top-1/2` centralizava a
                lupa na altura da linha inteira, não na do campo. */}
            <div className="flex items-end">
              <div className="relative w-full">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={f.search} onChange={(e) => set({ search: e.target.value })} placeholder="Pesquisar…" className="pl-9" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select value={f.customerId} onChange={(e) => set({ customerId: e.target.value })} aria-label="Filtrar por cliente">
              <option value="">Todos os clientes</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={f.technicianId} onChange={(e) => set({ technicianId: e.target.value })} aria-label="Filtrar por técnico">
              <option value="">Todos os técnicos</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Select value={f.serviceTypeId} onChange={(e) => set({ serviceTypeId: e.target.value })} aria-label="Filtrar por serviço">
              <option value="">Todos os serviços</option>
              {seed.serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Filtrar por status">
              <option value="">Todos os status</option>
              {(Object.keys(SERVICE_ORDER_STATUS_META) as ServiceOrderStatus[]).map((s) => <option key={s} value={s}>{SERVICE_ORDER_STATUS_META[s].label}</option>)}
            </Select>
            {hasFilter && (
              <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={() => setF(defaultFilters())}>Limpar filtros</Button>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="space-y-6">
        {REPORT_GROUPS.map((group) => {
          const doGrupo = reportsOfGroup(group);
          return (
            <div key={group}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">{group}</h2>
                <span className="text-xs text-muted-foreground">{doGrupo.length} relatório(s)</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {doGrupo.map((r, i) => {
                  const total = counts[r.name] ?? 0;
                  return (
                    <motion.div key={r.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                      <Card hover className="flex h-full flex-col p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                            <Icon name={r.icon} size={19} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{r.name}</p>
                            {/* A pergunta que o relatório responde: com 22 cards,
                                o nome sozinho não distingue um do outro. */}
                            <p className="mt-0.5 text-xs text-muted-foreground">{r.question}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {rangeLabel} · <span className={total ? 'font-semibold text-foreground' : ''}>{total} registro(s)</span>
                        </p>
                        <div className="mt-3 flex items-center gap-1.5 pt-1">
                          <DocumentActions label="PDF" icon={<FileText size={13} />} onGenerate={(o) => exportPdf(r.name, o)} />
                          <Button variant="outline" size="sm" leftIcon={<FileSpreadsheet size={13} />} onClick={() => exportXls(r.name)}>Excel</Button>
                          <Button variant="ghost" size="sm" leftIcon={<Download size={13} />} onClick={() => exportCsv(r.name)}>CSV</Button>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
