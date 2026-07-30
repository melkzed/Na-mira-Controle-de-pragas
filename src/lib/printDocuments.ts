/**
 * Documentos padronizados gerados a partir da Ordem de Serviço, seguindo o
 * modelo de mercado (CES — Comprovante de Execução de Serviço):
 *  - Certificado Sanitário de Combate a Vetores e Pragas Urbanas
 *  - Laudo Técnico completo (produtos, métodos, pragas, segurança, CIT)
 * Reaproveitam os dados da OS, as licenças ativas, a emergência (CIT) e as
 * assinaturas digitais configuradas. Client-side, sem dependências.
 */
import type { License, Pest, ServiceOrder } from '@/domain/types';
import { getCustomer, getProduct, getServiceType, getUser } from '@/application/repository';
import * as seed from '@/infrastructure/seed/data';
import { WARRANTY_TYPE_LABEL } from '@/domain/enums';
import { useSettingsStore } from '@/store/settingsStore';
import { useLicensesStore } from '@/store/entityStores';
import { currentBatch } from './batches';
import { formatDocument } from './utils';
import { toast } from '@/store/toastStore';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const fmtDateTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const meiaNoite = d.getHours() === 0 && d.getMinutes() === 0;
  return meiaNoite ? d.toLocaleDateString('pt-BR') : d.toLocaleString('pt-BR');
};

/** Números por extenso (conjunto usual de prazos de garantia/validade). */
const EXTENSO: Record<number, string> = {
  1: 'um', 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco', 6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez',
  11: 'onze', 12: 'doze', 15: 'quinze', 18: 'dezoito', 20: 'vinte', 24: 'vinte e quatro', 30: 'trinta',
  45: 'quarenta e cinco', 60: 'sessenta', 90: 'noventa', 120: 'cento e vinte', 180: 'cento e oitenta',
  200: 'duzentos', 365: 'trezentos e sessenta e cinco',
};
function withExtenso(n: number, unit: string): string {
  const word = EXTENSO[n];
  return word ? `${n} (${word}) ${unit}` : `${n} ${unit}`;
}
/** Converte uma quantidade de dias para o texto "X (extenso) meses/dias". */
function daysToExtenso(days: number): string {
  if (days > 0 && days % 30 === 0) return withExtenso(days / 30, days / 30 === 1 ? 'mês' : 'meses');
  return withExtenso(days, days === 1 ? 'dia' : 'dias');
}

