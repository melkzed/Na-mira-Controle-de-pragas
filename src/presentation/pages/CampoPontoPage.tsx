import { useMemo } from 'react';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { PreviewBanner, useFieldTech } from '../components/field/FieldTech';
import { useTimeClockStore } from '@/store/timeClockStore';
import { toast } from '@/store/toastStore';
import { format, localDayKey, parseISO } from '@/lib/date';

/** "Meu Ponto" — controle de jornada do técnico: entrada/saída e histórico. */
export function CampoPontoPage() {
  const { techId } = useFieldTech();
  const entries = useTimeClockStore((s) => s.entries);
  const clock = useTimeClockStore((s) => s.clock);

  const mine = useMemo(() => entries.filter((e) => e.technicianId === techId), [entries, techId]);
  const last = mine[0];
  const isIn = last?.type === 'entrada';

  const today = localDayKey();
  const todayEntries = mine.filter((e) => localDayKey(e.timestamp) === today).slice().reverse();

  const doClock = () => {
    const type = isIn ? 'saida' : 'entrada';
    clock(techId, type);
    toast(type === 'entrada' ? 'Entrada registrada.' : 'Saída registrada.', { tone: 'success' });
  };

  return (
    <div className="mx-auto max-w-md">
      <PreviewBanner />

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-brand to-red-900 p-6 text-center text-white">
          <Clock size={28} className="mx-auto mb-2 opacity-80" />
          <p className="text-sm text-white/80">Status atual</p>
          <p className="text-2xl font-bold">{isIn ? 'Em expediente' : 'Fora de expediente'}</p>
          {last && <p className="mt-1 text-xs text-white/70">Última marcação: {format(parseISO(last.timestamp), 'HH:mm')} · {format(parseISO(last.timestamp), "dd/MM")}</p>}
        </div>
        <CardBody>
          <Button
            className="w-full"
            variant={isIn ? 'danger' : 'primary'}
            size="lg"
            leftIcon={isIn ? <LogOut size={18} /> : <LogIn size={18} />}
            onClick={doClock}
          >
            {isIn ? 'Bater saída' : 'Bater entrada'}
          </Button>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Hoje" subtitle={`${todayEntries.length} marcação(ões)`} />
        <CardBody className="space-y-2">
          {todayEntries.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma marcação hoje.</p>}
          {todayEntries.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
              <Badge tone={e.type === 'entrada' ? 'success' : 'neutral'}>{e.type === 'entrada' ? 'Entrada' : 'Saída'}</Badge>
              <span className="text-foreground">{format(parseISO(e.timestamp), 'HH:mm')}</span>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Histórico" subtitle={`${mine.length} marcação(ões) no total`} />
        <CardBody className="space-y-2">
          {mine.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma marcação registrada ainda.</p>}
          {mine.slice(0, 30).map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
              <Badge tone={e.type === 'entrada' ? 'success' : 'neutral'}>{e.type === 'entrada' ? 'Entrada' : 'Saída'}</Badge>
              <span className="text-foreground">{format(parseISO(e.timestamp), "dd/MM/yyyy 'às' HH:mm")}</span>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
