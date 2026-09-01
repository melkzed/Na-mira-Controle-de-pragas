import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Download, MapPin, Pencil, Plus, Trash2, TriangleAlert, X, Zap } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Avatar } from '../components/ui/Avatar';
import { DateInput, Field, Input, Select, Textarea } from '../components/ui/Field';
import { Segmented } from '../components/ui/Segmented';
import { Table, type Column } from '../components/ui/Table';
import { ServiceOrderStatusBadge } from '../components/StatusBadge';
import { appointmentsForCustomer, getCustomer, getPest, getProduct, getServiceType, getUser, lastOrderForCustomer } from '@/application/repository';
import type { Pest, PaymentStatus, RecurrencePhase, ServiceOrder, ServiceType } from '@/domain/types';
import type { AppointmentStatus, RecurrenceFreq, ServiceOrderStatus, WarrantyType, WarrantyUnit } from '@/domain/enums';
import { PAYMENT_METHODS, RECURRENCE_FREQ_DAYS, RECURRENCE_FREQ_LABEL, WARRANTY_TYPE_LABEL } from '@/domain/enums';
import {
  computeRecurrenceOccurrences, DURACOES_RECORRENCIA, isWeekend, occurrencesForDuration, planDates,
  recurrenceSummaryLabel, rotuloDuracao, totalOccurrences, weekdayLabel, withinNextYear,
} from '@/lib/recurrence';
import { isDueForConfirmation } from '@/lib/confirmation';
import { combineDateTimeInputToIso, dateInputToIso, fmtDate, fmtTime, parseDateInput, toDateInputValue } from '@/lib/date';
import { osStatusToAppointmentStatus } from '@/lib/misc';
import { downloadCsv } from '@/lib/export';
import { printServiceOrder } from '@/lib/printOrder';
import { printCertificate, printLaudo, certificateValidityText, address } from '@/lib/printDocuments';
import { currentBatch } from '@/lib/batches';
import { useInvoicesStore } from '@/store/invoicesStore';
import { useServiceOrdersStore, type ServiceOrderInput } from '@/store/serviceOrdersStore';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useCustomersStore } from '@/store/customersStore';
import { usePestsStore, useAreasStore, useEquipmentStore, useFinanceStore, useServiceTypesStore, useUsersStore, useLicensesStore, useProductsStore } from '@/store/entityStores';
import { logChange, useAuditStore, type AuditEntry } from '@/store/auditStore';
import { toast } from '@/store/toastStore';
import { QuickAddChip } from '../components/QuickAddChip';
import { Combobox, MultiCombobox } from '../components/ui/Combobox';
import { useSettingsStore } from '@/store/settingsStore';
import { computeTaxes } from '@/application/fiscal/tax';
import { providerLabel } from '@/application/fiscal/providers';
import { cn, formatCurrency } from '@/lib/utils';
import { formatAddress, googleMapsAddressUrl } from '@/lib/geo';
import { signerDocumentLabel } from '@/lib/signer';
import { canSeeFinancialValues } from '@/application/permissions';
import { useAppStore } from '@/store/appStore';
import { downloadNfseXml, printNfse } from '@/lib/printInvoice';
import { Award, FileCode, FileText, Receipt } from 'lucide-react';
import { uid } from '@/store/createEntityStore';
import { currentOrgId } from '@/store/appStore';

const OS_STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  rascunho: 'Rascunho', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada',
};
const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pendente: 'Pendente', pago: 'Pago', vencido: 'Vencido', cancelado: 'Cancelado',
};

/** Handle imperativo do formulário de OS — permite que um footer externo
 *  (fora do componente do formulário) dispare o envio. */
interface OsFormHandle { submit: () => void }

/** Chip de seleção rápida (toggle) — otimizado para OS rápida em campo. */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-2.5 py-1 text-xs transition ${active ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted'}`}>{children}</button>
  );
}

/** Rascunho da OS em criação — some assim que a OS é confirmada. */
const OS_DRAFT_KEY = 'namira-os-draft';

type OsDraft = Record<string, unknown>;

function loadOsDraft(): OsDraft | null {
  try {
    const raw = localStorage.getItem(OS_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as OsDraft) : null;
  } catch {
    return null;
  }
}

function clearOsDraft() {
  try { localStorage.removeItem(OS_DRAFT_KEY); } catch { /* ignora */ }
}

