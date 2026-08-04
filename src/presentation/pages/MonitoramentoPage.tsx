import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Radar } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Select } from '../components/ui/Field';
import { useCustomersStore } from '@/store/customersStore';
import { useTrapsStore } from '@/store/trapsStore';
import { TrapsPanel } from '../components/client/TrapsPanel';
import { printMipReport, printTrapReport } from '@/lib/printReports';

/**
 * Monitoramento de armadilhas — visão consolidada para navegação livre entre
 * clientes e emissão de relatórios (MIP / Armadilhas). O mesmo painel de
 * armadilhas também aparece embutido diretamente no cadastro de cada cliente
 * (ClientesPage), para acesso rápido no contexto do atendimento.
 */
export function MonitoramentoPage() {
  const [params, setParams] = useSearchParams();
  const customers = useCustomersStore((s) => s.customers);
  const { traps, inspections } = useTrapsStore();

  const monitored = customers.filter((c) => c.monitoringContracted);
  const [customerId, setCustomerId] = useState(params.get('client') ?? monitored[0]?.id ?? '');
  const customer = customers.find((c) => c.id === customerId);
  useEffect(() => { setParams(customerId ? { client: customerId } : {}, { replace: true }); }, [customerId, setParams]);

  const custTraps = traps.filter((t) => t.customerId === customerId);

  if (monitored.length === 0) {
    return (
      <div>
        <PageHeader title="Monitoramento" description="Armadilhas e MIP" />
        <Card><CardBody className="py-16 text-center">
          <Radar size={28} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nenhum cliente com monitoramento contratado</p>
          <p className="mt-1 text-sm text-muted-foreground">Ative "Monitoramento contratado" no cadastro do cliente para habilitar armadilhas e MIP.</p>
        </CardBody></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Monitoramento de Armadilhas"
        description="Controle de dispositivos, inspeções e MIP dos clientes com monitoramento"
        actions={
          <>
            <Button variant="outline" leftIcon={<FileText size={16} />} onClick={() => customer && printMipReport(customer, custTraps, inspections)}>Relatório MIP</Button>
            <Button variant="outline" leftIcon={<FileText size={16} />} onClick={() => customer && printTrapReport(customer, custTraps, inspections)}>Rel. Armadilhas</Button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Cliente:</span>
        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="sm:max-w-xs">
          {monitored.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {customerId && <TrapsPanel customerId={customerId} />}
    </div>
  );
}
