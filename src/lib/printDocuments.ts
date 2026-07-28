/**
 * Documentos padronizados gerados a partir da Ordem de Serviço:
 *  - Certificado de execução de serviço (dedetização/controle de pragas)
 *  - Laudo técnico
 * Reaproveitam os dados da OS, as licenças ativas, a emergência (CIT) e as
 * assinaturas digitais configuradas. Client-side, sem dependências.
 */
import type { License, ServiceOrder } from '@/domain/types';
import { getCustomer, getProduct, getServiceType, getUser } from '@/application/repository';
import * as seed from '@/infrastructure/seed/data';
import { WARRANTY_TYPE_LABEL } from '@/domain/enums';
import { useSettingsStore } from '@/store/settingsStore';
import { useLicensesStore } from '@/store/entityStores';
import { formatDocument } from './utils';
import { toast } from '@/store/toastStore';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const SHELL_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px; }
  .doc { max-width: 800px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #10b981; padding-bottom: 16px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .logo { width: 46px; height: 46px; border-radius: 10px; background: #10b981; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 20px; }
  .brand h1 { font-size: 16px; margin: 0; } .brand p { margin: 2px 0 0; font-size: 12px; color: #64748b; }
  .title { text-align: right; } .title .t { font-size: 20px; font-weight: 800; color: #10b981; } .title .s { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #10b981; margin: 22px 0 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 13px; } .grid span { color: #64748b; }
  .lead { font-size: 14px; line-height: 1.7; text-align: justify; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 4px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f1f5f9; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
  td.r, th.r { text-align: right; }
  .tags span { display: inline-block; border: 1px solid #e2e8f0; border-radius: 999px; padding: 2px 10px; font-size: 12px; margin: 0 4px 4px 0; }
  .lic { font-size: 11.5px; color: #475569; }
  .emg { margin-top: 20px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 8px; padding: 10px 14px; font-size: 12px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 44px; align-items: end; }
  .sign .line { border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 11px; color: #64748b; }
  .foot { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 0; } @page { margin: 15mm; } }
`;

function header(subtitle: string): string {
  const org = seed.orgProfile;
  return `<div class="head">
    <div class="brand"><div class="logo">NM</div><div><h1>${esc(org.name)}</h1><p>${esc(org.legalName)} · CNPJ ${esc(org.cnpj)}</p><p>${esc(org.city)}/${esc(org.state)}</p></div></div>
    <div class="title"><div class="s">${esc(subtitle)}</div><div class="t">${esc(org.name)}</div><div class="s">${new Date().toLocaleDateString('pt-BR')}</div></div>
  </div>`;
}

/** Licenças ativas (não vencidas) para exibir nos documentos. */
function activeLicenses(): License[] {
  return useLicensesStore.getState().items.filter((l) => !l.expiresAt || new Date(l.expiresAt).getTime() >= Date.now());
}
function licensesBlock(): string {
  const lics = activeLicenses();
  if (!lics.length) return '';
  const rows = lics.map((l) => `${esc(l.name)} nº ${esc(l.number ?? '—')} (${esc(l.issuer ?? '—')}${l.expiresAt ? `, val. ${fmtDate(l.expiresAt)}` : ''})`).join(' · ');
  return `<h2>Licenças e autorizações</h2><p class="lic">${rows}</p>`;
}

function warrantyText(so: ServiceOrder): string {
  const w = so.warranty;
  if (!w || !w.has) return 'Sem garantia';
  const prazo = w.value ? `${w.value} ${w.unit ?? 'dias'}` : '';
  const tipo = w.type ? ` · ${WARRANTY_TYPE_LABEL[w.type]}` : '';
  return `${prazo}${tipo}`.trim() || 'Com garantia';
}

function signaturesBlock(so: ServiceOrder, withClient = true): string {
  const s = useSettingsStore.getState();
  const techId = so.technicianIds?.[0] ?? so.technicianId;
  const techSig = so.technicianSignature ?? (techId ? s.signatures[techId] : undefined);
  const img = (src?: string) => (src ? `<img src="${src}" alt="assinatura" style="height:46px;object-fit:contain;margin:0 auto 2px;display:block" />` : '<div style="height:46px"></div>');
  const techNames = (so.technicianIds?.length ? so.technicianIds : [so.technicianId]).map((id) => getUser(id)?.name).filter(Boolean).join(', ') || '—';
  const org = seed.orgProfile;
  const clientCol = withClient ? `<div class="line">${img(so.customerSignature)}Cliente</div>` : '';
  return `<div class="sign">
    ${clientCol}
    <div class="line">${img(techSig)}${esc(techNames)} · Técnico</div>
    <div class="line">${img(s.companySignature)}${esc(org.name)} · Responsável Técnico</div>
  </div>`;
}

function emergencyBlock(): string {
  const s = useSettingsStore.getState();
  return `<div class="emg"><strong>Emergência · Centro de Informação Toxicológica (CIT):</strong> ${esc(s.emergencyPhone)}${s.emergencyInfo ? ` — ${esc(s.emergencyInfo)}` : ''}</div>`;
}

function openPrint(title: string, body: string): void {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${SHELL_CSS}</style></head><body><div class="doc">${body}<div class="foot">Documento gerado por Na Mira · Controle de Pragas em ${new Date().toLocaleString('pt-BR')}</div></div><script>window.onload=function(){setTimeout(function(){window.print();},150);};</script></body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) { toast('Permita pop-ups para gerar o documento.', { tone: 'warning' }); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function serviceNames(so: ServiceOrder): string {
  return (so.serviceTypeIds?.length ? so.serviceTypeIds : [so.serviceTypeId]).map((id) => getServiceType(id)?.name).filter(Boolean).join(', ') || '—';
}
function pestNames(so: ServiceOrder): string {
  return so.pestIds.map((id) => seed.pests.find((p) => p.id === id)?.name).filter(Boolean).join(', ') || '—';
}

/** Certificado de execução do serviço (validade = garantia). */
export function printCertificate(so: ServiceOrder): void {
  const c = getCustomer(so.customerId);
  const address = c ? [c.street && `${c.street}, ${c.number ?? 's/n'}`, c.district, c.city && `${c.city}/${c.state ?? ''}`].filter(Boolean).join(' — ') : '';
  const dataExec = fmtDate(so.executionDate ?? so.finishedAt ?? so.startedAt ?? so.createdAt);
  const validade = so.validityDate ? fmtDate(so.validityDate) : (so.warranty?.has ? warrantyText(so) : '—');

  const body = `${header('Certificado de Serviço')}
    <p class="lead">Certificamos que a empresa <strong>${esc(seed.orgProfile.legalName)}</strong>, inscrita no CNPJ ${esc(seed.orgProfile.cnpj)}, executou serviço de <strong>controle de pragas</strong> conforme os dados abaixo, atendendo às normas sanitárias vigentes.</p>
    <h2>Cliente</h2>
    <div class="grid">
      <div><span>Nome:</span> ${esc(c?.name)}</div>
      <div><span>Documento:</span> ${esc(formatDocument(c?.document))}</div>
      <div><span>Tipo de imóvel:</span> ${esc(c?.propertyType ?? '—')}</div>
      <div><span>Data de execução:</span> ${esc(dataExec)}</div>
      <div style="grid-column:1/3"><span>Endereço:</span> ${esc(address)}</div>
    </div>
    <h2>Serviço executado</h2>
    <div class="grid">
      <div><span>Serviços:</span> ${esc(serviceNames(so))}</div>
      <div><span>Pragas-alvo:</span> ${esc(pestNames(so))}</div>
      <div style="grid-column:1/3"><span>Áreas tratadas:</span> ${esc(so.areaTreated || '—')}</div>
      <div><span>Garantia:</span> ${esc(warrantyText(so))}</div>
      <div><span>Validade do certificado:</span> ${esc(validade)}</div>
    </div>
    ${licensesBlock()}
    ${emergencyBlock()}
    ${signaturesBlock(so, false)}`;
  openPrint(`Certificado · ${c?.name ?? ''}`, body);
}

/** Laudo técnico detalhado do atendimento. */
export function printLaudo(so: ServiceOrder): void {
  const c = getCustomer(so.customerId);
  const address = c ? [c.street && `${c.street}, ${c.number ?? 's/n'}`, c.district, c.city && `${c.city}/${c.state ?? ''}`].filter(Boolean).join(' — ') : '';
  const techNames = (so.technicianIds?.length ? so.technicianIds : [so.technicianId]).map((id) => getUser(id)?.name).filter(Boolean).join(', ') || '—';
  const productRows = so.products.map((p) => {
    const prod = getProduct(p.productId);
    return `<tr><td>${esc(prod?.name)}</td><td>${esc(prod?.activeIngredient ?? '—')}</td><td>${esc(prod?.registrationCode ?? '—')}</td><td class="r">${esc(p.usedQty)} ${esc(prod?.unit ?? '')}</td></tr>`;
  }).join('');

  const body = `${header('Laudo Técnico')}
    <h2>Identificação</h2>
    <div class="grid">
      <div><span>Cliente:</span> ${esc(c?.name)}</div>
      <div><span>Documento:</span> ${esc(formatDocument(c?.document))}</div>
      <div><span>Responsável técnico:</span> ${esc(techNames)}</div>
      <div><span>Data:</span> ${esc(fmtDate(so.executionDate ?? so.finishedAt ?? so.createdAt))}</div>
      <div style="grid-column:1/3"><span>Local:</span> ${esc(address)}</div>
    </div>
    <h2>Diagnóstico</h2>
    <div class="tags">${so.pestIds.map((id) => `<span>${esc(seed.pests.find((p) => p.id === id)?.name)}</span>`).join('') || '—'}</div>
    <h2>Serviços e áreas</h2>
    <div class="grid">
      <div><span>Serviços:</span> ${esc(serviceNames(so))}</div>
      <div><span>Áreas tratadas:</span> ${esc(so.areaTreated || '—')}</div>
    </div>
    <h2>Produtos aplicados</h2>
    <table><thead><tr><th>Produto</th><th>Princípio ativo</th><th>Registro MS</th><th class="r">Quantidade</th></tr></thead>
    <tbody>${productRows || '<tr><td colspan="4" style="color:#94a3b8">Nenhum produto lançado.</td></tr>'}</tbody></table>
    <h2>Procedimentos e recomendações</h2>
    <p class="lead">${esc(so.procedures || 'Não informado.')}</p>
    <div class="grid"><div><span>Garantia:</span> ${esc(warrantyText(so))}</div></div>
    ${licensesBlock()}
    ${emergencyBlock()}
    ${signaturesBlock(so, true)}`;
  openPrint(`Laudo · ${c?.name ?? ''}`, body);
}
