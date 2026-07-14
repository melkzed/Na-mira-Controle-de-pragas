import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { crmLeads } from '@/infrastructure/seed/data';
import { getUser } from '@/application/repository';
import { CRM_STAGE_META, type CrmStage } from '@/domain/enums';
import type { CrmLead } from '@/domain/types';
import { formatCompactCurrency } from '@/lib/utils';

const STAGES: CrmStage[] = ['novo_contato', 'orcamento', 'negociacao', 'follow_up', 'ganho', 'perdido'];

export function CrmPage() {
  const [leads] = useState<CrmLead[]>(crmLeads);
  const totalPipeline = leads.filter((l) => !['ganho', 'perdido'].includes(l.stage)).reduce((s, l) => s + (l.estimatedValue ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="CRM · Funil de vendas"
        description={`Pipeline ativo: ${formatCompactCurrency(totalPipeline)}`}
        actions={<Button leftIcon={<Plus size={16} />}>Novo lead</Button>}
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
                      transition={{ delay: i * 0.04 }}
                      whileHover={{ y: -2 }}
                      className="cursor-grab rounded-xl border border-border bg-surface p-3 shadow-soft active:cursor-grabbing"
                    >
                      <p className="text-sm font-semibold text-foreground">{lead.name}</p>
                      {lead.company && <p className="text-xs text-muted-foreground">{lead.company}</p>}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-bold" style={{ color: meta.color }}>{formatCompactCurrency(lead.estimatedValue ?? 0)}</span>
                        {lead.source && <Badge tone="neutral" className="text-[10px]">{lead.source}</Badge>}
                      </div>
                      {lead.ownerId && (
                        <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
                          <Avatar name={getUser(lead.ownerId)?.name ?? '?'} size="xs" />
                          <span className="text-[11px] text-muted-foreground">{getUser(lead.ownerId)?.name}</span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {stageLeads.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground/60">Vazio</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
