import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Select } from '../components/ui/Field';
import { useAuditStore } from '@/store/auditStore';
import { downloadCsv } from '@/lib/export';
import type { Tone } from '../components/ui/Badge';

const ACTION_TONE: Record<string, Tone> = {
  criação: 'success', alteração: 'info', exclusão: 'danger', confirmação: 'brand',
  reagendamento: 'warning', cancelamento: 'danger', inspeção: 'info',
};

export function HistoricoPage() {
  const entries = useAuditStore((s) => s.entries);
  const [entity, setEntity] = useState('todos');
  const [action, setAction] = useState('todos');

  const entityTypes = useMemo(() => [...new Set(entries.map((e) => e.entityType))].sort(), [entries]);
  const actions = useMemo(() => [...new Set(entries.map((e) => e.action))].sort(), [entries]);

  const filtered = useMemo(
    () => entries.filter((e) => (entity === 'todos' || e.entityType === entity) && (action === 'todos' || e.action === action)),
    [entries, entity, action],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach((e) => {
      const day = e.createdAt.slice(0, 10);
      (map.get(day) ?? map.set(day, []).get(day)!).push(e);
    });
    return [...map.entries()];
  }, [filtered]);

  const exportCsv = () => downloadCsv('historico', filtered, [
    { header: 'Data/hora', value: (e) => new Date(e.createdAt).toLocaleString('pt-BR') },
    { header: 'Usuário', value: (e) => e.userName ?? '' },
    { header: 'Ação', value: (e) => e.action },
    { header: 'Módulo', value: (e) => e.entityType },
    { header: 'Descrição', value: (e) => e.description },
  ]);

  return (
    <div>
      <PageHeader
        title="Histórico de alterações"
        description="Registro de auditoria: quem, quando e o que foi alterado"
        actions={<Button variant="outline" leftIcon={<Download size={16} />} onClick={exportCsv}>Exportar CSV</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="w-auto">
          <option value="todos">Todos os módulos</option>
          {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-auto">
          <option value="todos">Todas as ações</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} registro(s)</span>
      </div>

      {grouped.length === 0 ? (
        <Card><CardBody className="py-16 text-center text-sm text-muted-foreground">Nenhum registro de alteração.</CardBody></Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                {new Date(day + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <Card>
                <CardBody className="space-y-1 p-2">
                  {items.map((e, i) => (
                    <motion.div key={e.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.2) }}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-muted/40">
                      <Avatar name={e.userName ?? '—'} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">{e.description}</p>
                        <p className="text-xs text-muted-foreground">{e.userName ?? 'Sistema'} · {new Date(e.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <Badge tone="neutral" className="text-[10px] capitalize">{e.entityType}</Badge>
                      <Badge tone={ACTION_TONE[e.action] ?? 'neutral'} className="capitalize">{e.action}</Badge>
                    </motion.div>
                  ))}
                </CardBody>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
