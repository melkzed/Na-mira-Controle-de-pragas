/**
 * Geração de PDF da Ordem de Serviço (client-side, sem dependências).
 * Monta um documento HTML formatado e abre a caixa de impressão do navegador
 * — o usuário escolhe "Salvar como PDF". Funciona offline.
 */
import type { ServiceOrder } from '@/domain/types';
import { getCustomer, getProduct, getServiceType, getUser } from '@/application/repository';
import * as seed from '@/infrastructure/seed/data';
import { WARRANTY_TYPE_LABEL, RECURRENCE_FREQ_LABEL } from '@/domain/enums';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDocument } from './utils';
import { currentBatch } from './batches';
import { logoSvgMarkup } from './logoSvg';
import { toast } from '@/store/toastStore';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtDateTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('pt-BR') : '—';
}
function fmtDateOnly(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}

/** Texto legível da garantia do serviço. */
function warrantyText(so: ServiceOrder): string {
  const w = so.warranty;
  if (!w || !w.has) return 'Sem garantia';
  const prazo = w.value ? `${w.value} ${w.unit ?? 'dias'}` : '';
  const tipo = w.type ? ` · ${WARRANTY_TYPE_LABEL[w.type]}` : '';
  return `${prazo}${tipo}`.trim() || 'Com garantia';
}

const PHASE_LABEL: Record<string, string> = { antes: 'Antes', durante: 'Durante', apos: 'Após' };
/** Blocos de fotos agrupados por fase (antes/durante/após). */
function photosHtml(so: ServiceOrder): string {
  const phases: ('antes' | 'durante' | 'apos')[] = ['antes', 'durante', 'apos'];
  return phases.map((ph) => {
    const list = (so.photos ?? []).filter((p) => p.phase === ph);
    if (!list.length) return '';
    const imgs = list.map((p) => `<img src="${p.dataUrl}" alt="${esc(p.name ?? ph)}" style="width:150px;height:112px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0" />`).join('');
    return `<p style="margin:8px 0 4px;font-size:12px;color:#64748b"><strong>${PHASE_LABEL[ph]}</strong></p><div style="display:flex;gap:8px;flex-wrap:wrap">${imgs}</div>`;
  }).join('');
}

