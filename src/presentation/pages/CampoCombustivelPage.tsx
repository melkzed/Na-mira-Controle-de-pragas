import { useMemo, useState } from 'react';
import { Check, Fuel, Trash2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { PreviewBanner, useFieldTech } from '../components/field/FieldTech';
import { useFuelLogsStore } from '@/store/fuelLogsStore';
import { useVehiclesStore } from '@/store/entityStores';
import { toast } from '@/store/toastStore';
import { fmtDate } from '@/lib/date';

/** Controle de combustível × quilometragem — abastecimento, distância percorrida e consumo médio. */
export function CampoCombustivelPage() {
  const { techId } = useFieldTech();
  const vehicles = useVehiclesStore((s) => s.items);
  const myVehicle = vehicles.find((v) => v.driverId === techId);
  const logs = useFuelLogsStore((s) => s.logs);
  const add = useFuelLogsStore((s) => s.add);
  const remove = useFuelLogsStore((s) => s.remove);

  const mine = useMemo(() => logs.filter((l) => l.technicianId === techId), [logs, techId]);

  const [odometerStart, setOdometerStart] = useState(myVehicle ? String(myVehicle.odometerKm) : '');
  const [odometerEnd, setOdometerEnd] = useState('');
  const [liters, setLiters] = useState('');
  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);

  const distance = Number(odometerEnd) - Number(odometerStart);
  const consumption = distance > 0 && Number(liters) > 0 ? distance / Number(liters) : null;

  const valid = odometerStart && odometerEnd && liters && amount && distance > 0;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    add({
      technicianId: techId,
      vehicleId: myVehicle?.id,
      date: new Date().toISOString(),
      odometerStart: Number(odometerStart),
      odometerEnd: Number(odometerEnd),
      liters: Number(liters),
      amount: Number(amount),
    });
    toast('Abastecimento registrado.', { tone: 'success' });
    setOdometerStart(odometerEnd); setOdometerEnd(''); setLiters(''); setAmount(''); setTouched(false);
  };

  return (
    <div className="mx-auto max-w-md">
      <PreviewBanner />

      <Card>
        <CardHeader title="Novo abastecimento" subtitle={myVehicle ? `Veículo: ${myVehicle.plate}` : undefined} />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Km inicial" required><Input type="number" inputMode="numeric" value={odometerStart} onChange={(e) => setOdometerStart(e.target.value)} /></Field>
            <Field label="Km final" required><Input type="number" inputMode="numeric" value={odometerEnd} onChange={(e) => setOdometerEnd(e.target.value)} /></Field>
            <Field label="Litros abastecidos" required><Input type="number" step="0.01" inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} /></Field>
            <Field label="Valor abastecido (R$)" required><Input type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          </div>
          {touched && !valid && <p className="text-xs text-danger">Preencha todos os campos — km final deve ser maior que o inicial.</p>}
          {consumption != null && (
            <div className="rounded-lg border border-border bg-muted/40 p-2.5 text-sm">
              <span className="text-muted-foreground">Distância: </span><span className="font-semibold text-foreground">{distance} km</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="text-muted-foreground">Consumo médio: </span><span className="font-semibold text-foreground">{consumption.toFixed(1)} km/L</span>
            </div>
          )}
          <Button className="w-full" leftIcon={<Check size={16} />} onClick={submit}>Registrar</Button>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Histórico" subtitle={`${mine.length} abastecimento(s)`} />
        <CardBody className="space-y-2">
          {mine.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum abastecimento registrado ainda.</p>}
          {mine.map((l) => {
            const d = l.odometerEnd - l.odometerStart;
            const c = l.liters > 0 ? d / l.liters : 0;
            return (
              <div key={l.id} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><Fuel size={16} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{fmtDate(l.date)} · {d} km · {c.toFixed(1)} km/L</p>
                  <p className="text-xs text-muted-foreground">{l.liters} L · R$ {l.amount.toFixed(2)}</p>
                </div>
                <button onClick={() => remove(l.id)} aria-label="Excluir registro" className="text-muted-foreground hover:text-danger"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
