import { Plus, Truck } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import * as seed from '@/infrastructure/seed/data';
import { getUser } from '@/application/repository';
import { formatNumber } from '@/lib/utils';

export function VeiculosPage() {
  return (
    <div>
      <PageHeader title="Veículos" description="Frota, abastecimentos e manutenções" actions={<Button leftIcon={<Plus size={16} />}>Novo veículo</Button>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {seed.vehicles.map((v) => {
          const driver = getUser(v.driverId);
          return (
            <Card key={v.id} hover className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand"><Truck size={22} /></div>
                <Badge tone={v.inOperation ? 'brand' : 'neutral'} dot>{v.inOperation ? 'Em operação' : 'Na base'}</Badge>
              </div>
              <p className="mt-3 text-lg font-bold tracking-tight text-foreground">{v.plate}</p>
              <p className="text-sm text-muted-foreground">{v.model}</p>
              <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Motorista</span>{driver ? <span className="flex items-center gap-1.5 font-medium text-foreground"><Avatar name={driver.name} size="xs" />{driver.name.split(' ')[0]}</span> : '—'}</div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Quilometragem</span><span className="font-medium text-foreground">{formatNumber(v.odometerKm)} km</span></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Mini label="Abastec." value="8" />
                <Mini label="Manut." value="2" />
                <Mini label="Seguro" value="OK" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/40 p-2 text-center"><p className="text-sm font-bold text-foreground">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>;
}
