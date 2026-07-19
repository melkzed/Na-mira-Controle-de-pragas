import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Field, Input, Select } from '../components/ui/Field';
import { useLeadsStore, type LeadInput } from '@/store/leadsStore';
import { getUser } from '@/application/repository';
import { users } from '@/infrastructure/seed/data';
import { CRM_STAGE_META, type CrmStage } from '@/domain/enums';
import type { CrmLead } from '@/domain/types';
import { formatCompactCurrency } from '@/lib/utils';

const STAGES: CrmStage[] = ['novo_contato', 'orcamento', 'negociacao', 'follow_up', 'ganho', 'perdido'];
const STAGE_ORDER = STAGES;

export function CrmPage() {
  const { leads, add, setStage, remove } = useLeadsStore();
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<CrmLead | null>(null);

  const totalPipeline = leads
    .filter((l) => !['ganho', 'perdido'].includes(l.stage))
    .reduce((s, l) => s + (l.estimatedValue ?? 0), 0);

  const advance = (lead: CrmLead) => {
    const idx = STAGE_ORDER.indexOf(lead.stage);
    if (idx < STAGE_ORDER.length - 1) setStage(lead.id, STAGE_ORDER[idx + 1]);
  };

  return (
    <div>
      <PageHeader
        title="CRM · Funil de vendas"
        description={`Pipeline ativo: ${formatCompactCurrency(totalPipeline)} · ${leads.length} leads`}
        actions={<Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Novo lead</Button>}
      />

      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-[980px] gap-3">
          {STAGES.map((stage) => {
            const meta = CRM_STAGE_META[stage];
            const stageLeads = leads.filter((l) => l.stage === stage);
            const total = stageLeads.reduce((s, l) => s + (l.estimatedValue ?? 0), 0);
            return (
              <div key={stage} className="flex w-64 shrink-0 flex-col">
                <div className="mb-2 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                    <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                    <span className="text-xs text-muted-foreground">{stageLeads.length}</span>
                  </div>
                </div>
                <p className="mb-2 px-1 text-xs text-muted-foreground">{formatCompactCurrency(total)}</p>
                <div className="flex-1 space-y-2 rounded-2xl bg-muted/40 p-2">
                  {stageLeads.map((lead, i) => (
                    <motion.div
                      key={lead.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.04, 0.3) }}
                      whileHover={{ y: -2 }}
                      onClick={() => setSelected(lead)}
                      className="group cursor-pointer rounded-xl border border-border bg-surface p-3 shadow-soft"
                    >
                      <p className="text-sm font-semibold text-foreground">{lead.name}</p>
                      {lead.company && <p className="text-xs text-muted-foreground">{lead.company}</p>}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-bold" style={{ color: meta.color }}>{formatCompactCurrency(lead.estimatedValue ?? 0)}</span>
                        {lead.source && <Badge tone="neutral" className="text-[10px]">{lead.source}</Badge>}
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                        {lead.ownerId ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar name={getUser(lead.ownerId)?.name ?? '?'} size="xs" />
                            <span className="text-[11px] text-muted-foreground">{getUser(lead.ownerId)?.name?.split(' ')[0]}</span>
                          </div>
                        ) : <span />}
                        {!['ganho', 'perdido'].includes(lead.stage) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); advance(lead); }}
                            className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-brand opacity-0 transition hover:bg-brand-soft group-hover:opacity-100"
                            title="Avançar etapa"
                          >
                            avançar <ChevronRight size={12} />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {stageLeads.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground/60">Vazio</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LeadForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(input) => { add(input); setFormOpen(false); }} />
      <LeadDetail
        lead={selected}
        onClose={() => setSelected(null)}
        onStage={(s) => selected && setStage(selected.id, s)}
        onDelete={() => { if (selected) { remove(selected.id); setSelected(null); } }}
      />
    </div>
  );
}

function LeadForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (i: LeadInput) => void }) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('Indicação');
  const [stage, setStage] = useState<CrmStage>('novo_contato');
  const [value, setValue] = useState('');
  const [ownerId, setOwnerId] = useState(users[0].id);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) { setName(''); setCompany(''); setPhone(''); setSource('Indicação'); setStage('novo_contato'); setValue(''); setOwnerId(users[0].id); setTouched(false); }
  }, [open]);

  const submit = () => {
    setTouched(true);
    if (!name.trim()) return;
    onSave({ name: name.trim(), company: company.trim() || undefined, phone: phone.trim() || undefined, source, stage, estimatedValue: value ? Number(value) : undefined, ownerId });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Novo lead" subtitle="Cadastro no funil de vendas"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!name.trim()}>Adicionar</Button></div>}>
      <div className="space-y-4">
        <Field label="Nome / contato" required><Input value={name} onChange={(e) => setName(e.target.value)} />{touched && !name.trim() && <span className="mt-1 block text-xs text-danger">Informe o nome.</span>}</Field>
        <Field label="Empresa"><Input value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Telefone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Origem">
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              {['Indicação', 'Site', 'WhatsApp', 'Anúncio', 'Telefone'].map((o) => <option key={o}>{o}</option>)}
            </Select>
          </Field>
          <Field label="Valor estimado (R$)"><Input value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" /></Field>
          <Field label="Etapa">
            <Select value={stage} onChange={(e) => setStage(e.target.value as CrmStage)}>
              {STAGES.map((s) => <option key={s} value={s}>{CRM_STAGE_META[s].label}</option>)}
            </Select>
          </Field>
          <Field label="Responsável" className="col-span-2">
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {users.filter((u) => u.role !== 'tecnico').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        </div>
      </div>
    </Drawer>
  );
}

function LeadDetail({ lead, onClose, onStage, onDelete }: { lead: CrmLead | null; onClose: () => void; onStage: (s: CrmStage) => void; onDelete: () => void }) {
  if (!lead) return null;
  return (
    <Drawer open={!!lead} onClose={onClose} title={lead.name} subtitle={lead.company}
      footer={<div className="flex justify-between"><Button variant="ghost" className="text-danger" leftIcon={<Trash2 size={15} />} onClick={onDelete}>Excluir</Button><Button onClick={onClose}>Fechar</Button></div>}>
      <div className="space-y-4">
        <Field label="Etapa do funil">
          <Select value={lead.stage} onChange={(e) => onStage(e.target.value as CrmStage)}>
            {STAGES.map((s) => <option key={s} value={s}>{CRM_STAGE_META[s].label}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Info label="Valor estimado" value={formatCompactCurrency(lead.estimatedValue ?? 0)} />
          <Info label="Origem" value={lead.source ?? '—'} />
          <Info label="Telefone" value={lead.phone ?? '—'} />
          <Info label="Responsável" value={getUser(lead.ownerId)?.name ?? '—'} />
        </div>
        {lead.notes && <Info label="Observações" value={lead.notes} />}
      </div>
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/40 p-2.5"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p></div>;
}