const SHELL_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; font-size: 12.5px; }
  .doc { max-width: 800px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #D32F2F; padding-bottom: 16px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .logo { width: 46px; height: 46px; border-radius: 10px; background: #D32F2F; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 20px; flex-shrink: 0; }
  .brand h1 { font-size: 15px; margin: 0; } .brand p { margin: 2px 0 0; font-size: 11.5px; color: #64748b; }
  .title { text-align: right; } .title .t { font-size: 18px; font-weight: 800; color: #D32F2F; } .title .s { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .doctitle { text-align: center; font-size: 16px; font-weight: 800; letter-spacing: .01em; margin: 20px 0 4px; color: #1a1a1a; }
  .doctitle .sub { display: block; font-size: 12px; font-weight: 600; color: #64748b; text-transform: none; margin-top: 2px; }
  .center { text-align: center; }
  h2 { font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; color: #D32F2F; margin: 20px 0 8px; border-bottom: 1px solid #f1d6d6; padding-bottom: 4px; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #475569; margin: 0 0 6px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 12.5px; } .grid span { color: #64748b; }
  .lead { font-size: 13px; line-height: 1.7; text-align: justify; margin: 10px 0; }
  .cesrow { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; background: #fafafa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; font-size: 12px; margin: 14px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #fbebeb; font-size: 9.5px; text-transform: uppercase; letter-spacing: .03em; color: #7a2e2e; }
  td.r, th.r { text-align: right; }
  .tags span { display: inline-block; border: 1px solid #e2e8f0; border-radius: 999px; padding: 2px 10px; font-size: 12px; margin: 0 4px 4px 0; }
  .lic { font-size: 11px; color: #475569; }
  .emg { margin-top: 16px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 8px; padding: 10px 14px; font-size: 12px; }
  .checklist { list-style: none; margin: 6px 0; padding: 0; font-size: 12px; line-height: 1.9; }
  .checklist li:before { content: '✔ '; color: #D32F2F; font-weight: 700; }
  .twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 18px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 40px; align-items: end; }
  .sign2 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; align-items: end; }
  .sign .line, .sign2 .line { border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 11px; color: #64748b; }
  .foot { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 10.5px; color: #94a3b8; text-align: center; }
  .execline { margin-top: 16px; font-size: 12.5px; }
  .page2 { page-break-before: always; padding-top: 40px; }
  @media print { body { padding: 0; } @page { margin: 15mm; } }
`;

function header(subtitle: string): string {
  const org = seed.orgProfile;
  return `<div class="head">
    <div class="brand"><div class="logo">NM</div><div><h1>${esc(org.name)}</h1><p>${esc(org.legalName)} · CNPJ ${esc(org.cnpj)}</p><p>${esc(org.street)}, ${esc(org.district)} · ${esc(org.city)}/${esc(org.state)} · CEP ${esc(org.cep)}</p></div></div>
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
  const rows = lics.map((l) => `${esc(l.name)}: ${esc(l.number ?? '—')}${l.expiresAt ? ` · Validade: ${fmtDate(l.expiresAt)}` : ''}`).join(' &nbsp;|&nbsp; ');
  return `<p class="lic">${rows}</p>`;
}

function warrantyText(so: ServiceOrder): string {
  const w = so.warranty;
  if (!w || !w.has) return 'Sem garantia';
  if (w.value) return withExtenso(w.value, w.unit === 'dias' ? (w.value === 1 ? 'dia' : 'dias') : (w.value === 1 ? 'mês' : 'meses'));
  return 'Com garantia';
}
function warrantyNote(so: ServiceOrder): string {
  const w = so.warranty;
  if (!w?.has) return '';
  const tipo = w.type ? ` · ${WARRANTY_TYPE_LABEL[w.type]}` : '';
  return `Garantia de ${warrantyText(so)}${tipo}.`;
}

/** Texto de garantia/validade específico da praga (usa o cadastro da praga; sem isso, cai na garantia geral da OS). */
function pestWarrantyText(pest: Pest | undefined, so: ServiceOrder): string {
  if (pest?.defaultWarrantyDays != null) return daysToExtenso(pest.defaultWarrantyDays);
  return warrantyText(so);
}
function pestValidityDate(pest: Pest | undefined, so: ServiceOrder): string {
  const base = so.executionDate ?? so.finishedAt ?? so.startedAt ?? so.createdAt;
  if (pest?.defaultValidityDays != null && base) {
    const d = new Date(base);
    d.setDate(d.getDate() + pest.defaultValidityDays);
    return fmtDate(d.toISOString());
  }
  return so.validityDate ? fmtDate(so.validityDate) : '—';
}

function signaturesBlock(so: ServiceOrder, withClient = true): string {
  const s = useSettingsStore.getState();
  const techId = so.technicianIds?.[0] ?? so.technicianId;
  const techSig = so.technicianSignature ?? (techId ? s.signatures[techId] : undefined);
  const img = (src?: string) => (src ? `<img src="${src}" alt="assinatura" style="height:46px;object-fit:contain;margin:0 auto 2px;display:block" />` : '<div style="height:46px"></div>');
  const techNames = (so.technicianIds?.length ? so.technicianIds : [so.technicianId]).map((id) => getUser(id)?.name).filter(Boolean).join(', ') || '—';
  const c = getCustomer(so.customerId);
  if (withClient) {
    return `<div class="sign2 page2">
      <div class="line">${img(so.customerSignature)}${esc(c?.name ?? 'Cliente')}${c?.document ? `<br/>${esc(formatDocument(c.document))}` : ''}<br/>Assinatura Cliente</div>
      <div class="line">${img(techSig)}${esc(techNames)}<br/>Técnico de Execução</div>
    </div>`;
  }
  return `<div class="sign">
    <div class="line">${img(techSig)}${esc(techNames)} · Técnico</div>
  </div>`;
}

function emergencyBlock(): string {
  const s = useSettingsStore.getState();
  return `<div class="emg"><strong>Informações toxicológicas:</strong> Suspeita de intoxicação ligar para o CEATOX ${esc(s.emergencyPhone)}${s.emergencyInfo ? ` — ${esc(s.emergencyInfo)}` : ''}</div>`;
}

function openPrint(title: string, body: string): void {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${SHELL_CSS}</style></head><body><div class="doc">${body}<div class="foot">Documento gerado por Gestão Dedetizadora em ${new Date().toLocaleString('pt-BR')}</div></div><script>window.onload=function(){setTimeout(function(){window.print();},150);};</script></body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) { toast('Permita pop-ups para gerar o documento.', { tone: 'warning' }); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function serviceNames(so: ServiceOrder): string {
  return (so.serviceTypeIds?.length ? so.serviceTypeIds : [so.serviceTypeId]).map((id) => getServiceType(id)?.name).filter(Boolean).join(' + ') || '—';
}
function osPests(so: ServiceOrder): (Pest | undefined)[] {
  return so.pestIds.map((id) => seed.pests.find((p) => p.id === id));
}
function address(c: ReturnType<typeof getCustomer>): string {
  return c ? [c.street && `${c.street}, ${c.number ?? 's/n'}`, c.district, c.city && `${c.city}/${c.state ?? ''}`].filter(Boolean).join(' — ') : '';
}

/** Certificado Sanitário de Combate a Vetores e Pragas Urbanas (CES). */
export function printCertificate(so: ServiceOrder): void {
  const c = getCustomer(so.customerId);
  const org = seed.orgProfile;
  const dataExec = fmtDate(so.executionDate ?? so.finishedAt ?? so.startedAt ?? so.createdAt);
  const validade = so.validityDate ? fmtDate(so.validityDate) : '—';
  const pests = osPests(so);

  const productRows = so.products.map((p) => {
    const prod = getProduct(p.productId);
    return `<tr><td>${esc(prod?.name)}</td><td>${esc(prod?.chemicalGroup ?? '—')}</td><td>${esc(prod?.registrationCode ?? '—')}</td><td class="r">${esc(p.usedQty)} ${esc(prod?.unit ?? '')}</td><td>${esc(prod?.dosage ?? '—')}</td></tr>`;
  }).join('');

  const body = `${header('Certificado Sanitário')}
    <p class="doctitle">CERTIFICADO SANITÁRIO DE COMBATE A VETORES E PRAGAS URBANAS</p>
    <p class="lead">A <strong>${esc(org.legalName)}</strong>, CNPJ ${esc(org.cnpj)}, declara para os devidos fins que prestou serviço(s) para <strong>${esc(c?.name)}</strong>, CPF/CNPJ ${esc(formatDocument(c?.document))}, situado à ${esc(address(c))}, conforme área tratada, pragas-alvo, produtos químicos e garantia abaixo descritos.</p>

    <div class="cesrow">
      <span><strong>CES — Comprovante de Execução de Serviço:</strong> ${esc(so.number)}</span>
      <span><strong>Validade do Certificado:</strong> ${esc(validade)}</span>
    </div>

    <div class="grid">
      <div style="grid-column:1/3"><span>Serviço(s):</span> ${esc(serviceNames(so))} [${esc(warrantyText(so))}]</div>
      <div style="grid-column:1/3"><span>Área tratada:</span> ${esc(so.areaTreated || '—')}</div>
      ${warrantyNote(so) ? `<div style="grid-column:1/3"><span>Garantia:</span> ${esc(warrantyNote(so))}</div>` : ''}
      <div style="grid-column:1/3"><span>Praga(s)/Garantia:</span> ${pests.map((p) => `${esc(p?.name)} [${esc(pestWarrantyText(p, so))}]`).join(', ') || '—'}</div>
    </div>

    <h2>Produto(s) químico(s) empregado(s)</h2>
    <table><thead><tr><th>Produto</th><th>Grupo Químico</th><th>Registro MS</th><th class="r">Quantidade Aplicada</th><th>Concentração de Uso</th></tr></thead>
    <tbody>${productRows || '<tr><td colspan="5" style="color:#94a3b8">Nenhum produto lançado.</td></tr>'}</tbody></table>

    <p class="execline"><strong>Data de execução do serviço:</strong> ${esc(dataExec)}</p>

    ${signaturesBlock(so, false)}
    ${emergencyBlock()}
    ${licensesBlock()}`;
  openPrint(`Certificado · ${c?.name ?? ''}`, body);
}

/** Medidas de segurança / orientações padrão pós-tratamento. */
const SAFETY_MEASURES = [
  'Aguardar no mínimo 2 a 6 (duas a seis) horas para permitir o ingresso de pessoas e animais',
  'Abrir as janelas para arejar o ambiente antes de ocupar o local desinfectado',
  'Observar um prazo maior para acesso de crianças, idosos e pessoas alérgicas ao local tratado',
  'Lavar com detergente as louças e utensílios expostos aos vapores do inseticida',
  'Aguardar 72 horas para limpar o ambiente tratado',
  'O produto possui eficácia de até 3 meses, a depender da manutenção do cliente',
  'Desocupação do local onde será aplicado o produto por parte do cliente',
  'Não retornamos ao local para retirada das pragas',
];

/** Laudo técnico detalhado do atendimento (CES completo). */
export function printLaudo(so: ServiceOrder): void {
  const c = getCustomer(so.customerId);
  const org = seed.orgProfile;
  const techIds = so.technicianIds?.length ? so.technicianIds : [so.technicianId];
  const techName = getUser(techIds[0])?.name ?? '—';
  const helperName = techIds[1] ? getUser(techIds[1])?.name : undefined;
  const dataHora = fmtDateTime(so.startedAt ?? so.executionDate ?? so.createdAt);
  const validade = so.validityDate ? fmtDate(so.validityDate) : '—';
  const pests = osPests(so);

  const productRows = so.products.map((p) => {
    const prod = getProduct(p.productId);
    const batch = currentBatch(prod);
    return `<tr>
      <td>${esc(prod?.chemicalGroup ?? '—')}</td>
      <td>${esc(prod?.name)}</td>
      <td>${esc(prod?.activeIngredient ?? '—')}</td>
      <td>${esc(batch?.code ?? '—')}</td>
      <td>${esc(batch?.expiresAt ? fmtDate(batch.expiresAt) : '—')}</td>
      <td>${esc(prod?.registrationCode ?? '—')}</td>
      <td>${esc(prod?.applicationType ?? '—')}</td>
      <td class="r">${esc(p.usedQty)} ${esc(prod?.unit ?? '')}</td>
      <td>${esc(prod?.antidote ?? '—')}</td>
    </tr>`;
  }).join('');

  const pestRows = pests.map((p) => `<tr><td>${esc(p?.name)}</td><td>${esc(pestWarrantyText(p, so))}</td><td>${esc(pestValidityDate(p, so))}</td></tr>`).join('');

  const body = `${header('Laudo Técnico')}
    <div class="grid">
      <div style="grid-column:1/2">
        <strong>${esc(org.name)}</strong><br/>
        CNPJ ${esc(org.cnpj)}<br/>
        ${esc(org.street)}<br/>
        ${esc(org.district)} | ${esc(org.city)}-${esc(org.state)}<br/>
        CEP: ${esc(org.cep)} | Telefone: ${esc(org.phone)}
      </div>
      <div style="grid-column:2/3">
        <strong>${esc(c?.name)}</strong><br/>
        ${esc(c?.companyName ?? c?.name)}<br/>
        ${esc(formatDocument(c?.document))}<br/>
        ${esc(c?.street)}, ${esc(c?.number ?? 's/n')} ${esc(c?.complement ?? '')}<br/>
        ${esc(c?.district)} | ${esc(c?.city)}-${esc(c?.state)}<br/>
        CEP: ${esc(c?.cep)} Fone: ${esc(c?.phone)}
      </div>
    </div>

    <div class="cesrow">
      <span><strong>CES:</strong> ${esc(so.number)}</span>
      <span><strong>Data/Hora Execução:</strong> ${esc(dataHora)}</span>
      <span><strong>Técnico:</strong> ${esc(techName)}</span>
      <span><strong>Ajudante:</strong> ${esc(helperName ?? '—')}</span>
    </div>

    <p class="doctitle">CES — COMPROVANTE DE EXECUÇÃO DE SERVIÇO<span class="sub">Controle de pragas</span></p>
    <p class="center">Validade ${esc(validade)}</p>

    <table><thead><tr><th>Serviço</th><th>Validade</th></tr></thead>
    <tbody><tr><td>${esc(serviceNames(so))}</td><td>${esc(warrantyText(so))}</td></tr></tbody></table>

    <h2>Produtos químicos e métodos empregados</h2>
    <table><thead><tr><th>Grupo Químico</th><th>Produto(s)</th><th>Princípio Ativo</th><th>Nº Lote</th><th>Validade</th><th>Reg. M.S.</th><th>Equipamento(s)</th><th class="r">Qtd. Aplicada</th><th>Antídoto</th></tr></thead>
    <tbody>${productRows || '<tr><td colspan="9" style="color:#94a3b8">Nenhum produto lançado.</td></tr>'}</tbody></table>

    <h2>Praga(s) combatida(s)</h2>
    <table><thead><tr><th>Praga</th><th>Garantia</th><th>Validade</th></tr></thead>
    <tbody>${pestRows || '<tr><td colspan="3" style="color:#94a3b8">—</td></tr>'}</tbody></table>

    <h2>Observações para execução e/ou local tratamento pragas</h2>
    <p class="lead">${esc(so.areaTreated || 'Não informado.')}</p>
    ${so.procedures ? `<p class="lead">${esc(so.procedures)}</p>` : ''}

    <h2>Garantia</h2>
    <p class="lead">${esc(warrantyNote(so) || 'Conforme contratado, descrito na Garantia/Validade acima.')}</p>

    <h2>Medidas de Segurança / Orientações</h2>
    <ul class="checklist">${SAFETY_MEASURES.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>

    <div class="twocol">
      <div>
        <h3>Dados do Responsável Técnico</h3>
        <div class="sign"><div class="line" style="grid-column:1/4">${esc(org.technicalResponsibleName)}<br/>${esc(org.technicalResponsibleRole)}<br/>${esc(org.technicalResponsibleRegistry)}</div></div>
      </div>
      <div>
        <h3>Dados de Emergência (CIT)</h3>
        <p>Suspeita de intoxicação ligar para o CEATOX ${esc(useSettingsStore.getState().emergencyPhone)}</p>
      </div>
    </div>
    ${licensesBlock()}
    ${signaturesBlock(so, true)}`;
  openPrint(`Laudo · ${c?.name ?? ''}`, body);
}