export function OrdensPage() {
  const orders = useServiceOrdersStore((s) => s.orders);
  // Um usuário pode ter a OS liberada e ainda assim não poder ver quanto foi
  // cobrado (Configurações → Departamento → "Ocultar valores em dinheiro").
  const verValores = canSeeFinancialValues(useAppStore((s) => s.currentUser));
  const auditEntries = useAuditStore((s) => s.entries);
  const [selected, setSelected] = useState<ServiceOrder | null>(null);
  // Edição acontece dentro do próprio painel de detalhe (mesma janela, sem
  // abrir outro Drawer por cima) — "editMode" só alterna o conteúdo exibido.
  const [editMode, setEditMode] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const removeOs = useServiceOrdersStore((s) => s.remove);
  const editFormRef = useRef<OsFormHandle>(null);
  const createFormRef = useRef<OsFormHandle>(null);
  const [saving, setSaving] = useState(false);
  const [params, setParams] = useSearchParams();
  const pendingConfirmations = useAppointmentsStore((s) => s.appointments.filter((a) => a.status === 'agendado').length);

  // Ao editar uma OS já selecionada, mantém o painel de detalhe sincronizado
  // com a versão mais recente após salvar.
  useEffect(() => {
    if (selected) setSelected(orders.find((o) => o.id === selected.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // Abre a OS diretamente quando chega por link externo (?id=...), ex.: duplo
  // clique no histórico de atendimentos do cliente — sem exigir baixar o PDF.
  useEffect(() => {
    const id = params.get('id');
    if (!id) return;
    const so = orders.find((o) => o.id === id);
    if (so) { setSelected(so); setEditMode(false); }
    setParams((p) => { p.delete('id'); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const exportCsv = () => {
    downloadCsv('ordens-de-servico', orders, [
      { header: 'OS', value: (so) => so.number },
      { header: 'Cliente', value: (so) => getCustomer(so.customerId)?.name ?? '' },
      { header: 'Serviço', value: (so) => getServiceType(so.serviceTypeId)?.name ?? '' },
      { header: 'Técnico', value: (so) => getUser(so.technicianId)?.name ?? '' },
      { header: 'Status', value: (so) => so.status },
      { header: 'Duração (min)', value: (so) => so.totalMinutes ?? '' },
      { header: 'Data do serviço', value: (so) => fmtDate(so.executionDate ?? so.startedAt ?? so.createdAt) },
      { header: 'Horário', value: (so) => so.executionTime ?? (so.startedAt ? fmtTime(so.startedAt) : '') },
      { header: 'Criada em', value: (so) => fmtDate(so.createdAt) },
    ]);
  };

  const excluirOs = async (so: ServiceOrder) => {
    setDeleting(true);
    try {
      await removeOs(so.id);
      logChange('exclusão', 'ordem de serviço', `OS #${so.number} excluída · ${getCustomer(so.customerId)?.name ?? ''}`, so.id);
      toast(`OS #${so.number} excluída.`, { tone: 'success' });
      setSelected(null);
      setConfirmDelete(false);
    } catch {
      // A store já explicou o motivo no toast (ex.: lançamento vinculado);
      // aqui só desarma a confirmação para a pessoa poder sair da tela.
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<ServiceOrder>[] = [
    { key: 'num', header: 'OS', render: (so) => <span className="font-semibold">#{so.number}</span> },
    { key: 'cust', header: 'Cliente', render: (so) => getCustomer(so.customerId)?.name },
    { key: 'svc', header: 'Serviço', render: (so) => <Badge tone="neutral">{getServiceType(so.serviceTypeId)?.name}</Badge> },
    { key: 'tech', header: 'Técnico', render: (so) => {
      const t = getUser(so.technicianId);
      return t ? <div className="flex items-center gap-2"><Avatar name={t.name} size="xs" /><span className="text-muted-foreground">{t.name.split(' ')[0]}</span></div> : '—';
    } },
    // Data e horário do serviço, não a data de criação: uma OS agendada para
    // o mês que vem aparecia com a data de hoje. Cai para o início/criação só
    // quando a OS não tem data de execução definida.
    { key: 'date', header: 'Data e horário', render: (so) => {
      const dia = so.executionDate ?? so.startedAt ?? so.createdAt;
      // O horário informado na OS ganha do relógio de startedAt, que marca
      // quando o técnico apertou o botão.
      const hora = so.executionTime ?? (so.startedAt ? fmtTime(so.startedAt) : undefined);
      return (
        <div className="leading-tight">
          <p className="text-foreground">{fmtDate(dia)}</p>
          <p className="text-xs text-muted-foreground">{hora ?? 'sem horário'}</p>
        </div>
      );
    } },
    { key: 'time', header: 'Duração', align: 'right', render: (so) => so.totalMinutes ? `${so.totalMinutes} min` : '—' },
    { key: 'status', header: 'Status', align: 'right', render: (so) => <ServiceOrderStatusBadge status={so.status} cancelledBy={so.cancelledBy} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Ordens de Serviço"
        description={`${orders.length} ordens registradas`}
        actions={
          <>
            <Button variant="outline" leftIcon={<Download size={16} />} onClick={exportCsv}>Exportar CSV</Button>
            <Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Nova OS</Button>
          </>
        }
      />

      {pendingConfirmations > 0 && (
        <Link
          to="/agenda?confirmar=1"
          className="mb-4 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft/60 px-4 py-2.5 text-sm text-foreground transition hover:brightness-105"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning text-white text-xs font-bold">{pendingConfirmations}</span>
          <span className="flex-1"><b>{pendingConfirmations} visita(s)</b> aguardando confirmação do cliente.</span>
          <span className="text-xs font-medium text-warning">Ver →</span>
        </Link>
      )}

      <Table columns={columns} rows={orders} keyField={(so) => so.id} onRowClick={(so) => { setSelected(so); setEditMode(false); }} />

      {/* Criação de nova OS — mesmo tamanho/centralização do painel de
       *  detalhe da OS, para manter a exibição consistente entre criar e ver/editar. */}
      <Drawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nova Ordem de Serviço"
        subtitle="Preenchimento rápido — serviços, pragas e áreas em toques"
        wide
        footer={<div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>Cancelar</Button><Button disabled={saving} onClick={() => createFormRef.current?.submit()} leftIcon={<Check size={15} />}>{saving ? 'Criando…' : 'Criar OS'}</Button></div>}
      >
        {formOpen && (
          <div className="mx-auto max-w-4xl">
            <OsFormBody ref={createFormRef} initial={null} onSaved={(so) => { setFormOpen(false); setSelected(so); setEditMode(false); }} onSavingChange={setSaving} />
          </div>
        )}
      </Drawer>

      {/* Detalhe da OS — o mesmo painel se transforma em formulário de edição
       *  ao clicar em "Editar", sem abrir outra janela por cima. */}
      <Drawer
        open={!!selected}
        onClose={() => { setSelected(null); setEditMode(false); setConfirmDelete(false); }}
        title={editMode ? `Editar Ordem de Serviço #${selected?.number}` : `Ordem de Serviço #${selected?.number}`}
        subtitle={editMode ? 'Altere os dados necessários — as mudanças ficam registradas no histórico da OS' : (selected ? getCustomer(selected.customerId)?.name : '')}
        wide
        footer={editMode ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={saving} onClick={() => setEditMode(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={() => editFormRef.current?.submit()} leftIcon={<Check size={15} />}>{saving ? 'Salvando…' : 'Salvar alterações'}</Button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" leftIcon={<Pencil size={14} />} onClick={() => setEditMode(true)}>Editar</Button>
              {/* Exclusão em dois passos: o primeiro clique só arma, o segundo
                  confirma. Excluir OS é irreversível e leva junto o histórico
                  do atendimento — não pode sair num clique só. */}
              {confirmDelete ? (
                <>
                  <Button
                    variant="danger" size="sm" disabled={deleting} leftIcon={<Trash2 size={14} />}
                    onClick={() => selected && excluirOs(selected)}
                  >
                    {deleting ? 'Excluindo…' : 'Confirmar exclusão'}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" className="text-danger" leftIcon={<Trash2 size={14} />} onClick={() => setConfirmDelete(true)}>
                  Excluir OS
                </Button>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" leftIcon={<Download size={14} />} onClick={() => selected && printServiceOrder(selected)}>OS (PDF)</Button>
              <Button variant="outline" size="sm" leftIcon={<Award size={14} />} onClick={() => selected && printCertificate(selected)}>Certificado</Button>
              <Button variant="outline" size="sm" leftIcon={<FileText size={14} />} onClick={() => selected && printLaudo(selected)}>Laudo</Button>
            </div>
          </div>
        )}
      >
        {selected && editMode && (
          <div className="mx-auto max-w-4xl">
            <OsFormBody ref={editFormRef} initial={selected} onSaved={(so) => { setSelected(so); setEditMode(false); }} onSavingChange={setSaving} />
          </div>
        )}
        {selected && !editMode && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <ServiceOrderStatusBadge status={selected.status} cancelledBy={selected.cancelledBy} />
                <Badge tone="neutral">{getServiceType(selected.serviceTypeId)?.name}</Badge>
              </div>

              {/* Endereço do cliente com atalho para o mapa — quem atende no
                  escritório precisa localizar o cliente sem sair da OS. */}
              {(() => {
                const cliente = getCustomer(selected.customerId);
                const endereco = cliente ? formatAddress(cliente) : '';
                if (!endereco) return null;
                return (
                  <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border bg-muted/30 p-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <MapPin size={16} className="mt-0.5 shrink-0 text-brand" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{cliente?.name}</p>
                        <p className="text-xs text-muted-foreground">{endereco}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline" size="sm" leftIcon={<MapPin size={14} />}
                      onClick={() => window.open(googleMapsAddressUrl(endereco), '_blank', 'noopener,noreferrer')}
                    >
                      Abrir no mapa
                    </Button>
                  </div>
                );
              })()}

              <Section title="Detalhes">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Info label="Serviços" value={(selected.serviceTypeIds?.length ? selected.serviceTypeIds : [selected.serviceTypeId]).map((id) => getServiceType(id)?.name).filter(Boolean).join(', ') || '—'} />
                  <Info label="Áreas tratadas" value={selected.areaTreated ?? '—'} />
                  <Info label="Garantia" value={selected.warranty?.has ? `${selected.warranty.value ?? ''} ${selected.warranty.unit ?? ''}${selected.warranty.type ? ` · ${WARRANTY_TYPE_LABEL[selected.warranty.type]}` : ''}`.trim() : 'Sem garantia'} />
                  <Info label="Recorrência" value={recurrenceSummaryLabel(selected.recurrence)} />
                  <Info label="Valor do Serviço" value={verValores ? (selected.serviceValue != null ? formatCurrency(selected.serviceValue) : '—') : 'restrito'} />
                  <Info label="Pagamento" value={selected.paymentStatus ? PAYMENT_STATUS_LABEL[selected.paymentStatus] : 'Pendente'} />
                  <Info label="Forma de pagamento" value={selected.paymentMethod ?? '—'} />
                  <Info label="Duração" value={selected.totalMinutes ? `${selected.totalMinutes} min` : 'em aberto'} />
                  <Info label="Técnico(s)" value={(selected.technicianIds?.length ? selected.technicianIds : [selected.technicianId]).map((id) => getUser(id)?.name?.split(' ')[0]).filter(Boolean).join(', ') || '—'} />
                  <Info label="Vendedor" value={selected.sellerId ? getUser(selected.sellerId)?.name ?? '—' : '—'} />
                  {/* Quem assinou pelo cliente — o titular do cadastro raramente
                      é quem acompanhou o serviço, e é este nome que sai no PDF. */}
                  <Info label="Recebido por" value={selected.signerName ?? '—'} />
                  <Info label="Identificação de quem assinou" value={signerDocumentLabel(selected) || '—'} />
                  <Info label="Data do Serviço" value={selected.executionDate ? fmtDate(selected.executionDate) : (selected.startedAt ? fmtDate(selected.startedAt) : '—')} />
                  <Info label="Horário do Serviço" value={selected.executionTime ?? '—'} />
                  <Info label="Vencimento do Pagamento" value={selected.dueDate ? fmtDate(selected.dueDate) : '—'} />
                  <Info label="Validade do Serviço" value={selected.validityDate ? fmtDate(selected.validityDate) : '—'} />
                  <Info label="Validade do Certificado" value={certificateValidityText(selected)} />
                  {selected.associatedOrderId && (
                    <Info label="OS Associada" value={(() => { const a = orders.find((o) => o.id === selected.associatedOrderId); return a ? `#${a.number} · ${getCustomer(a.customerId)?.name ?? ''}` : '—'; })()} />
                  )}
                  {selected.recurrence?.enabled && <Info label="Próxima Visita" value={selected.nextVisitDate ? fmtDate(selected.nextVisitDate) : '—'} />}
                </div>
              </Section>

              {selected.procedures && <Section title="Procedimentos realizados"><p className="text-sm text-foreground">{selected.procedures}</p></Section>}

              {selected.technicianMessage && (
                <div className="rounded-lg border border-brand/30 bg-brand-soft/30 p-2.5 text-xs text-brand">
                  <span className="font-semibold">Mensagem interna para o técnico (não aparece em documentos):</span> {selected.technicianMessage}
                </div>
              )}

              <Section title="Pragas combatidas">
                <div className="flex flex-wrap gap-1.5">
                  {selected.pestIds.map((id) => {
                    const p = getPest(id);
                    const override = selected.pestValidity?.find((pv) => pv.pestId === id)?.validityDate;
                    return <Badge key={id} tone="warning">{p?.name}{override ? ` · val. ${fmtDate(override)}` : ''}</Badge>;
                  })}
                  {selected.pestIds.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
                </div>
              </Section>

              <Section title="Produtos utilizados">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {selected.products.map((p) => {
                    const prod = getProduct(p.productId);
                    const batch = currentBatch(prod);
                    return (
                      <div key={p.productId} className={cn('flex items-start justify-between gap-2 rounded-lg border p-2.5', p.outOfStock ? 'border-warning/50 bg-warning-soft/20' : 'border-border')}>
                        <div className="min-w-0">
                          <span className="text-sm text-foreground">{prod?.name}</span>
                          {(prod?.activeIngredient || prod?.chemicalGroup) && (
                            <p className="text-xs text-muted-foreground">
                              {prod?.activeIngredient && <>Princípio ativo: {prod.activeIngredient}</>}
                              {prod?.activeIngredient && prod?.chemicalGroup && ' · '}
                              {prod?.chemicalGroup && <>Grupo químico: {prod.chemicalGroup}</>}
                            </p>
                          )}
                          {batch && <p className="text-xs text-muted-foreground">Lote {batch.code}{batch.expiresAt ? ` · val. ${fmtDate(batch.expiresAt)}` : ''}</p>}
                          {p.outOfStock && <p className="text-xs text-warning"><TriangleAlert size={11} className="mr-1 inline" />Usado além do estoque do(s) técnico(s)</p>}
                        </div>
                        <Badge tone="brand" className="shrink-0">{p.usedQty} {prod?.unit}</Badge>
                      </div>
                    );
                  })}
                  {selected.products.length === 0 && <span className="text-sm text-muted-foreground">Nenhum produto lançado.</span>}
                </div>
              </Section>

              <OsHistorySection entries={auditEntries.filter((e) => e.entityType === 'ordem de serviço' && e.entityId === selected.id)} />
            </div>

            <div className="space-y-5">
              <FiscalSection so={selected} />
              <div className="rounded-lg border border-danger/20 bg-danger-soft/20 p-2.5 text-xs text-danger">
                <span className="font-semibold">Emergência (CIT):</span> {settingsEmergency()}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

/** Campos do formulário de Ordem de Serviço (criação ou edição) — múltiplos
 *  serviços/pragas/áreas, garantia, recorrência, equipe, datas e sugestão
 *  automática de produtos. Sem Drawer/rodapé próprios: quem o usa decide
 *  onde exibi-lo (painel novo ao criar, ou o próprio painel de detalhe já
 *  aberto, transformado in-place, ao editar) e aciona o envio via `ref`. */
const OsFormBody = forwardRef<OsFormHandle, { initial: ServiceOrder | null; onSaved: (so: ServiceOrder) => void; onSavingChange?: (saving: boolean) => void }>(
  function OsFormBody({ initial, onSaved, onSavingChange }, ref) {
  const add = useServiceOrdersStore((s) => s.add);
  const updateOs = useServiceOrdersStore((s) => s.update);
  const allOrders = useServiceOrdersStore((s) => s.orders);
  const addAppointment = useAppointmentsStore((s) => s.add);
  const updateAppointment = useAppointmentsStore((s) => s.update);
  const removeAppointment = useAppointmentsStore((s) => s.remove);
  const allAppointments = useAppointmentsStore((s) => s.appointments);
  const financeEntries = useFinanceStore((s) => s.items);
  const addFinanceEntry = useFinanceStore((s) => s.add);
  const updateFinanceEntry = useFinanceStore((s) => s.update);
  const customers = useCustomersStore((s) => s.customers);
  const serviceTypes = useServiceTypesStore((s) => s.items);
  const addServiceType = useServiceTypesStore((s) => s.add);
  const pests = usePestsStore((s) => s.items);
  const addPest = usePestsStore((s) => s.add);
  const areas = useAreasStore((s) => s.items);
  const equipment = useEquipmentStore((s) => s.items);
  const checkoutEquipment = useEquipmentStore((s) => s.update);
  const allProducts = useProductsStore((s) => s.items);
  const allStaffUsers = useUsersStore((s) => s.items);
  const technicianUsers = allStaffUsers.filter((u) => u.role === 'tecnico' && u.isActive);
  const sellers = allStaffUsers.filter((u) => u.role !== 'tecnico');

  const [customerId, setCustomerId] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [serviceTypeIds, setServiceTypeIds] = useState<string[]>([]);
  const [technicianIds, setTechnicianIds] = useState<string[]>([]);
  const [sellerId, setSellerId] = useState('');
  const [status, setStatus] = useState<ServiceOrderStatus>('em_andamento');
  const [areaQty, setAreaQty] = useState<Record<string, number>>({});
  // Áreas escritas na hora pelo usuário (botão +). Valem só nesta OS: não
  // entram no catálogo global, senão "Câmara fria do estoque" de um cliente
  // apareceria como opção para todos os outros.
  const [customAreas, setCustomAreas] = useState<{ name: string; qty: number }[]>([]);
  const [pestIds, setPestIds] = useState<string[]>([]);
  const [pestValidity, setPestValidity] = useState<Record<string, string>>({});
  const [duration, setDuration] = useState('');
  const [procedures, setProcedures] = useState('');
  const [technicianMessage, setTechnicianMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [serviceValue, setServiceValue] = useState('');
  const [serviceValueTouched, setServiceValueTouched] = useState(false);
  /** O valor só conta como confirmado após o clique explícito em "Confirmar
   *  valor" — nunca é presumido a partir da sugestão automática. Qualquer
   *  edição posterior no valor exige nova confirmação. */
  const [valueConfirmed, setValueConfirmed] = useState(false);
  const [associatedOrderId, setAssociatedOrderId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pendente');
  const [paymentDate, setPaymentDate] = useState('');
  const [warrantyHas, setWarrantyHas] = useState(true);
  const [warrantyValue, setWarrantyValue] = useState('3');
  const [warrantyUnit, setWarrantyUnit] = useState<WarrantyUnit>('meses');
  const [warrantyType, setWarrantyType] = useState<WarrantyType>('corretivo');
  const [recEnabled, setRecEnabled] = useState(false);
  /** Por quanto tempo o contrato se repete (meses) e de quanto em quanto
   *  tempo. O número de visitas sai dos dois — é como a recorrência é
   *  contratada: "um ano, de mês em mês", não "doze visitas". */
  const [recMeses, setRecMeses] = useState(12);
  const [recFreq, setRecFreq] = useState<RecurrenceFreq>('mensal');
  const [recPhases, setRecPhases] = useState<RecurrencePhase[]>([]);
  /** Data escolhida para cada visita do plano, por índice de ocorrência.
   *  Vazio = usa a data calculada pela periodicidade. */
  const [recDates, setRecDates] = useState<string[]>([]);
  const [execDate, setExecDate] = useState('');
  const [execTime, setExecTime] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [validityDate, setValidityDate] = useState('');
  const [certValidityDate, setCertValidityDate] = useState('');
  const [certValidityTouched, setCertValidityTouched] = useState(false);
  const [equipmentIds, setEquipmentIds] = useState<string[]>([]);
  const [products, setProducts] = useState<{ productId: string; qty: number }[]>([]);
  const [returnAt, setReturnAt] = useState('');
  const [touched, setTouched] = useState(false);
  // Ref (não state) de propósito: precisa bloquear duplo-clique síncrono
  // (antes do primeiro re-render), o que um useState não garante.
  const submittingRef = useRef(false);
  const [filledFrom, setFilledFrom] = useState<number | null>(null);
  /** Só passa a valer depois que o formulário terminou de se popular — antes
   *  disso, salvar o rascunho gravaria o estado inicial vazio por cima. */
  const hydratedRef = useRef(false);
  /** true quando o formulário abriu com um rascunho recuperado — vale avisar,
   *  senão a pessoa não entende por que os campos vieram preenchidos. */
  const [fromDraft, setFromDraft] = useState(false);
  const [validityTouched, setValidityTouched] = useState(false);
  /** Texto livre de "áreas tratadas" de OS antigas (anteriores ao seletor por
   *  chips) — preservado ao editar quando nenhuma área com id correspondente
   *  está selecionada, para não perder a informação original. */
  const [legacyAreaText, setLegacyAreaText] = useState('');
  const licenses = useLicensesStore((s) => s.items);

  const cust = customers.find((c) => c.id === customerId);
  const areaIds = Object.keys(areaQty);

  /** Catálogo inativo some da seleção em novas OS, mas o que já estava
   *  escolhido nesta OS continua visível — nunca some silenciosamente. */
  const selectableServiceTypes = serviceTypes.filter((s) => s.isActive !== false || serviceTypeIds.includes(s.id));
  const selectablePests = pests.filter((p) => p.isActive !== false || pestIds.includes(p.id));
  const selectableAreas = areas.filter((a) => a.isActive !== false || areaIds.includes(a.id));

  /** Só equipamentos disponíveis (sem dono fixo) podem ser retirados temporariamente
   *  para a OS — o kit fixo/permanente do técnico não deve aparecer aqui. Em modo
   *  edição, mantém visível o que já está retirado nesta própria OS. */
  const availableEquipment = equipment.filter((e) => (!e.assignedTo && e.status === 'disponivel') || (initial && e.checkedOutOsId === initial.id));

  const toggleArea = (id: string) => setAreaQty((m) => {
    if (m[id] != null) { const n = { ...m }; delete n[id]; return n; }
    return { ...m, [id]: 1 };
  });
  const setAreaQtyVal = (id: string, qty: number) => setAreaQty((m) => ({ ...m, [id]: Math.max(1, qty) }));

  /** Converte um ISO (armazenado) de volta para o formato de <input type=date>,
   *  usando getters locais — evita o desvio de fuso do bug de datas. */
  const toInput = (iso?: string) => (iso ? toDateInputValue(new Date(iso)) : '');

  // Roda uma vez ao montar — o componente é criado do zero sempre que passa
  // a ser exibido (formulário de criação recém-aberto, ou o painel de
  // detalhe recém-transformado em edição), então não depende de um "open".
  useEffect(() => {
    if (initial) {
      // Modo edição: repopula todos os campos a partir da OS selecionada.
      setCustomerId(initial.customerId);
      setAppointmentId(initial.appointmentId ?? '');
      setServiceTypeIds(initial.serviceTypeIds?.length ? initial.serviceTypeIds : (initial.serviceTypeId ? [initial.serviceTypeId] : []));
      setTechnicianIds(initial.technicianIds?.length ? initial.technicianIds : (initial.technicianId ? [initial.technicianId] : []));
      setSellerId(initial.sellerId ?? '');
      setStatus(initial.status);
      setCustomAreas(initial.customAreas ?? []);
      const initialAreaQty = initial.areaQty && Object.keys(initial.areaQty).length ? initial.areaQty : Object.fromEntries((initial.areaIds ?? []).map((id) => [id, 1]));
      setAreaQty(initialAreaQty);
      // OS antigas guardavam "áreas tratadas" como texto livre, sem ids — preserva
      // esse texto para não perdê-lo caso nenhuma área com id seja reselecionada.
      setLegacyAreaText(Object.keys(initialAreaQty).length === 0 ? (initial.areaTreated ?? '') : '');
      setPestIds(initial.pestIds ?? []);
      setPestValidity(Object.fromEntries((initial.pestValidity ?? []).filter((pv) => pv.validityDate).map((pv) => [pv.pestId, toInput(pv.validityDate)])));
      setDuration(initial.totalMinutes ? String(initial.totalMinutes) : '');
      setProcedures(initial.procedures ?? '');
      setTechnicianMessage(initial.technicianMessage ?? '');
      setPaymentMethod(initial.paymentMethod ?? '');
      setServiceValue(initial.serviceValue != null ? String(initial.serviceValue) : '');
      setServiceValueTouched(true);
      setValueConfirmed(initial.serviceValueConfirmed ?? false);
      setAssociatedOrderId(initial.associatedOrderId ?? '');
      setPaymentStatus(initial.paymentStatus ?? 'pendente');
      setPaymentDate(toInput(initial.paymentDate));
      setWarrantyHas(initial.warranty?.has ?? false);
      setWarrantyValue(initial.warranty?.value != null ? String(initial.warranty.value) : '3');
      setWarrantyUnit(initial.warranty?.unit ?? 'meses');
      setWarrantyType(initial.warranty?.type ?? 'corretivo');
      setRecEnabled(initial.recurrence?.enabled ?? false);
      const fases = initial.recurrence?.phases?.length
        ? initial.recurrence.phases
        : (initial.recurrence?.frequency ? [{ id: uid('ph'), frequency: initial.recurrence.frequency, occurrences: 1 }] : []);
      setRecPhases(fases);
      setRecFreq(fases[0]?.frequency ?? 'mensal');
      // OS antiga não guardava a duração: deduz dos meses que o plano cobre,
      // para os controles abrirem coerentes com o que está salvo.
      setRecMeses(initial.recurrence?.durationMonths ?? mesesDoPlano(fases));
      setRecDates(initial.recurrence?.dates ?? []);
      setExecDate(toInput(initial.executionDate));
      setExecTime(initial.executionTime ?? '');
      setDueDate(toInput(initial.dueDate));
      setValidityDate(toInput(initial.validityDate));
      setValidityTouched(true);
      setCertValidityDate(toInput(initial.certificateValidityDate));
      setCertValidityTouched(true);
      setEquipmentIds(initial.equipmentIds ?? []);
      setProducts((initial.products ?? []).map((p) => ({ productId: p.productId, qty: p.usedQty })));
      setReturnAt('');
      setTouched(false);
      setFilledFrom(null);
      return;
    }
    // Rascunho de uma OS não finalizada tem prioridade sobre tudo: é o que a
    // pessoa estava fazendo.
    const rascunho = loadOsDraft();
    if (rascunho) {
      aplicarRascunho(rascunho);
      setFromDraft(true);
      hydratedRef.current = true;
      return;
    }
    const c0 = customers[0]?.id ?? '';
    setCustomerId(c0);
    setAppointmentId('');
    setServiceTypeIds(serviceTypes[0] ? [serviceTypes[0].id] : []);
    setTechnicianIds(technicianUsers[0] ? [technicianUsers[0].id] : []);
    setSellerId(''); setStatus('em_andamento'); setAreaQty({}); setLegacyAreaText(''); setPestIds([]); setPestValidity({}); setDuration(''); setProcedures(''); setTechnicianMessage('');
    setPaymentMethod(''); setServiceValue(''); setServiceValueTouched(false); setValueConfirmed(false); setAssociatedOrderId(''); setPaymentStatus('pendente'); setPaymentDate('');
    setWarrantyHas(true); setWarrantyValue('3'); setWarrantyUnit('meses'); setWarrantyType('corretivo');
    setRecEnabled(false); setRecPhases([]); setExecDate(''); setExecTime(''); setDueDate(''); setValidityDate(''); setValidityTouched(false);
    setCertValidityDate(''); setCertValidityTouched(false);
    setEquipmentIds([]); setProducts([]); setReturnAt(''); setTouched(false); setFilledFrom(null);
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Repõe no formulário o rascunho salvo. Campo ausente cai no padrão, para
   *  um rascunho antigo (de antes de um campo existir) não quebrar a tela. */
  const aplicarRascunho = (d: OsDraft) => {
    const str = (k: string, def = '') => (typeof d[k] === 'string' ? (d[k] as string) : def);
    const arr = <T,>(k: string): T[] => (Array.isArray(d[k]) ? (d[k] as T[]) : []);
    const obj = <T,>(k: string): T => ((d[k] && typeof d[k] === 'object' ? d[k] : {}) as T);
    const bool = (k: string, def = false) => (typeof d[k] === 'boolean' ? (d[k] as boolean) : def);
    const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0);

    setCustomerId(str('customerId'));
    setAppointmentId(str('appointmentId'));
    setServiceTypeIds(arr<string>('serviceTypeIds'));
    setTechnicianIds(arr<string>('technicianIds'));
    setSellerId(str('sellerId'));
    setStatus(str('status', 'em_andamento') as ServiceOrderStatus);
    setAreaQty(obj<Record<string, number>>('areaQty'));
    setCustomAreas(arr<{ name: string; qty: number }>('customAreas'));
    setLegacyAreaText(str('legacyAreaText'));
    setPestIds(arr<string>('pestIds'));
    setPestValidity(obj<Record<string, string>>('pestValidity'));
    setDuration(str('duration'));
    setProcedures(str('procedures'));
    setTechnicianMessage(str('technicianMessage'));
    setPaymentMethod(str('paymentMethod'));
    setServiceValue(str('serviceValue'));
    setServiceValueTouched(bool('serviceValueTouched'));
    setValueConfirmed(bool('valueConfirmed'));
    setAssociatedOrderId(str('associatedOrderId'));
    setPaymentStatus(str('paymentStatus', 'pendente') as PaymentStatus);
    setPaymentDate(str('paymentDate'));
    setWarrantyHas(bool('warrantyHas', true));
    setWarrantyValue(str('warrantyValue', '3'));
    setWarrantyUnit(str('warrantyUnit', 'meses') as WarrantyUnit);
    setWarrantyType(str('warrantyType', 'corretivo') as WarrantyType);
    setRecEnabled(bool('recEnabled'));
    setRecPhases(arr<RecurrencePhase>('recPhases'));
    setRecMeses(num('recMeses') || 12);
    setRecFreq((str('recFreq') as RecurrenceFreq) || 'mensal');
    setRecDates(arr<string>('recDates'));
    setExecDate(str('execDate'));
    setExecTime(str('execTime'));
    setDueDate(str('dueDate'));
    setValidityDate(str('validityDate'));
    setValidityTouched(bool('validityTouched'));
    setCertValidityDate(str('certValidityDate'));
    setCertValidityTouched(bool('certValidityTouched'));
    setEquipmentIds(arr<string>('equipmentIds'));
    setProducts(arr<{ productId: string; qty: number }>('products'));
    setReturnAt(str('returnAt'));
    setTouched(false);
    setFilledFrom(null);
  };

  /** Rascunho da OS em criação, guardado enquanto o formulário está aberto.
   *
   *  Sem isso, fechar e reabrir "Nova O.S." perdia tudo o que já tinha sido
   *  digitado — e, pior, o preenchimento pelo histórico repunha os dados da
   *  ÚLTIMA OS do cliente, que depois de salvar passa a ser justamente a que
   *  acabou de ser criada: dava a impressão de que a OS anterior "não zerava".
   *  Agora o rascunho manda enquanto a OS não foi confirmada, e é apagado no
   *  momento em que ela é criada. */
  const draft = useMemo(() => ({
    customerId, appointmentId, serviceTypeIds, technicianIds, sellerId, status,
    areaQty, customAreas, legacyAreaText, pestIds, pestValidity, duration, procedures,
    technicianMessage, paymentMethod, serviceValue, serviceValueTouched, valueConfirmed,
    associatedOrderId, paymentStatus, paymentDate, warrantyHas, warrantyValue, warrantyUnit,
    warrantyType, recEnabled, recMeses, recFreq, recPhases, recDates, execDate, execTime, dueDate, validityDate,
    validityTouched, certValidityDate, certValidityTouched, equipmentIds, products, returnAt,
  }), [customerId, appointmentId, serviceTypeIds, technicianIds, sellerId, status, areaQty,
    customAreas, legacyAreaText, pestIds, pestValidity, duration, procedures, technicianMessage,
    paymentMethod, serviceValue, serviceValueTouched, valueConfirmed, associatedOrderId,
    paymentStatus, paymentDate, warrantyHas, warrantyValue, warrantyUnit, warrantyType,
    recEnabled, recMeses, recFreq, recPhases, recDates, execDate, execTime, dueDate, validityDate, validityTouched,
    certValidityDate, certValidityTouched, equipmentIds, products, returnAt]);

  /** Guarda o rascunho a cada mudança — só na criação, e só depois que a
   *  pessoa mexeu em alguma coisa (senão o estado inicial vira "rascunho"). */
  useEffect(() => {
    if (initial || !hydratedRef.current) return;
    try { localStorage.setItem(OS_DRAFT_KEY, JSON.stringify(draft)); } catch { /* cota — ignora */ }
  }, [draft, initial]);

  /** Preenchimento inteligente: repete o último atendimento do cliente. */
  const applyHistory = (cid: string) => {
    const last = lastOrderForCustomer(cid);
    if (!last) { setFilledFrom(null); return; }
    setServiceTypeIds(last.serviceTypeIds?.length ? last.serviceTypeIds : (last.serviceTypeId ? [last.serviceTypeId] : []));
    setPestIds(last.pestIds ?? []);
    setPestValidity(Object.fromEntries((last.pestValidity ?? []).filter((pv) => pv.validityDate).map((pv) => [pv.pestId, pv.validityDate!.slice(0, 10)])));
    if (last.areaQty && Object.keys(last.areaQty).length) setAreaQty(last.areaQty);
    else if (last.areaIds?.length) setAreaQty(Object.fromEntries(last.areaIds.map((id) => [id, 1])));
    else if (last.areaTreated) { const names = last.areaTreated.split(',').map((s) => s.trim()); setAreaQty(Object.fromEntries(areas.filter((a) => names.some((n) => n.includes(a.name))).map((a) => [a.id, 1]))); }
    else setAreaQty({});
    if (last.technicianIds?.length) setTechnicianIds(last.technicianIds);
    if (last.paymentMethod) setPaymentMethod(last.paymentMethod);
    if (last.warranty) {
      setWarrantyHas(last.warranty.has);
      if (last.warranty.value) setWarrantyValue(String(last.warranty.value));
      if (last.warranty.unit) setWarrantyUnit(last.warranty.unit);
      if (last.warranty.type) setWarrantyType(last.warranty.type);
    }
    if (last.recurrence) {
      setRecEnabled(last.recurrence.enabled);
      setRecPhases(last.recurrence.phases?.length ? last.recurrence.phases.map((p) => ({ ...p, id: uid('ph') })) : (last.recurrence.frequency ? [{ id: uid('ph'), frequency: last.recurrence.frequency, occurrences: 1 }] : []));
    }
    setFilledFrom(last.number);
  };

  // Ao selecionar o cliente, tenta preencher a partir do histórico — mas não
  // em modo edição, para não sobrescrever os dados já preenchidos da OS.
  useEffect(() => { if (customerId && !initial) { applyHistory(customerId); setAppointmentId(''); } }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const customerAppointments = customerId ? appointmentsForCustomer(customerId) : [];

  const clearFill = () => {
    setServiceTypeIds(serviceTypes[0] ? [serviceTypes[0].id] : []);
    setPestIds([]); setPestValidity({}); setAreaQty({}); setCustomAreas([]); setLegacyAreaText(''); setPaymentMethod(''); setRecEnabled(false); setRecPhases([]); setRecDates([]); setFilledFrom(null);
    setValidityDate(''); setValidityTouched(false);
    setProducts([]); setEquipmentIds([]); setProcedures(''); setTechnicianMessage('');
    setExecDate(''); setExecTime(''); setDuration('');
    setServiceValue(''); setServiceValueTouched(false); setValueConfirmed(false);
    // "Começar em branco" também descarta o rascunho — senão ele voltaria na
    // próxima abertura e pareceria que a limpeza não funcionou.
    clearOsDraft();
    setFromDraft(false);
  };

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) =>
    setter((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));

  /** Cadastro rápido — evita sair da O.S. para incluir serviço/praga/área novos. */
  const quickAddServiceType = (name: string) => {
    const st: ServiceType = { id: uid('st'), orgId: currentOrgId(), name, defaultDurationMin: 60, defaultPrice: 0, color: '#0ea5e9' };
    addServiceType(st);
    setServiceTypeIds((arr) => [...arr, st.id]);
    toast(`Serviço "${name}" cadastrado.`, { tone: 'success' });
  };
  const quickAddPest = (name: string) => {
    const p: Pest = { id: uid('pest'), orgId: currentOrgId(), name };
    addPest(p);
    setPestIds((arr) => [...arr, p.id]);
    toast(`Praga "${name}" cadastrada.`, { tone: 'success' });
  };
  /** Área específica desta OS — fica registrada só aqui (ver `customAreas`). */
  const quickAddArea = (name: string) => {
    const limpo = name.trim();
    if (!limpo) return;
    if (customAreas.some((a) => a.name.toLowerCase() === limpo.toLowerCase())) return;
    setCustomAreas((prev) => [...prev, { name: limpo, qty: 1 }]);
    toast(`Área "${limpo}" adicionada a esta OS.`, { tone: 'success' });
  };
  const setCustomQty = (name: string, qty: number) =>
    setCustomAreas((prev) => (qty <= 0 ? prev.filter((a) => a.name !== name) : prev.map((a) => (a.name === name ? { ...a, qty } : a))));

  // Validade sugerida da OS — maior validade entre os serviços e pragas selecionados.
  const suggestedValidityDays = useMemo(() => {
    const days = [
      ...serviceTypeIds.map((id) => serviceTypes.find((s) => s.id === id)?.defaultValidityDays),
      ...pestIds.map((id) => pests.find((p) => p.id === id)?.defaultValidityDays),
    ].filter((v): v is number => v != null);
    return days.length ? Math.max(...days) : undefined;
  }, [serviceTypeIds, pestIds, serviceTypes, pests]);

  // Base do cálculo: a Data do Serviço quando informada; sem data marcada,
  // conta sempre a partir de hoje (nunca de uma data anterior) — mesma regra
  // já usada na validade por praga e na próxima visita, agora unificada aqui.
  //
  // A sugestão preenche o campo vazio e acompanha a Data do Serviço, mas NÃO
  // se mexe quando o usuário adiciona ou remove uma praga: `suggestedValidityDays`
  // é o maior prazo entre serviços e pragas escolhidos, então marcar mais uma
  // praga trocava a validade já preenchida por baixo de quem estava montando a
  // OS — e a validade do certificado ia junto, porque segue esta. Recalcular só
  // quando a Data do Serviço muda mantém a conta certa sem apagar trabalho.
  const execAnteriorRef = useRef(execDate);
  useEffect(() => {
    if (validityTouched || suggestedValidityDays == null) return;
    const execMudou = execAnteriorRef.current !== execDate;
    execAnteriorRef.current = execDate;
    setValidityDate((atual) => {
      if (atual && !execMudou) return atual;
      const base = execDate ? parseDateInput(execDate) : new Date();
      base.setDate(base.getDate() + suggestedValidityDays);
      return toDateInputValue(base);
    });
  }, [suggestedValidityDays, validityTouched, execDate]);

  // Validade do certificado — segue a validade do serviço enquanto não for editada
  // manualmente; sem garantia, o certificado não se aplica (fica em branco).
  useEffect(() => {
    if (certValidityTouched) return;
    setCertValidityDate(warrantyHas ? validityDate : '');
  }, [validityDate, warrantyHas, certValidityTouched]);

  // Prévia do plano de recorrência: cada ocorrência é calculada a partir da
  // anterior (nunca de hoje) — plano com fim definido, não repetição infinita.
  // As fases continuam sendo o formato guardado (uma OS antiga pode ter mais de
  // uma), mas a tela agora produz sempre uma só: duração ÷ periodicidade.
  useEffect(() => {
    if (!recEnabled) return;
    const visitas = occurrencesForDuration(recMeses, recFreq);
    setRecPhases((atual) => {
      const id = atual[0]?.id ?? uid('ph');
      if (atual.length === 1 && atual[0].frequency === recFreq && atual[0].occurrences === visitas) return atual;
      // Mudou o plano: as datas ajustadas à mão eram de OUTRAS visitas. Como
      // os ajustes são guardados por posição, mantê-los faria a data escolhida
      // para a visita 3 do plano semanal reaparecer na visita 3 do bimestral,
      // que é outro dia e outro mês.
      setRecDates([]);
      return [{ id, frequency: recFreq, occurrences: visitas }];
    });
  }, [recEnabled, recMeses, recFreq]);

  const recurrenceOccurrences = useMemo(() => {
    if (!recEnabled || !recPhases.length) return [];
    const baseIso = execDate ? combineDateTimeInputToIso(execDate, execTime) : new Date().toISOString();
    return computeRecurrenceOccurrences(baseIso, recPhases);
  }, [recEnabled, recPhases, execDate, execTime]);

  /** Datas que de fato vão para a agenda: a do usuário quando ele escolheu
   *  outra, senão a que a periodicidade calculou. */
  const recPlanDates = useMemo(
    () => planDates(recurrenceOccurrences, recDates),
    [recurrenceOccurrences, recDates],
  );

  /** Troca a data de uma visita do plano sem mexer nas seguintes: quando a
   *  data cai num dia em que o cliente não abre, quem remarca é uma visita
   *  só — arrastar o resto junto obrigaria a refazer tudo. */
  const setRecDate = (idx: number, valor: string) =>
    setRecDates((prev) => {
      const next = [...prev];
      while (next.length < recurrenceOccurrences.length) next.push('');
      next[idx] = valor
        ? combineDateTimeInputToIso(valor, execTime || fmtTime(recurrenceOccurrences[idx].date))
        : '';
      return next;
    });


  // Validade individual por praga — sugerida pelo cadastro da praga (ou pela
  // sugestão geral da OS), editável por praga; some quando a praga é removida.
  useEffect(() => {
    setPestValidity((m) => {
      const next = { ...m };
      pestIds.forEach((id) => {
        // `!== undefined` e não "se está vazio": apagar a data de uma praga é
        // uma escolha, e refazê-la sozinha desfaria essa escolha.
        if (next[id] !== undefined) return;
        const p = pests.find((x) => x.id === id);
        const days = p?.defaultValidityDays ?? suggestedValidityDays;
        if (days != null) {
          const base = execDate ? parseDateInput(execDate) : new Date();
          base.setDate(base.getDate() + days);
          next[id] = toDateInputValue(base);
        }
      });
      Object.keys(next).forEach((id) => { if (!pestIds.includes(id)) delete next[id]; });
      return next;
    });
  }, [pestIds, execDate, pests, suggestedValidityDays]);

  // Certificações/licenças da empresa vencidas — alertadas na geração da OS.
  const expiredLicenses = licenses.filter((l) => l.expiresAt && new Date(l.expiresAt) < new Date());

  // Produtos sugeridos: união dos produtos padrão dos serviços selecionados.
  const suggestedProducts = useMemo(() => {
    const map = new Map<string, number>();
    serviceTypeIds.forEach((stId) => {
      serviceTypes.find((s) => s.id === stId)?.defaultProducts?.forEach((dp) => {
        map.set(dp.productId, Math.max(map.get(dp.productId) ?? 0, dp.qty));
      });
    });
    return [...map.entries()].map(([productId, qty]) => ({ productId, qty }));
  }, [serviceTypeIds, serviceTypes]);

  // Produtos sugeridos (união dos padrões dos serviços selecionados) entram
  // automaticamente só enquanto o usuário não mexeu na lista.
  //
  // Antes a sugestão era reaplicada a cada recálculo, e isso corrompia a OS:
  // ao reabrir para editar uma OS já executada — em que o técnico marcou em
  // campo apenas os produtos que realmente usou — todos os produtos padrão do
  // serviço voltavam para a lista e passavam a constar no Laudo/Certificado
  // como aplicados. Depois que alguém edita (ou quando a OS já existe), a
  // lista é do usuário e ninguém acrescenta nada por conta própria.
  const productsTouched = useRef(false);
  useEffect(() => {
    if (initial) productsTouched.current = true;
  }, [initial]);
  useEffect(() => {
    if (productsTouched.current || !suggestedProducts.length) return;
    setProducts((prev) => {
      const existingIds = new Set(prev.map((p) => p.productId));
      const additions = suggestedProducts.filter((p) => !existingIds.has(p.productId));
      return additions.length ? [...prev, ...additions.map((p) => ({ productId: p.productId, qty: p.qty }))] : prev;
    });
  }, [suggestedProducts, initial]);

  // Preço padrão somado dos serviços selecionados — origem explícita da sugestão
  // de valor; o usuário sempre pode sobrescrever no campo "Valor do Serviço".
  const suggestedServiceValue = useMemo(
    () => serviceTypeIds.reduce((sum, id) => sum + (serviceTypes.find((s) => s.id === id)?.defaultPrice ?? 0), 0),
    [serviceTypeIds, serviceTypes],
  );
  useEffect(() => {
    if (serviceValueTouched) return;
    setServiceValue(suggestedServiceValue ? String(suggestedServiceValue) : '');
  }, [suggestedServiceValue, serviceValueTouched]);

  /** Gera/atualiza os agendamentos futuros do plano de recorrência. Só
   *  regenera quando o plano (habilitado/fases) realmente mudou — reabrir e
   *  salvar a OS sem tocar na recorrência nunca duplica visitas já criadas.
   *  Ao mudar o plano, remove apenas as visitas futuras ainda não confirmadas
   *  (status "programada"/"agendado") do plano anterior antes de gerar o novo. */
  const syncRecurrencePlan = (): { recurrenceGroupId?: string; nextVisitDate?: string } => {
    const prevPlan = initial?.recurrence;
    // A assinatura inclui as datas: remarcar uma visita do plano precisa
    // regenerar os agendamentos, mesmo com as fases intactas.
    const prevSignature = prevPlan?.enabled ? JSON.stringify([prevPlan.phases ?? [], prevPlan.dates ?? []]) : null;
    const nextSignature = recEnabled ? JSON.stringify([recPhases, recPlanDates]) : null;
    if (initial && prevSignature === nextSignature) {
      return { recurrenceGroupId: prevPlan?.recurrenceGroupId, nextVisitDate: initial.nextVisitDate };
    }
    if (prevPlan?.recurrenceGroupId) {
      allAppointments
        .filter((a) => a.recurrenceId === prevPlan.recurrenceGroupId && (a.status === 'agendado' || a.status === 'programada') && new Date(a.scheduledStart) > new Date())
        .forEach((a) => removeAppointment(a.id));
    }
    if (!recEnabled || !recPhases.length) return {};
    const occurrences = computeRecurrenceOccurrences(execDate ? combineDateTimeInputToIso(execDate, execTime) : new Date().toISOString(), recPhases);
    if (!occurrences.length) return {};
    // O que vale é a data combinada, não a que a periodicidade calculou.
    const datas = planDates(occurrences, recDates);
    const groupId = uid('rec');
    const svc = serviceTypes.find((s) => s.id === serviceTypeIds[0]);
    const durationMin = duration ? Number(duration) : (svc?.defaultDurationMin ?? 60);
    const custObj = getCustomer(customerId);
    occurrences.forEach((occ, i) => {
      const dataVisita = datas[i];
      const endIso = new Date(new Date(dataVisita).getTime() + durationMin * 60000).toISOString();
      const recurrenceRule = RECURRENCE_FREQ_LABEL[occ.frequency];
      addAppointment({
        customerId,
        serviceTypeId: serviceTypeIds[0],
        technicianId: technicianIds[0],
        // Visitas futuras da recorrência entram como "programada" e só
        // avançam para "agendado" (aguardando confirmação) quando entram no
        // período de confirmação — ver useAppointmentsStore.sweepConfirmations.
        status: isDueForConfirmation(dataVisita, recurrenceRule) ? 'agendado' : 'programada',
        priority: 'normal',
        scheduledStart: dataVisita,
        scheduledEnd: endIso,
        estimatedMinutes: durationMin,
        address: address(custObj),
        products: products.map((p) => ({ productId: p.productId, plannedQty: p.qty })),
        recurrenceId: groupId,
        recurrenceRule,
      }).catch(() => {});
    });
    return { recurrenceGroupId: groupId, nextVisitDate: datas[0] };
  };

  const submit = async () => {
    if (submittingRef.current) return;
    setTouched(true);
    const missing: string[] = [];
    if (!customerId) missing.push('Cliente');
    if (!serviceTypeIds.length) missing.push('Serviços executados');
    if (!technicianIds.length) missing.push('Equipe — técnicos');
    if (!execDate) missing.push('Data do Serviço');
    if (!execTime) missing.push('Horário do Serviço');
    if (missing.length) {
      toast(`Preencha os campos obrigatórios: ${missing.join(', ')}.`, { tone: 'warning' });
      return;
    }
    const prevEquipmentIds = initial?.equipmentIds ?? [];
    const addedEquipmentIds = equipmentIds.filter((id) => !prevEquipmentIds.includes(id));
    const removedEquipmentIds = prevEquipmentIds.filter((id) => !equipmentIds.includes(id));
    if (addedEquipmentIds.length > 0 && !returnAt) {
      toast('Informe a previsão de devolução dos equipamentos retirados.', { tone: 'warning' });
      return;
    }
    if (serviceValue && Number(serviceValue) > 0 && !valueConfirmed) {
      toast('Confirme o valor do serviço (✓ Confirmar valor) antes de continuar.', { tone: 'warning' });
      return;
    }
    submittingRef.current = true;
    onSavingChange?.(true);
    try {
    const now = new Date().toISOString();
    const recPlan = syncRecurrencePlan();
    const input: ServiceOrderInput = {
      customerId,
      appointmentId: appointmentId || undefined,
      serviceTypeId: serviceTypeIds[0],
      serviceTypeIds,
      technicianId: technicianIds[0],
      technicianIds,
      sellerId: sellerId || undefined,
      status,
      areaIds,
      areaQty: Object.keys(areaQty).length ? areaQty : undefined,
      customAreas: customAreas.length ? customAreas : undefined,
      areaTreated: [
        ...areaIds.map((id) => { const a = areas.find((x) => x.id === id); return a ? `${areaQty[id] ?? 1} ${a.name}` : null; }),
        ...customAreas.map((a) => `${a.qty} ${a.name}`),
      ].filter(Boolean).join(', ') || legacyAreaText || undefined,
      procedures: procedures.trim() || undefined,
      technicianMessage: technicianMessage.trim() || undefined,
      totalMinutes: duration ? Number(duration) : undefined,
      startedAt: initial?.startedAt ?? (status !== 'rascunho' ? now : undefined),
      finishedAt: status === 'concluida' ? (initial?.finishedAt ?? now) : undefined,
      pestIds,
      pestValidity: pestIds.length ? pestIds.map((id) => ({ pestId: id, validityDate: pestValidity[id] ? dateInputToIso(pestValidity[id]) : undefined })) : undefined,
      // Preserva o que o formulário não edita: `outOfStock` é marcado em campo
      // quando o técnico usa além do saldo, e salvar a OS aqui não pode apagar
      // esse alerta.
      products: products.map((p) => {
        const anterior = initial?.products.find((x) => x.productId === p.productId);
        return { ...anterior, productId: p.productId, usedQty: p.qty };
      }),
      paymentMethod: paymentMethod || undefined,
      serviceValue: serviceValue ? Number(serviceValue) : undefined,
      serviceValueConfirmed: serviceValue ? valueConfirmed : undefined,
      associatedOrderId: associatedOrderId || undefined,
      paymentStatus,
      paymentDate: paymentStatus === 'pago' && paymentDate ? dateInputToIso(paymentDate) : undefined,
      warranty: { has: warrantyHas, value: warrantyHas ? Number(warrantyValue) || undefined : undefined, unit: warrantyHas ? warrantyUnit : undefined, type: warrantyHas ? warrantyType : undefined },
      recurrence: {
        enabled: recEnabled,
        frequency: recEnabled ? recPhases[0]?.frequency : undefined,
        phases: recEnabled && recPhases.length ? recPhases : undefined,
        recurrenceGroupId: recPlan.recurrenceGroupId,
        durationMonths: recEnabled ? recMeses : undefined,
        dates: recEnabled && recPlanDates.length ? recPlanDates : undefined,
      },
      executionDate: execDate ? dateInputToIso(execDate) : undefined,
      executionTime: execTime || undefined,
      dueDate: dueDate ? dateInputToIso(dueDate) : undefined,
      validityDate: validityDate ? dateInputToIso(validityDate) : undefined,
      certificateValidityDate: certValidityDate ? dateInputToIso(certValidityDate) : undefined,
      nextVisitDate: recPlan.nextVisitDate,
      equipmentIds,
      hasCustomerSignature: initial?.hasCustomerSignature ?? false,
    };

    const returnIso = returnAt ? new Date(returnAt).toISOString() : undefined;
    const apptStatus: AppointmentStatus = osStatusToAppointmentStatus(status);
    const custName = getCustomer(customerId)?.name ?? '';

    if (initial) {
      // ---- Edição: atualiza a OS existente e registra o que mudou no histórico ----
      const changes: string[] = [];
      if (initial.status !== status) changes.push(`status: ${OS_STATUS_LABEL[initial.status]} → ${OS_STATUS_LABEL[status]}`);
      if ((initial.serviceValue ?? 0) !== (input.serviceValue ?? 0)) changes.push(`valor: ${formatCurrency(initial.serviceValue ?? 0)} → ${formatCurrency(input.serviceValue ?? 0)}`);
      if ((initial.paymentStatus ?? 'pendente') !== paymentStatus) changes.push(`pagamento: ${PAYMENT_STATUS_LABEL[initial.paymentStatus ?? 'pendente']} → ${PAYMENT_STATUS_LABEL[paymentStatus]}`);
      if ((initial.executionDate ?? '') !== (input.executionDate ?? '')) changes.push('data do serviço alterada');
      if ((initial.dueDate ?? '') !== (input.dueDate ?? '')) changes.push('vencimento do pagamento alterado');
      if ((initial.procedures ?? '') !== (input.procedures ?? '')) changes.push('procedimentos atualizados');
      if (JSON.stringify([...(initial.pestIds ?? [])].sort()) !== JSON.stringify([...pestIds].sort())) changes.push('pragas atualizadas');
      const initialSvcIds = initial.serviceTypeIds?.length ? initial.serviceTypeIds : [initial.serviceTypeId];
      if (JSON.stringify([...initialSvcIds].sort()) !== JSON.stringify([...serviceTypeIds].sort())) changes.push('serviços atualizados');
      const initialTechIds = initial.technicianIds?.length ? initial.technicianIds : [initial.technicianId];
      if (JSON.stringify([...initialTechIds].sort()) !== JSON.stringify([...technicianIds].sort())) changes.push('equipe técnica atualizada');
      if (addedEquipmentIds.length || removedEquipmentIds.length) changes.push('equipamentos atualizados');

      updateOs(initial.id, input);
      const so: ServiceOrder = { ...initial, ...input };

      removedEquipmentIds.forEach((id) => checkoutEquipment(id, {
        status: 'disponivel', checkedOutAt: undefined, checkedOutTo: undefined, checkedOutOsId: undefined, expectedReturnAt: undefined,
      }));
      addedEquipmentIds.forEach((id) => checkoutEquipment(id, {
        status: 'em_uso', checkedOutAt: now, checkedOutTo: technicianIds[0], checkedOutOsId: initial.id, expectedReturnAt: returnIso,
      }));

      // Agenda: só atualiza o agendamento já vinculado — edição de OS nunca
      // cria um novo agendamento, para não duplicar a Agenda.
      if (appointmentId) updateAppointment(appointmentId, { status: apptStatus, technicianId: technicianIds[0] });

      // Financeiro: atualiza o lançamento vinculado a esta OS, se existir;
      // cria um novo apenas se a OS passou a ter valor e ainda não tinha lançamento.
      const existingFe = financeEntries.find((f) => f.serviceOrderId === initial.id);
      if (input.serviceValue) {
        const feData = {
          amount: input.serviceValue,
          status: (paymentStatus === 'pago' ? 'pago' : 'pendente') as 'pago' | 'pendente',
          description: `OS #${initial.number} · ${custName}${paymentMethod ? ` · ${paymentMethod}` : ''}`,
          dueDate: dueDate || undefined,
          paidAt: paymentStatus === 'pago' ? (input.paymentDate ?? now) : undefined,
        };
        if (existingFe) updateFinanceEntry(existingFe.id, feData);
        else addFinanceEntry({ id: uid('fe'), orgId: currentOrgId(), type: 'receita', customerId, serviceOrderId: initial.id, createdAt: now, ...feData });
      }

      logChange('edição', 'ordem de serviço', changes.length ? `OS #${initial.number} · ${changes.join('; ')}` : `OS #${initial.number} · dados atualizados`, initial.id);
      toast(`OS #${initial.number} atualizada.`, { tone: 'success' });
      onSaved(so);
      return;
    }

    // ---- Criação: nova OS ----
    // Aguarda a confirmação remota antes de criar os registros dependentes
    // (agendamento, financeiro) — evita a corrida em que eles chegam ao
    // Postgres antes da OS existir, violando a FK (ver serviceOrdersStore.add).
    let so: ServiceOrder;
    try {
      so = await add(input);
    } catch {
      return;
    }
    equipmentIds.forEach((id) => checkoutEquipment(id, {
      status: 'em_uso', checkedOutAt: now, checkedOutTo: technicianIds[0], checkedOutOsId: so.id, expectedReturnAt: returnIso,
    }));

    // Sincroniza com a Agenda: se a OS já estava vinculada a um agendamento,
    // atualiza o status dele; senão, cria um novo agendamento para que a OS
    // apareça diretamente na Agenda (em vez de ficar só na lista de OS).
    if (appointmentId) {
      updateAppointment(appointmentId, { status: apptStatus, technicianId: technicianIds[0] });
    } else {
      const svc = serviceTypes.find((s) => s.id === serviceTypeIds[0]);
      const durationMin = duration ? Number(duration) : (svc?.defaultDurationMin ?? 60);
      const startIso = execDate ? combineDateTimeInputToIso(execDate, execTime) : now;
      const endIso = new Date(new Date(startIso).getTime() + durationMin * 60000).toISOString();
      // Aguarda a confirmação remota do agendamento antes de vincular seu id
      // à OS — mesmo motivo do `await add(input)` acima: sem isso, o UPDATE
      // de service_orders.appointment_id podia chegar ao Postgres apontando
      // pra um agendamento que ainda não existia (ou nunca chegou a existir,
      // se o insert falhasse), violando a FK.
      try {
        const newAppt = await addAppointment({
          customerId,
          serviceTypeId: serviceTypeIds[0],
          technicianId: technicianIds[0],
          status: apptStatus,
          priority: 'normal',
          scheduledStart: startIso,
          scheduledEnd: endIso,
          estimatedMinutes: durationMin,
          address: address(cust),
          // Horário marcado explicitamente na OS: mantém a visita presa a
          // essa janela na otimização de rota (ver lib/route.ts) em vez de
          // deixá-la flutuar livremente entre as demais.
          fixedTime: !!execTime,
          products: products.map((p) => ({ productId: p.productId, plannedQty: p.qty })),
        });
        updateOs(so.id, { appointmentId: newAppt.id });
      } catch {
        // addAppointment já mostrou o toast de erro — a OS continua criada,
        // só sem o agendamento vinculado à Agenda.
      }
    }

    // Alimenta o Financeiro automaticamente: toda OS com valor vira um lançamento
    // de receita — pendente (Serviços a Receber) ou já pago, conforme informado.
    if (so.serviceValue) {
      addFinanceEntry({
        id: uid('fe'), orgId: currentOrgId(), type: 'receita',
        status: paymentStatus === 'pago' ? 'pago' : 'pendente',
        description: `OS #${so.number} · ${custName}${paymentMethod ? ` · ${paymentMethod}` : ''}`,
        amount: so.serviceValue,
        customerId, serviceOrderId: so.id,
        dueDate: dueDate || undefined,
        paidAt: paymentStatus === 'pago' ? (so.paymentDate ?? now) : undefined,
        createdAt: now,
      });
    }

    logChange('criação', 'ordem de serviço', `OS #${so.number} · ${custName}`, so.id);
    // A OS foi confirmada: o rascunho deixou de existir. É isto que faz o
    // próximo "Nova O.S." abrir em branco em vez de repetir esta.
    clearOsDraft();
    hydratedRef.current = false;
    toast(`OS #${so.number} criada e adicionada à Agenda.`, { tone: 'success' });
    onSaved(so);
    } finally {
      submittingRef.current = false;
      onSavingChange?.(false);
    }
  };

  useImperativeHandle(ref, () => ({ submit }));

  return (
      <div className="space-y-5">
        <Field label="Cliente" required>
          <Combobox
            value={customerId}
            onChange={setCustomerId}
            placeholder="Selecione…"
            searchPlaceholder="Buscar cliente…"
            options={customers.map((c) => ({ value: c.id, label: c.name, sub: c.type === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física' }))}
          />
          {cust && <p className="mt-1 text-xs text-muted-foreground">{cust.type === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'}{cust.propertyType ? ` · ${cust.propertyType}` : ''}</p>}
          {touched && !customerId && <span className="mt-1 block text-xs text-danger">Selecione um cliente.</span>}
        </Field>

        {customerAppointments.length > 0 && (
          <Field label="Agendamento vinculado" hint="Opcional — permite que a Mensagem para o Técnico chegue ao app de campo">
            <Select value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)}>
              <option value="">Nenhum (OS avulsa)</option>
              {customerAppointments.map((a) => <option key={a.id} value={a.id}>{fmtDate(a.scheduledStart)} · {getServiceType(a.serviceTypeId)?.name ?? ''}</option>)}
            </Select>
          </Field>
        )}

        {fromDraft && (
          <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft/50 p-2.5 text-xs text-foreground">
            <Zap size={14} className="shrink-0 text-warning" />
            <span className="flex-1">Rascunho recuperado — você tinha começado esta OS e não finalizou. Ao confirmar a criação, ela some daqui.</span>
            <button onClick={clearFill} className="shrink-0 font-medium underline">Começar em branco</button>
          </div>
        )}

        {filledFrom != null && !fromDraft && (
          <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft/40 p-2.5 text-xs text-brand">
            <Zap size={14} className="shrink-0" />
            <span className="flex-1">Preenchido automaticamente pelo último atendimento (OS #{filledFrom}). Revise e ajuste o que mudou.</span>
            <button onClick={clearFill} className="shrink-0 font-medium underline">Começar em branco</button>
          </div>
        )}

        {expiredLicenses.length > 0 && (
          <div className="rounded-xl border border-danger/30 bg-danger-soft/30 p-2.5 text-xs text-danger">
            <span className="font-semibold">Atenção — certificação vencida:</span>{' '}
            {expiredLicenses.map((l) => `${l.name} (venceu em ${fmtDate(l.expiresAt!)})`).join(', ')}. Regularize antes de emitir o certificado/laudo desta OS.
          </div>
        )}

        <Field label="Serviços executados" required hint="Toque para adicionar vários serviços à mesma OS">
          <div className="flex flex-wrap items-center gap-1.5">
            {selectableServiceTypes.map((s) => <Chip key={s.id} active={serviceTypeIds.includes(s.id)} onClick={() => toggle(setServiceTypeIds, s.id)}>{s.name}</Chip>)}
            <QuickAddChip label="serviço" onAdd={quickAddServiceType} />
          </div>
          {touched && !serviceTypeIds.length && <span className="mt-1 block text-xs text-danger">Selecione ao menos um serviço.</span>}
        </Field>

        <Field label="Pragas combatidas" hint="Cada praga pode ter validade própria, independente da validade geral do serviço">
          <div className="flex flex-wrap items-center gap-1.5">
            {selectablePests.map((p) => <Chip key={p.id} active={pestIds.includes(p.id)} onClick={() => toggle(setPestIds, p.id)}>{p.name}</Chip>)}
            <QuickAddChip label="praga" onAdd={quickAddPest} />
          </div>
          {pestIds.length > 0 && (
            <div className="mt-2 space-y-1.5 rounded-xl border border-border bg-muted/30 p-2.5">
              {pestIds.map((id) => {
                const p = pests.find((x) => x.id === id);
                return (
                  <div key={id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground">{p?.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">Validade</span>
                      <DateInput type="date" value={pestValidity[id] ?? ''} onChange={(e) => setPestValidity((m) => ({ ...m, [id]: e.target.value }))} className="h-7 rounded-md border border-input bg-surface px-1.5 text-xs text-foreground focus:border-brand focus:outline-none" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Field>

        <Field label="Áreas tratadas" hint="Toque para selecionar; ajuste a quantidade com + / −">
          <div className="flex flex-wrap items-center gap-1.5">
            {selectableAreas.map((a) => (
              <div key={a.id} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition ${areaQty[a.id] != null ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                <button type="button" onClick={() => toggleArea(a.id)}>{a.name}</button>
                {areaQty[a.id] != null && (
                  <span className="flex items-center gap-1 border-l border-brand/30 pl-1">
                    <button type="button" aria-label={`Diminuir quantidade de ${a.name}`} onClick={() => setAreaQtyVal(a.id, areaQty[a.id] - 1)} className="flex h-4 w-4 items-center justify-center rounded hover:bg-brand/20">−</button>
                    <span className="w-3.5 text-center font-semibold">{areaQty[a.id]}</span>
                    <button type="button" aria-label={`Aumentar quantidade de ${a.name}`} onClick={() => setAreaQtyVal(a.id, areaQty[a.id] + 1)} className="flex h-4 w-4 items-center justify-center rounded hover:bg-brand/20">+</button>
                  </span>
                )}
              </div>
            ))}
            {customAreas.map((a) => (
              <div key={a.name} className="flex items-center gap-1 rounded-full border border-brand bg-brand-soft px-2 py-1 text-xs text-brand">
                <span title="Área específica desta OS">{a.name}</span>
                <span className="flex items-center gap-1 border-l border-brand/30 pl-1">
                  <button type="button" aria-label={`Diminuir quantidade de ${a.name}`} onClick={() => setCustomQty(a.name, a.qty - 1)} className="flex h-4 w-4 items-center justify-center rounded hover:bg-brand/20">−</button>
                  <span className="w-3.5 text-center font-semibold">{a.qty}</span>
                  <button type="button" aria-label={`Aumentar quantidade de ${a.name}`} onClick={() => setCustomQty(a.name, a.qty + 1)} className="flex h-4 w-4 items-center justify-center rounded hover:bg-brand/20">+</button>
                </span>
              </div>
            ))}
            <QuickAddChip label="área" onAdd={quickAddArea} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            O <span className="font-medium">+</span> cria uma área específica desta OS (ex.: "Câmara fria do estoque").
            Ela fica registrada só aqui — para virar opção fixa de todos os clientes, cadastre em Configurações → Cadastro.
          </p>
        </Field>

        <Field label="Produtos previstos" hint="Sugeridos automaticamente pelos serviços selecionados — ajuste a quantidade, remova ou adicione outro">
          <MultiCombobox
            values={products.map((p) => p.productId)}
            onChange={(ids) => { productsTouched.current = true; setProducts((prev) => {
              const kept = prev.filter((p) => ids.includes(p.productId));
              const addedIds = ids.filter((id) => !prev.some((p) => p.productId === id));
              return [...kept, ...addedIds.map((id) => ({ productId: id, qty: 1 }))];
            }); }}
            placeholder="Buscar produto…"
            options={allProducts.map((p) => ({ value: p.id, label: p.name, sub: p.unit }))}
          />
        </Field>
        {products.length > 0 && (
          <div className="space-y-1.5">
            {products.map((row) => {
              const prod = getProduct(row.productId);
              return (
                <div key={row.productId} className="flex items-center gap-2 rounded-lg border border-border/60 p-2">
                  <span className="flex-1 truncate text-sm text-foreground">{prod?.name ?? row.productId}</span>
                  <input
                    type="number" min={0} step="0.5" value={row.qty}
                    onChange={(e) => setProducts((prev) => prev.map((p) => (p.productId === row.productId ? { ...p, qty: Number(e.target.value) || 0 } : p)))}
                    className="h-8 w-16 rounded border border-input bg-surface px-1.5 text-right text-sm"
                  />
                  <span className="w-6 text-xs text-muted-foreground">{prod?.unit}</span>
                  <button type="button" onClick={() => setProducts((prev) => prev.filter((p) => p.productId !== row.productId))} className="text-muted-foreground hover:text-danger" title="Remover"><X size={15} /></button>
                </div>
              );
            })}
          </div>
        )}

        {/* Garantia */}
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Garantia</p>
            <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={warrantyHas} onChange={(e) => setWarrantyHas(e.target.checked)} className="h-4 w-4 rounded border-border" /> Com garantia</label>
          </div>
          {warrantyHas && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Prazo"><Input type="number" min={1} max={warrantyUnit === 'meses' ? 12 : 365} value={warrantyValue} onChange={(e) => setWarrantyValue(e.target.value)} /></Field>
              <Field label="Unidade"><Select value={warrantyUnit} onChange={(e) => setWarrantyUnit(e.target.value as WarrantyUnit)}><option value="dias">Dias</option><option value="meses">Meses</option></Select></Field>
              <Field label="Tipo"><Select value={warrantyType} onChange={(e) => setWarrantyType(e.target.value as WarrantyType)}>{(Object.keys(WARRANTY_TYPE_LABEL) as WarrantyType[]).map((t) => <option key={t} value={t}>{WARRANTY_TYPE_LABEL[t]}</option>)}</Select></Field>
            </div>
          )}
        </div>

        {/* Recorrência */}
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={recEnabled} onChange={(e) => { setRecEnabled(e.target.checked); if (e.target.checked && !recPhases.length) setRecPhases([{ id: uid('ph'), frequency: 'mensal', occurrences: 1 }]); }} className="h-4 w-4 rounded border-border" /> Serviço recorrente</label>
          {recEnabled && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Escolha por quanto tempo o contrato se repete e de quanto em quanto tempo. As
                visitas saem dessa conta — e cada data pode ser ajustada abaixo para cair no dia
                que serve ao cliente.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Duração da recorrência">
                  <Select value={String(recMeses)} onChange={(e) => setRecMeses(Number(e.target.value))}>
                    {DURACOES_RECORRENCIA.map((d) => <option key={d.meses} value={d.meses}>{d.label}</option>)}
                  </Select>
                </Field>
                <Field label="A cada">
                  <Select value={recFreq} onChange={(e) => setRecFreq(e.target.value as RecurrenceFreq)}>
                    {(Object.keys(RECURRENCE_FREQ_LABEL) as RecurrenceFreq[]).map((r) => <option key={r} value={r}>{RECURRENCE_FREQ_LABEL[r]}</option>)}
                  </Select>
                </Field>
              </div>
              {recurrenceOccurrences.length > 0 && (
                <div className="rounded-lg border border-brand/30 bg-brand-soft/20 p-2.5">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-brand">
                      {totalOccurrences(recPhases)} visita(s) em {rotuloDuracao(recMeses)} — {withinNextYear(recPlanDates).length} no próximo ano
                    </p>
                    {recDates.some(Boolean) && (
                      <button
                        type="button"
                        onClick={() => setRecDates([])}
                        className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Voltar às datas calculadas
                      </button>
                    )}
                  </div>
                  {/* A periodicidade dá a data; o dia da semana é o que decide
                      se ela serve. Cliente comercial não abre no domingo, e
                      remarcar depois de programado dá muito mais trabalho. */}
                  <div className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
                    {recPlanDates.map((iso, i) => {
                      const fds = isWeekend(iso);
                      const alterada = !!recDates[i];
                      return (
                        <div key={recurrenceOccurrences[i].phaseId + i} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Visita {i + 1}</span>
                          <DateInput
                            type="date"
                            value={toDateInputValue(new Date(iso))}
                            onChange={(e) => setRecDate(i, e.target.value)}
                            className="h-8 flex-1 text-xs"
                            aria-label={`Data da visita ${i + 1}`}
                          />
                          <span className={cn('w-28 shrink-0 text-[11px] capitalize', fds ? 'font-medium text-warning' : 'text-muted-foreground')}>
                            {weekdayLabel(iso)}{fds ? ' ⚠' : ''}
                          </span>
                          {alterada && <span className="shrink-0 text-[10px] text-brand">alterada</span>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Mudar a data de uma visita não desloca as seguintes. Uma semana antes de cada
                    uma, o sistema avisa para confirmar e gerar a OS a partir desta.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Valor e pagamento */}
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Valor e pagamento</p>
            <Segmented size="sm" value={paymentStatus === 'pago' ? 'pago' : 'pendente'} onChange={(v) => setPaymentStatus(v as PaymentStatus)} options={[{ value: 'pendente', label: 'Não pago' }, { value: 'pago', label: 'Pago' }]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Valor do Serviço"
              hint={valueConfirmed ? 'Valor confirmado.' : !serviceValueTouched && suggestedServiceValue > 0 ? `Preço padrão do serviço: ${formatCurrency(suggestedServiceValue)}` : 'Sem origem automática — informe manualmente'}
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} step="0.01" value={serviceValue}
                  onChange={(e) => { setServiceValue(e.target.value); setServiceValueTouched(true); setValueConfirmed(false); }}
                  placeholder="0,00" className="flex-1"
                />
                {valueConfirmed ? (
                  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-success-soft px-2.5 py-2 text-xs font-medium text-success">
                    <Check size={13} /> Confirmado
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!serviceValue}
                    onClick={() => setValueConfirmed(true)}
                    className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-success px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Check size={13} /> Confirmar valor
                  </button>
                )}
              </div>
            </Field>
            <Field label="Forma de pagamento"><Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="">—</option>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field>
            {paymentStatus === 'pago' && (
              <Field label="Data do pagamento" className="col-span-2"><DateInput type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></Field>
            )}
          </div>
        </div>

        <Field label="OS associada" hint="Opcional — vincula esta OS a um atendimento anterior (ex.: retorno/garantia); busque pelo número">
          <Combobox
            value={associatedOrderId}
            onChange={setAssociatedOrderId}
            placeholder="Nenhuma"
            searchPlaceholder="Buscar por número da OS…"
            options={allOrders.filter((o) => o.id !== initial?.id).map((o) => ({ value: o.id, label: `#${o.number} · ${getCustomer(o.customerId)?.name ?? ''}`, sub: fmtDate(o.createdAt) }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value as ServiceOrderStatus)}>{(Object.keys(OS_STATUS_LABEL) as ServiceOrderStatus[]).map((s) => <option key={s} value={s}>{OS_STATUS_LABEL[s]}</option>)}</Select></Field>
          <Field label="Data do Serviço" required>
            <DateInput type="date" value={execDate} onChange={(e) => setExecDate(e.target.value)} />
            {touched && !execDate && <span className="mt-1 block text-xs text-danger">Informe a data do serviço.</span>}
          </Field>
          <Field label="Horário do Serviço" required hint="Define exatamente onde a visita entra na Agenda e na rota do técnico">
            <DateInput type="time" value={execTime} onChange={(e) => setExecTime(e.target.value)} />
            {touched && !execTime && <span className="mt-1 block text-xs text-danger">Informe o horário do serviço.</span>}
          </Field>
          <Field label="Data de Vencimento do Pagamento"><DateInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="Validade do Serviço" hint={!validityTouched && suggestedValidityDays != null ? `Sugerida pelo serviço/praga: ${suggestedValidityDays} dias` : 'Validade do serviço executado, com ou sem garantia'}>
            <DateInput type="date" value={validityDate} onChange={(e) => { setValidityDate(e.target.value); setValidityTouched(true); }} />
          </Field>
          <Field label="Validade do Certificado" hint={!warrantyHas ? 'Não aplicável — serviço sem garantia' : 'Validade do certificado a ser emitido'}>
            <DateInput type="date" disabled={!warrantyHas} value={certValidityDate} onChange={(e) => { setCertValidityDate(e.target.value); setCertValidityTouched(true); }} />
          </Field>
          <Field label="Duração (min)"><Input type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="—" /></Field>
        </div>

        <Field label="Equipe — técnicos" required hint="Selecione um ou mais técnicos">
          <div className="flex flex-wrap gap-1.5">
            {technicianUsers.map((t) => <Chip key={t.id} active={technicianIds.includes(t.id)} onClick={() => toggle(setTechnicianIds, t.id)}>{t.name.split(' ')[0]}</Chip>)}
          </div>
          {touched && !technicianIds.length && <span className="mt-1 block text-xs text-danger">Selecione ao menos um técnico.</span>}
        </Field>
        <Field label="Vendedor responsável"><Select value={sellerId} onChange={(e) => setSellerId(e.target.value)}><option value="">—</option>{sellers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>

        <Field label="Equipamentos utilizados" hint="Apenas retirada temporária — o kit fixo do técnico não aparece aqui">
          <MultiCombobox
            values={equipmentIds}
            onChange={setEquipmentIds}
            placeholder="Buscar equipamento disponível…"
            options={availableEquipment.map((e) => ({ value: e.id, label: e.name, sub: e.code }))}
          />
        </Field>
        {equipmentIds.length > 0 && (
          <Field label="Previsão de devolução dos equipamentos" required>
            <DateInput type="datetime-local" value={returnAt} onChange={(e) => setReturnAt(e.target.value)} />
            {touched && !returnAt && <span className="mt-1 block text-xs text-danger">Informe a previsão de devolução.</span>}
          </Field>
        )}

        <Field label="Procedimentos / observações"><Textarea value={procedures} onChange={(e) => setProcedures(e.target.value)} placeholder="Descreva o que foi feito no atendimento…" /></Field>

        <Field label="Mensagem para o Técnico" hint="Uso interno — visível apenas no app de campo, nunca aparece na OS, Certificado ou Laudo impressos">
          <Textarea value={technicianMessage} onChange={(e) => setTechnicianMessage(e.target.value)} placeholder="Ex.: cliente pediu para não usar produto com cheiro forte…" />
        </Field>
      </div>
  );
  },
);

/** Texto de emergência (CIT) configurado nas Configurações. */
function settingsEmergency(): string {
  const s = useSettingsStore.getState();
  return `${s.emergencyPhone}${s.emergencyInfo ? ` — ${s.emergencyInfo}` : ''}`;
}

// Assinaturas eletrônicas da OS deixaram de ser capturadas nesta tela —
// desnecessário aqui, já que o técnico já captura ambas em campo
// (CampoPage, ao finalizar o atendimento); ver so.technicianSignature/
// so.customerSignature, ainda usados na impressão (printDocuments.ts).

/** Duração aproximada de um plano já salvo, em meses — usada só para abrir os
 *  controles coerentes numa OS criada antes de a duração existir. */
function mesesDoPlano(fases: RecurrencePhase[]): number {
  const dias = fases.reduce((soma, f) => soma + f.occurrences * RECURRENCE_FREQ_DAYS[f.frequency], 0);
  return Math.max(1, Math.round(dias / 30));
}

/** Emissão de NFS-e a partir da OS concluída (Governo · NFS-e Nacional / simulação). */
function FiscalSection({ so }: { so: ServiceOrder }) {
  const { invoices, emitFiscal } = useInvoicesStore();
  const fiscal = useSettingsStore((s) => s.fiscal);
  const invoice = invoices.find((i) => i.serviceOrderId === so.id);
  const customer = getCustomer(so.customerId);
  const svc = getServiceType(so.serviceTypeId);
  const [emitting, setEmitting] = useState(false);

  const amount = svc?.defaultPrice ?? 300;
  const preview = useMemo(() => computeTaxes(amount, {
    issRate: fiscal.issRate, regime: fiscal.regime, issRetido: fiscal.issRetido, retencoes: fiscal.retencoes, inssRetido: fiscal.inssRetido, irrfRate: fiscal.irrfRate,
  }, customer?.type === 'pj'), [amount, fiscal, customer]);

  const doEmit = async () => {
    setEmitting(true);
    try {
      const inv = await emitFiscal(
        { serviceOrderId: so.id, customerId: so.customerId, description: `${svc?.name ?? 'Serviço'} · ${customer?.name ?? ''} (item ${fiscal.itemListaServico})`, amount },
        fiscal,
        { documento: customer?.document, nome: customer?.name, pessoaJuridica: customer?.type === 'pj' },
      );
      logChange('emissão', 'fiscal', `NFS-e #${inv.number} (${inv.provider}) · ${customer?.name ?? ''}`, so.id);
      toast(inv.status === 'emitida' ? `NFS-e #${inv.number} emitida (${providerLabel(inv.provider)}).` : inv.status === 'processando' ? `NFS-e #${inv.number} em processamento (${providerLabel(inv.provider)}).` : `NFS-e rejeitada: ${inv.message}`, { tone: inv.status === 'emitida' ? 'success' : inv.status === 'processando' ? 'warning' : 'danger' });
    } finally {
      setEmitting(false);
    }
  };

  const activeProviderLabel = fiscal.provider === 'simulado' ? 'Simulação' : fiscal.backendUrl ? providerLabel(fiscal.provider) : `${providerLabel(fiscal.provider)} (simulação — sem backend)`;

  return (
    <Section title="Fiscal (NFS-e)">
      {so.status !== 'concluida' ? (
        <p className="text-sm text-muted-foreground">A emissão da NFS-e fica disponível após a conclusão do serviço.</p>
      ) : invoice ? (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">NFS-e #{invoice.number} · série {invoice.series}</p>
              <p className="text-xs text-muted-foreground">Emitida em {new Date(invoice.issuedAt).toLocaleDateString('pt-BR')} · {providerLabel(invoice.provider)}</p>
            </div>
            <Badge tone={invoice.status === 'emitida' ? 'success' : invoice.status === 'processando' ? 'warning' : 'danger'} dot>{invoice.status === 'emitida' ? 'Emitida' : invoice.status === 'processando' ? 'Processando' : invoice.status === 'rejeitada' ? 'Rejeitada' : 'Cancelada'}</Badge>
          </div>
          {invoice.accessKey && <p className="mt-1 break-all text-[11px] text-muted-foreground">Chave: {invoice.accessKey}{invoice.verificationCode ? ` · Cód. verificação: ${invoice.verificationCode}` : ''}</p>}
          {invoice.taxes && <TaxBreakdown amount={invoice.amount} t={invoice.taxes} />}
          {invoice.message && <p className="mt-1 text-[11px] text-warning">{invoice.message}</p>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" leftIcon={<Download size={14} />} onClick={() => printNfse(invoice, customer)}>PDF</Button>
            <Button size="sm" variant="outline" leftIcon={<FileCode size={14} />} onClick={() => downloadNfseXml(invoice, customer)}>XML</Button>
            <Button size="sm" variant="ghost" onClick={() => toast('NFS-e enviada ao cliente (simulação).', { tone: 'success' })}>Enviar ao cliente</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Prévia da tributação · {activeProviderLabel}</p>
            <TaxBreakdown amount={amount} t={preview} />
          </div>
          <Button leftIcon={<Receipt size={15} />} onClick={doEmit} disabled={emitting}>{emitting ? 'Emitindo…' : 'Emitir NFS-e'}</Button>
        </div>
      )}
    </Section>
  );
}

/** Detalhamento tributário (ISS + retenções + líquido). */
function TaxBreakdown({ amount, t }: { amount: number; t: import('@/domain/types').InvoiceTaxes }) {
  const row = (label: string, v: number, neg = false) => v ? <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className={neg ? 'text-danger' : 'text-foreground'}>{neg ? '−' : ''}{formatCurrency(v)}</span></div> : null;
  return (
    <div className="mt-2 space-y-0.5 text-xs">
      <div className="flex justify-between"><span className="text-muted-foreground">Valor do serviço</span><span className="font-medium text-foreground">{formatCurrency(amount)}</span></div>
      {row(`ISS (${(t.issRate * 100).toFixed(1)}%)${t.issRetido ? ' retido' : ''}`, t.iss, t.issRetido)}
      {row('IRRF', t.irrf, true)}
      {row('INSS', t.inss, true)}
      {row('PIS', t.pis, true)}
      {row('COFINS', t.cofins, true)}
      {row('CSLL', t.csll, true)}
      <div className="flex justify-between border-t border-border/60 pt-0.5 font-semibold"><span className="text-foreground">Líquido a receber</span><span className="text-brand">{formatCurrency(t.net)}</span></div>
    </div>
  );
}

/** Histórico de alterações e processos da OS — criação, edições (com o que
 *  mudou), emissões fiscais e demais eventos registrados na auditoria. */
function OsHistorySection({ entries }: { entries: AuditEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Section title={`Histórico (${sorted.length})`}>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((e) => (
            <div key={e.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground">{e.description}</span>
                <Badge tone="neutral" className="shrink-0 text-[10px] capitalize">{e.action}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{e.userName ?? 'Sistema'} · {new Date(e.createdAt).toLocaleString('pt-BR')}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</p>{children}</div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/40 p-2.5"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p></div>;
}
