/**
 * Portal do Cliente — dados cadastrais e contrato.
 *
 * Somente leitura: quem mantém o cadastro é a empresa. O cliente pode pedir
 * correção por aqui, e o pedido chega ao atendimento como notificação.
 */
import { useState } from 'react';
import { Building2, Check, Mail, MapPin, Phone, User as UserIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/misc';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { Field, Textarea } from '../../components/ui/Field';
import { useAppStore } from '@/store/appStore';
import { logChange } from '@/store/auditStore';
import { toast } from '@/store/toastStore';
import { formatDocument } from '@/lib/utils';
import { formatAddress } from '@/lib/geo';
import { fmtDate } from '@/lib/date';
import { usePortalData } from './portalData';

const CONTRACT_LABEL: Record<string, string> = {
  ativo: 'Ativo', vencido: 'Vencido', renovacao_pendente: 'Renovação pendente', cancelado: 'Cancelado',
};

export function PortalPerfilPage() {
  const { customer } = usePortalData();
  const addNotification = useAppStore((s) => s.addNotification);
  const [pedido, setPedido] = useState(false);
  const [texto, setTexto] = useState('');

  if (!customer) return null;

  const enviarPedido = () => {
    if (!texto.trim()) return;
    addNotification({
      title: 'Cliente pediu correção de cadastro',
      body: `${customer.name}: ${texto.trim()}`,
      tone: 'info',
      entityType: 'customer',
      entityId: customer.id,
    });
    logChange('alteração', 'cliente', `Cliente ${customer.name} pediu correção de cadastro: ${texto.trim()}`, customer.id);
    toast('Pedido enviado. A empresa vai revisar seus dados.', { tone: 'success' });
    setPedido(false);
    setTexto('');
  };

  const contratos = customer.contracts ?? [];

  return (
    <div>
      <PageHeader
        title="Meus dados"
        description="Cadastro mantido pela empresa"
        actions={<Button variant="outline" onClick={() => setPedido(true)}>Pedir correção</Button>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Identificação" />
          <CardBody className="space-y-2.5">
            <Item icon={customer.type === 'pj' ? <Building2 size={15} /> : <UserIcon size={15} />} rotulo={customer.type === 'pj' ? 'Razão social' : 'Nome'} valor={customer.name} />
            {customer.companyName && <Item icon={<Building2 size={15} />} rotulo="Nome fantasia" valor={customer.companyName} />}
            <Item icon={<UserIcon size={15} />} rotulo={customer.type === 'pj' ? 'CNPJ' : 'CPF'} valor={formatDocument(customer.document) || '—'} />
            <Item icon={<Phone size={15} />} rotulo="Telefone" valor={customer.phone ?? '—'} />
            <Item icon={<Mail size={15} />} rotulo="E-mail" valor={customer.email ?? '—'} />
            <Item icon={<MapPin size={15} />} rotulo="Endereço" valor={formatAddress(customer) || '—'} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Contatos" subtitle="Quem a empresa procura para agendar" />
          <CardBody className="space-y-2">
            {(customer.contacts ?? []).map((c, i) => (
              <div key={`${c.phone}-${i}`} className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium text-foreground">{c.name || 'Contato'}{c.isPrincipal ? ' · principal' : ''}</p>
                <p className="text-xs text-muted-foreground">{c.phone}{c.role ? ` · ${c.role}` : ''}</p>
              </div>
            ))}
            {(customer.contacts ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum contato adicional cadastrado — usamos o telefone principal.</p>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Contrato" subtitle="Serviços contratados e vigência" />
          <CardBody className="space-y-3">
            {contratos.map((ct) => (
              <div key={ct.id} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={ct.status === 'ativo' ? 'success' : ct.status === 'vencido' ? 'danger' : 'warning'} dot>
                    {CONTRACT_LABEL[ct.status] ?? ct.status}
                  </Badge>
                  {ct.renewal && <span className="text-xs text-muted-foreground">Renovação: {ct.renewal}</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Linha rotulo="Início" valor={ct.startDate ? fmtDate(ct.startDate) : '—'} />
                  <Linha rotulo="Vencimento" valor={ct.endDate ? fmtDate(ct.endDate) : '—'} />
                </div>
                {ct.notes && <p className="mt-2 text-sm text-muted-foreground">{ct.notes}</p>}
              </div>
            ))}
            {contratos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contrato registrado — os atendimentos são avulsos.</p>}

            {(customer.complementaryServices ?? []).length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Serviços complementares</p>
                <div className="flex flex-wrap gap-1.5">
                  {(customer.complementaryServices ?? []).map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Drawer
        open={pedido}
        onClose={() => setPedido(false)}
        title="Pedir correção de cadastro"
        subtitle={customer.name}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setPedido(false)}>Cancelar</Button>
            <Button leftIcon={<Check size={15} />} onClick={enviarPedido} disabled={!texto.trim()}>Enviar</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Quem mantém o cadastro é a empresa. Escreva o que precisa ser corrigido e o atendimento cuida disso.
          </p>
          <Field label="O que está errado ou mudou?" required>
            <Textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: mudamos de endereço, o novo é…" />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}

function Item({ icon, rotulo, valor }: { icon: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{rotulo}</p>
        <p className="text-sm font-medium text-foreground">{valor}</p>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
      <p className="font-medium text-foreground">{valor}</p>
    </div>
  );
}
