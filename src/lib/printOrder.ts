/**
 * Geração de PDF da Ordem de Serviço (client-side, sem dependências).
 * Monta um documento HTML formatado e abre a caixa de impressão do navegador
 * — o usuário escolhe "Salvar como PDF". Funciona offline.
 */
import type { ServiceOrder } from '@/domain/types';
import { getCustomer, getProduct, getServiceType, getUser } from '@/application/repository';
import * as seed from '@/infrastructure/seed/data';
import { formatDocument } from './utils';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtDateTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('pt-BR') : '—';
}

export function printServiceOrder(so: ServiceOrder): void {
  const customer = getCustomer(so.customerId);
  const service = getServiceType(so.serviceTypeId);
  const tech = getUser(so.technicianId);
  const org = seed.orgProfile;

  const address = customer
    ? [customer.street && `${customer.street}, ${customer.number ?? 's/n'}`, customer.district, customer.city && `${customer.city}/${customer.state ?? ''}`, customer.cep && `CEP ${customer.cep}`]
        .filter(Boolean)
        .join(' — ')
    : '';

  const pests = so.pestIds
    .map((id) => seed.pests.find((p) => p.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  const productRows = so.products
    .map((p) => {
      const prod = getProduct(p.productId);
      return `<tr>
        <td>${esc(prod?.name)}</td>
        <td>${esc(prod?.activeIngredient ?? '—')}</td>
        <td class="r">${esc(p.usedQty)} ${esc(prod?.unit ?? '')}</td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>OS ${so.number} — ${esc(customer?.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px; }
  .doc { max-width: 760px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #10b981; padding-bottom: 16px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .logo { width: 44px; height: 44px; border-radius: 10px; background: #10b981; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 20px; }
  .brand h1 { font-size: 16px; margin: 0; }
  .brand p { margin: 2px 0 0; font-size: 12px; color: #64748b; }
  .osno { text-align: right; }
  .osno .n { font-size: 22px; font-weight: 800; color: #10b981; }
  .osno .l { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #10b981; margin: 24px 0 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
  .grid div span { color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 4px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
  td.r, th.r { text-align: right; }
  .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; font-size: 13px; min-height: 44px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
  .sign .line { border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 12px; color: #64748b; }
  .foot { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 0; } @page { margin: 16mm; } }
</style></head>
<body>
  <div class="doc">
    <div class="head">
      <div class="brand">
        <div class="logo">NM</div>
        <div>
          <h1>${esc(org.name)}</h1>
          <p>${esc(org.legalName)} · CNPJ ${esc(org.cnpj)}</p>
          <p>${esc(org.city)}/${esc(org.state)}</p>
        </div>
      </div>
      <div class="osno">
        <div class="l">Ordem de Serviço</div>
        <div class="n">#${esc(so.number)}</div>
        <div class="l">${esc(service?.name ?? '')}</div>
      </div>
    </div>

    <h2>Cliente</h2>
    <div class="grid">
      <div><span>Nome:</span> ${esc(customer?.name)}</div>
      <div><span>Documento:</span> ${esc(formatDocument(customer?.document))}</div>
      <div><span>Telefone:</span> ${esc(customer?.phone ?? '—')}</div>
      <div><span>Tipo de imóvel:</span> ${esc(customer?.propertyType ?? '—')}</div>
      <div style="grid-column:1/3"><span>Endereço:</span> ${esc(address)}</div>
    </div>

    ${customer?.permanentNotes ? `<div style="margin-top:12px;border-left:3px solid #f59e0b;background:#fffbeb;padding:10px 12px;border-radius:6px;font-size:12px"><strong>Observações do contrato:</strong> ${esc(customer.permanentNotes)}</div>` : ''}

    <h2>Execução</h2>
    <div class="grid">
      <div><span>Técnico:</span> ${esc(tech?.name ?? '—')}</div>
      <div><span>Área atendida:</span> ${esc(so.areaTreated ?? '—')}</div>
      <div><span>Início:</span> ${esc(fmtDateTime(so.startedAt))}</div>
      <div><span>Término:</span> ${esc(fmtDateTime(so.finishedAt))}</div>
      <div><span>Tempo total:</span> ${so.totalMinutes ? esc(so.totalMinutes) + ' min' : '—'}</div>
      <div><span>Pragas combatidas:</span> ${esc(pests || '—')}</div>
    </div>

    <h2>Produtos utilizados</h2>
    <table>
      <thead><tr><th>Produto</th><th>Princípio ativo</th><th class="r">Quantidade</th></tr></thead>
      <tbody>${productRows || '<tr><td colspan="3" style="color:#94a3b8">Nenhum produto lançado.</td></tr>'}</tbody>
    </table>

    <h2>Procedimentos e observações</h2>
    <div class="box">${esc(so.procedures ?? '')}${so.notes ? '<br/>' + esc(so.notes) : ''}</div>

    <div class="sign">
      <div class="line">Assinatura do Cliente</div>
      <div class="line">Assinatura do Técnico</div>
    </div>

    <div class="foot">Documento gerado por Na Mira · Controle de Pragas em ${new Date().toLocaleString('pt-BR')}</div>
  </div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 150); };</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=880,height=1000');
  if (!w) {
    alert('Permita pop-ups para gerar o PDF da Ordem de Serviço.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