export function printServiceOrder(so: ServiceOrder, options?: { includePhotos?: boolean }): void {
  const includePhotos = options?.includePhotos ?? true;
  const customer = getCustomer(so.customerId);
  const service = getServiceType(so.serviceTypeId);
  const org = seed.orgProfile;

  // Múltiplos serviços / técnicos.
  const serviceNames = (so.serviceTypeIds?.length ? so.serviceTypeIds : [so.serviceTypeId])
    .map((id) => getServiceType(id)?.name).filter(Boolean).join(', ') || service?.name || '—';
  const techNames = (so.technicianIds?.length ? so.technicianIds : [so.technicianId])
    .map((id) => getUser(id)?.name).filter(Boolean).join(', ') || '—';
  const sellerName = so.sellerId ? getUser(so.sellerId)?.name : undefined;
  const clientType = customer ? (customer.type === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física') : '—';
  const recurrenceText = so.recurrence?.enabled ? (so.recurrence.frequency ? RECURRENCE_FREQ_LABEL[so.recurrence.frequency] : 'Sim') : 'Não';
  const equipNames = (so.equipmentIds ?? []).map((id) => seed.equipment.find((e) => e.id === id)?.name).filter(Boolean).join(', ');

  // Assinaturas e emergência (configuráveis nas Configurações).
  const settings = useSettingsStore.getState();
  const techId = so.technicianIds?.[0] ?? so.technicianId;
  const techSig = so.technicianSignature ?? (techId ? settings.signatures[techId] : undefined);
  const custSig = so.customerSignature;
  const companySig = settings.companySignature;
  const emergencyLine = `${settings.emergencyPhone}${settings.emergencyInfo ? ` — ${settings.emergencyInfo}` : ''}`;
  const sigImg = (src?: string) => (src ? `<img src="${src}" alt="assinatura" style="height:48px;object-fit:contain;margin:0 auto 2px;display:block" />` : '<div style="height:48px"></div>');

  const address = customer
    ? [customer.street && `${customer.street}, ${customer.number ?? 's/n'}`, customer.district, customer.city && `${customer.city}/${customer.state ?? ''}`, customer.cep && `CEP ${customer.cep}`]
        .filter(Boolean)
        .join(' — ')
    : '';

  const pests = so.pestIds
    .map((id) => seed.pests.find((p) => p.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  const fmtBatchDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
  const productRows = so.products
    .map((p) => {
      const prod = getProduct(p.productId);
      const batch = currentBatch(prod);
      return `<tr>
        <td>${esc(prod?.name)}</td>
        <td>${esc(prod?.activeIngredient ?? '—')}</td>
        <td>${esc(batch?.code ?? '—')}</td>
        <td>${esc(fmtBatchDate(batch?.expiresAt))}</td>
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
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #D32F2F; padding-bottom: 16px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .logo { width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .brand h1 { font-size: 16px; margin: 0; }
  .brand p { margin: 2px 0 0; font-size: 12px; color: #64748b; }
  .osno { text-align: right; }
  .osno .n { font-size: 22px; font-weight: 800; color: #D32F2F; }
  .osno .l { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #D32F2F; margin: 24px 0 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
  .grid div span { color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 4px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
  td.r, th.r { text-align: right; }
  .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; font-size: 13px; min-height: 44px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 44px; align-items: end; }
  .sign .line { border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 11px; color: #64748b; }
  .foot { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center; }
  .emg { margin-top: 24px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 8px; padding: 10px 14px; font-size: 12px; }
  @media print { body { padding: 0; } @page { margin: 16mm; } }
</style></head>
<body>
  <div class="doc">
    <div class="head">
      <div class="brand">
        <div class="logo">${logoSvgMarkup(40)}</div>
        <div>
          <h1>${esc(org.name)}</h1>
          <p>${esc(org.legalName)} · CNPJ ${esc(org.cnpj)}</p>
          <p>${esc(org.city)}/${esc(org.state)}</p>
        </div>
      </div>
      <div class="osno">
        <div class="l">Ordem de Serviço</div>
        <div class="n">#${esc(so.number)}</div>
        <div class="l">${esc(serviceNames)}</div>
      </div>
    </div>

    <h2>Cliente</h2>
    <div class="grid">
      <div><span>Nome:</span> ${esc(customer?.name)}</div>
      <div><span>Documento:</span> ${esc(formatDocument(customer?.document))}</div>
      <div><span>Tipo de cliente:</span> ${esc(clientType)}</div>
      <div><span>Tipo de imóvel:</span> ${esc(customer?.propertyType ?? '—')}</div>
      <div><span>Telefone:</span> ${esc(customer?.phone ?? '—')}</div>
      <div><span>Forma de pagamento:</span> ${esc(so.paymentMethod ?? '—')}</div>
      <div style="grid-column:1/3"><span>Endereço:</span> ${esc(address)}</div>
    </div>

    ${customer?.permanentNotes ? `<div style="margin-top:12px;border-left:3px solid #f59e0b;background:#fffbeb;padding:10px 12px;border-radius:6px;font-size:12px"><strong>Observações do contrato:</strong> ${esc(customer.permanentNotes)}</div>` : ''}

    <h2>Serviço</h2>
    <div class="grid">
      <div><span>Serviços executados:</span> ${esc(serviceNames)}</div>
      <div><span>Pragas combatidas:</span> ${esc(pests || '—')}</div>
      <div style="grid-column:1/3"><span>Áreas tratadas:</span> ${esc(so.areaTreated || '—')}</div>
      <div><span>Garantia:</span> ${esc(warrantyText(so))}</div>
      <div><span>Recorrência:</span> ${esc(recurrenceText)}</div>
    </div>

    <h2>Execução</h2>
    <div class="grid">
      <div><span>Técnico(s):</span> ${esc(techNames)}</div>
      ${sellerName ? `<div><span>Vendedor:</span> ${esc(sellerName)}</div>` : ''}
      <div><span>Data de execução:</span> ${esc(so.executionDate ? fmtDateOnly(so.executionDate) : fmtDateOnly(so.startedAt))}</div>
      <div><span>Vencimento:</span> ${esc(fmtDateOnly(so.dueDate))}</div>
      <div><span>Validade do serviço:</span> ${esc(fmtDateOnly(so.validityDate))}</div>
      <div><span>Hora início:</span> ${esc(fmtDateTime(so.startedAt))}</div>
      <div><span>Hora término:</span> ${esc(fmtDateTime(so.finishedAt))}</div>
      <div><span>Tempo total:</span> ${so.totalMinutes ? esc(so.totalMinutes) + ' min' : '—'}</div>
      ${equipNames ? `<div style="grid-column:1/3"><span>Equipamentos utilizados:</span> ${esc(equipNames)}</div>` : ''}
    </div>

    <h2>Produtos utilizados</h2>
    <table>
      <thead><tr><th>Produto</th><th>Princípio ativo</th><th>Lote</th><th>Validade</th><th class="r">Quantidade</th></tr></thead>
      <tbody>${productRows || '<tr><td colspan="5" style="color:#94a3b8">Nenhum produto lançado.</td></tr>'}</tbody>
    </table>

    <h2>Procedimentos e observações</h2>
    <div class="box">${esc(so.procedures ?? '')}${so.notes ? '<br/>' + esc(so.notes) : ''}</div>

    ${includePhotos && so.photos && so.photos.length ? `<h2>Registro fotográfico</h2>${photosHtml(so)}` : ''}

    <div class="emg">
      <strong>Emergência · Centro de Informação Toxicológica (CIT):</strong> ${esc(emergencyLine)}
    </div>

    <div class="sign">
      <div class="line">${sigImg(custSig)}Assinatura do Cliente</div>
      <div class="line">${sigImg(techSig)}${esc(techNames)} · Assinatura do Técnico</div>
      <div class="line">${sigImg(companySig)}${esc(org.name)} · Responsável Técnico</div>
    </div>

    <div class="foot">Documento gerado por Gestão Dedetizadora em ${new Date().toLocaleString('pt-BR')}</div>
  </div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 150); };</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=880,height=1000');
  if (!w) {
    toast('Permita pop-ups para gerar o PDF da Ordem de Serviço.', { tone: 'warning' });
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
