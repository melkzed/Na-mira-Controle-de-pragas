/**
 * Documentos padronizados gerados a partir da Ordem de Serviço, seguindo o
 * modelo de mercado (CES — Comprovante de Execução de Serviço):
 *  - Certificado Sanitário de Combate a Vetores e Pragas Urbanas
 *  - Laudo Técnico completo (produtos, métodos, pragas, segurança, CIT)
 * Layout compacto (fonte reduzida, colunas no checklist) para caber em uma
 * única folha sempre que possível. Reaproveitam os dados da OS, as licenças
 * ativas, a emergência (CIT) e as assinaturas digitais configuradas.
 * Client-side, sem dependências.
 */
import { parseISO } from 'date-fns';
import type { License, Pest, Product, ServiceOrder } from '@/domain/types';
import { getCustomer, getPest, getProduct, getServiceType, getUser } from '@/application/repository';
import { useSettingsStore } from '@/store/settingsStore';
import { useLicensesStore } from '@/store/entityStores';
import { getOrgProfile } from '@/store/orgProfileStore';
import { currentBatch } from './batches';
import { formatDocument } from './utils';
import { formatAddress } from './geo';
import { logoSvgMarkup } from './logoSvg';
import { toast } from '@/store/toastStore';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Usa parseISO (date-fns) em vez de `new Date(iso)`: strings de data pura
// (YYYY-MM-DD, sem hora) são interpretadas como UTC pelo construtor nativo,
// o que desloca a data em um dia em fusos negativos como o do Brasil.
// parseISO trata esse mesmo formato corretamente como horário local.
export const fmtDate = (iso?: string) => (iso ? parseISO(iso).toLocaleDateString('pt-BR') : '—');
export const fmtDateTime = (iso?: string) => {
  if (!iso) return '—';
  const d = parseISO(iso);
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

/** CSS compacto e com borda decorativa — compartilhado por Certificado e Laudo. */
export const SHELL_CSS = `
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 14px; font-size: 10.5px; line-height: 1.35; }
  .doc { width: 100%; min-height: 100%; border: 2px solid #D32F2F; padding: 16px 22px; position: relative; }
  .doc::before { content: ''; position: absolute; inset: 5px; border: 1px solid #D32F2F; opacity: .3; pointer-events: none; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #D32F2F; padding-bottom: 8px; }
  .brand { display: flex; gap: 8px; align-items: center; }
  .logo { width: 36px; height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .brand h1 { font-size: 13px; margin: 0; } .brand p { margin: 1px 0 0; font-size: 9.5px; color: #64748b; }
  .title { text-align: right; } .title .t { font-size: 14px; font-weight: 800; color: #D32F2F; } .title .s { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .doctitle { text-align: center; font-size: 13px; font-weight: 800; letter-spacing: .01em; margin: 10px 0 3px; color: #1a1a1a; }
  .doctitle .sub { display: block; font-size: 10px; font-weight: 600; color: #64748b; text-transform: none; margin-top: 1px; }
  .center { text-align: center; }
  h2 { font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; color: #D32F2F; margin: 10px 0 4px; border-bottom: 1px solid #f1d6d6; padding-bottom: 2px; }
  h3 { font-size: 9px; text-transform: uppercase; letter-spacing: .03em; color: #475569; margin: 0 0 3px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; font-size: 10.5px; } .grid span { color: #64748b; }
  .lead { font-size: 10.5px; line-height: 1.45; text-align: justify; margin: 5px 0; }
  .cesrow { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; background: #fafafa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 10px; font-size: 10px; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 2px; }
  th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #fbebeb; font-size: 8.5px; text-transform: uppercase; letter-spacing: .02em; color: #7a2e2e; }
  td.r, th.r { text-align: right; }
  .lic { font-size: 9px; color: #475569; }
  .emg { margin-top: 8px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 6px; padding: 5px 10px; font-size: 9.5px; }
  .checklist { list-style: none; margin: 3px 0; padding: 0; font-size: 9.5px; line-height: 1.5; columns: 2; column-gap: 20px; }
  .checklist li { break-inside: avoid; }
  .checklist li:before { content: '✔ '; color: #D32F2F; font-weight: 700; }
  .twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 20px; align-items: end; }
  .sign2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 26px; align-items: end; }
  .sign .line, .sign2 .line { text-align: center; font-size: 9px; color: #64748b; }
  .sign .line .signlabel, .sign2 .line .signlabel { display: block; border-top: 1px solid #94a3b8; padding-top: 3px; margin-top: 2px; }
  .execline { margin-top: 8px; font-size: 10.5px; }
  .page2 { page-break-before: always; padding-top: 20px; }
  @media print { body { padding: 0; margin: 0; } @page { margin: 6mm; } }
`;

export function header(subtitle: string): string {
  const org = getOrgProfile();
  const logo = org.logoDataUrl
    ? `<img src="${org.logoDataUrl}" alt="Logo" style="width:34px;height:34px;object-fit:contain" />`
    : logoSvgMarkup(34);
  return `<div class="head">
    <div class="brand"><div class="logo">${logo}</div><div><h1>${esc(org.name)}</h1><p>${esc(org.legalName)} · CNPJ ${esc(org.cnpj)}</p><p>${esc(org.street)}, ${esc(org.district)} · ${esc(org.city)}/${esc(org.state)} · CEP ${esc(org.cep)}</p></div></div>
    <div class="title"><div class="s">${esc(subtitle)}</div><div class="t">${esc(org.name)}</div><div class="s">${new Date().toLocaleDateString('pt-BR')}</div></div>
  </div>`;
}

/** Licenças ativas (não vencidas) para exibir nos documentos — a Autorização de
 *  Funcionamento fica de fora, mostramos só as licenças sanitária/ambiental. */
export function activeLicenses(): License[] {
  return useLicensesStore.getState().items
    .filter((l) => !l.expiresAt || new Date(l.expiresAt).getTime() >= Date.now())
    .filter((l) => !/autoriza(ç|c)ão de funcionamento/i.test(l.name));
}
export function licensesBlock(): string {
  const lics = activeLicenses();
  if (!lics.length) return '';
  const rows = lics.map((l) => `${esc(l.name)}: ${esc(l.number ?? '—')}${l.expiresAt ? ` · Validade: ${fmtDate(l.expiresAt)}` : ''}`).join(' &nbsp;|&nbsp; ');
  return `<p class="lic">${rows}</p>`;
}

export function warrantyText(so: ServiceOrder): string {
  const w = so.warranty;
  if (!w || !w.has) return 'Sem garantia';
  if (w.value) return withExtenso(w.value, w.unit === 'dias' ? (w.value === 1 ? 'dia' : 'dias') : (w.value === 1 ? 'mês' : 'meses'));
  return 'Com garantia';
}

/** Texto de garantia/validade específico da praga (usa o cadastro da praga; sem isso, cai na garantia geral da OS). */
export function pestWarrantyText(pest: Pest | undefined, so: ServiceOrder): string {
  if (pest?.defaultWarrantyDays != null) return daysToExtenso(pest.defaultWarrantyDays);
  return warrantyText(so);
}
export function pestValidityDate(pest: Pest | undefined, so: ServiceOrder): string {
  const override = pest && so.pestValidity?.find((pv) => pv.pestId === pest.id)?.validityDate;
  if (override) return fmtDate(override);
  const base = so.executionDate ?? so.finishedAt ?? so.startedAt ?? so.createdAt;
  if (pest?.defaultValidityDays != null && base) {
    const d = new Date(base);
    d.setDate(d.getDate() + pest.defaultValidityDays);
    return fmtDate(d.toISOString());
  }
  return so.validityDate ? fmtDate(so.validityDate) : '—';
}

/** Validade do certificado — distinta da validade do serviço: só se aplica
 *  quando o atendimento teve garantia; sem garantia, não há certificado válido. */
export function certificateValidityText(so: ServiceOrder): string {
  if (!so.warranty?.has) return 'Não aplicável — serviço sem garantia';
  return fmtDate(so.certificateValidityDate ?? so.validityDate);
}

/** Assinatura do Responsável Técnico (empresa) — único signatário do Certificado. */
export function responsibleSignatureLine(): string {
  const s = useSettingsStore.getState();
  const org = getOrgProfile();
  const img = (src?: string) => (src ? `<img src="${src}" alt="assinatura" style="height:36px;object-fit:contain;margin:0 auto 2px;display:block" />` : '<div style="height:36px"></div>');
  return `<div class="sign" style="grid-template-columns:1fr;max-width:260px;margin:20px auto 0;">
    <div class="line">${img(s.companySignature)}<span class="signlabel">${esc(org.technicalResponsibleName)}<br/>${esc(org.technicalResponsibleRole)} · ${esc(org.technicalResponsibleRegistry)}</span></div>
  </div>`;
}

/** Assinaturas de cliente e técnico de execução — fecham o Laudo. */
export function clientTechSignatures(so: ServiceOrder): string {
  const s = useSettingsStore.getState();
  const techId = so.technicianIds?.[0] ?? so.technicianId;
  const techSig = so.technicianSignature ?? (techId ? s.signatures[techId] : undefined);
  const img = (src?: string) => (src ? `<img src="${src}" alt="assinatura" style="height:38px;object-fit:contain;margin:0 auto 2px;display:block" />` : '<div style="height:38px"></div>');
  const techNames = (so.technicianIds?.length ? so.technicianIds : [so.technicianId]).map((id) => getUser(id)?.name).filter(Boolean).join(', ') || '—';
  const c = getCustomer(so.customerId);
  return `<div class="sign2">
    <div class="line">${img(so.customerSignature)}<span class="signlabel">${esc(c?.name ?? 'Cliente')}${c?.document ? `<br/>${esc(formatDocument(c.document))}` : ''}<br/>Assinatura Cliente</span></div>
    <div class="line">${img(techSig)}<span class="signlabel">${esc(techNames)}<br/>Técnico de Execução</span></div>
  </div>`;
}

export function emergencyBlock(): string {
  const s = useSettingsStore.getState();
  return `<div class="emg"><strong>Informações toxicológicas:</strong> Suspeita de intoxicação ligar para o CEATOX ${esc(s.emergencyPhone)}${s.emergencyInfo ? ` — ${esc(s.emergencyInfo)}` : ''}</div>`;
}

export function openPrint(title: string, body: string): void {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${SHELL_CSS}</style></head><body><div class="doc">${body}</div><script>window.onload=function(){setTimeout(function(){window.print();},150);};</script></body></html>`;
  // Centraliza a janela na tela do usuário (em vez de nascer num canto), com
  // tamanho generoso para exibir melhor o documento antes da impressão.
  const width = Math.min(1000, Math.round(window.screen.width * 0.85));
  const height = Math.min(1100, Math.round(window.screen.height * 0.9));
  const left = Math.max(0, Math.round((window.screen.width - width) / 2));
  const top = Math.max(0, Math.round((window.screen.height - height) / 2));
  const w = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top}`);
  if (!w) { toast('Permita pop-ups para gerar o documento.', { tone: 'warning' }); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

/**
 * Produtos que de fato entraram no atendimento.
 *
 * `ServiceOrder.products` guarda tudo que foi lançado na OS, incluindo o que
 * veio do padrão do serviço e acabou não sendo aplicado (quantidade zerada).
 * Documento entregue ao cliente só pode listar o que foi usado — declarar
 * produto que não foi aplicado é informação errada num documento técnico.
 */
export function appliedProducts(so: ServiceOrder): ServiceOrder['products'] {
  return so.products.filter((p) => Number(p.usedQty) > 0);
}

/** Como o produto é identificado no Laudo/Certificado — nome comercial ou
 *  princípio ativo, conforme configurado no cadastro (Product.reportLabel).
 *  Sem preferência definida ou sem princípio ativo cadastrado, cai no nome. */
export function productReportLabel(prod?: Product): string {
  if (!prod) return '—';
  if (prod.reportLabel === 'nome') return prod.name;
  return prod.activeIngredient || prod.name;
}

export function serviceNames(so: ServiceOrder): string {
  return (so.serviceTypeIds?.length ? so.serviceTypeIds : [so.serviceTypeId]).map((id) => getServiceType(id)?.name).filter(Boolean).join(' + ') || '—';
}
export function osPests(so: ServiceOrder): (Pest | undefined)[] {
  return so.pestIds.map((id) => getPest(id));
}
export function address(c: ReturnType<typeof getCustomer>): string {
  return c ? formatAddress(c) : '';
}

/** Certificado Sanitário de Combate a Vetores e Pragas Urbanas (CES). */
export function printCertificate(so: ServiceOrder): void {
  const c = getCustomer(so.customerId);
  const org = getOrgProfile();
  const declaracao = applyTemplate(useSettingsStore.getState().documentTexts.certificateDeclaration, {
    empresa: org.legalName ?? org.name ?? '',
    cnpj: org.cnpj ?? '',
    cliente: c?.name ?? '',
    documento: formatDocument(c?.document),
    endereco: address(c),
  });
  const dataExec = fmtDate(so.executionDate ?? so.finishedAt ?? so.startedAt ?? so.createdAt);
  const validade = certificateValidityText(so);
  const pests = osPests(so);

  const productRows = appliedProducts(so).map((p) => {
    const prod = getProduct(p.productId);
    return `<tr><td>${esc(productReportLabel(prod))}</td><td>${esc(prod?.chemicalGroup ?? '—')}</td><td>${esc(prod?.registrationCode ?? '—')}</td><td class="r">${esc(p.usedQty)} ${esc(prod?.unit ?? '')}</td><td>${esc(prod?.dosage ?? '—')}</td></tr>`;
  }).join('');

  const body = `${header('Certificado Sanitário')}
    <p class="doctitle">CERTIFICADO SANITÁRIO DE COMBATE A VETORES E PRAGAS URBANAS</p>
    <p class="lead">${esc(declaracao)}</p>

    <div class="cesrow">
      <span><strong>CES — Comprovante de Execução de Serviço:</strong> ${esc(so.number)}</span>
      <span><strong>Validade do Certificado:</strong> ${esc(validade)}</span>
    </div>

    <div class="grid">
      <div style="grid-column:1/3"><span>Serviço(s):</span> ${esc(serviceNames(so))} [${esc(warrantyText(so))}]</div>
      <div style="grid-column:1/3"><span>Área tratada:</span> ${esc(so.areaTreated || '—')}</div>
      <div style="grid-column:1/3"><span>Praga(s)/Garantia:</span> ${pests.map((p) => `${esc(p?.name)} [${esc(pestWarrantyText(p, so))}]`).join(', ') || '—'}</div>
    </div>

    <h2>Produto(s) químico(s) empregado(s)</h2>
    <table><thead><tr><th>Produto</th><th>Grupo Químico</th><th>Registro MS</th><th class="r">Quantidade Aplicada</th><th>Concentração de Uso</th></tr></thead>
    <tbody>${productRows || '<tr><td colspan="5" style="color:#94a3b8">Nenhum produto lançado.</td></tr>'}</tbody></table>

    <p class="execline"><strong>Data de execução do serviço:</strong> ${esc(dataExec)}</p>

    ${responsibleSignatureLine()}
    ${emergencyBlock()}
    ${licensesBlock()}`;
  openPrint(`Certificado · ${c?.name ?? ''}`, body);
}

/** Substitui os marcadores {{campo}} do texto configurado pelos valores reais. */
function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}

/** Laudo técnico detalhado do atendimento (CES completo). */
export function printLaudo(so: ServiceOrder): void {
  const { safetyMeasures, laudoNotes } = useSettingsStore.getState().documentTexts;
  const c = getCustomer(so.customerId);
  const org = getOrgProfile();
  const techIds = so.technicianIds?.length ? so.technicianIds : [so.technicianId];
  const techName = getUser(techIds[0])?.name ?? '—';
  const helperName = techIds[1] ? getUser(techIds[1])?.name : undefined;
  const dataHora = fmtDateTime(so.startedAt ?? so.executionDate ?? so.createdAt);
  const validade = so.validityDate ? fmtDate(so.validityDate) : '—';
  const pests = osPests(so);

  const productRows = appliedProducts(so).map((p) => {
    const prod = getProduct(p.productId);
    const batch = currentBatch(prod);
    return `<tr>
      <td>${esc(prod?.chemicalGroup ?? '—')}</td>
      <td>${esc(productReportLabel(prod))}</td>
      <td>${esc(prod?.activeIngredient ?? '—')}</td>
      <td>${esc(batch?.code ?? '—')}</td>
      <td>${esc(batch?.expiresAt ? fmtDate(batch.expiresAt) : '—')}</td>
      <td>${esc(prod?.registrationCode ?? '—')}</td>
      <td>${esc(prod?.applicationType ?? '—')}</td>
      <td class="r">${esc(p.usedQty)} ${esc(prod?.unit ?? '')}</td>
      <td>${esc([prod?.antidote, prod?.treatment].filter(Boolean).join(' · ') || '—')}</td>
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

    <h2>Descrição do serviço executado</h2>
    <p class="lead">${esc(so.areaTreated || 'Não informado.')}</p>
    ${so.procedures ? `<p class="lead">${esc(so.procedures)}</p>` : ''}

    ${safetyMeasures.length ? `<h2>Medidas de Segurança / Orientações</h2>
    <ul class="checklist">${safetyMeasures.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    ${laudoNotes ? `<p class="lead">${esc(laudoNotes)}</p>` : ''}

    <div class="twocol">
      <div>
        <h3>Dados do Responsável Técnico</h3>
        ${responsibleSignatureLine()}
      </div>
      <div>
        <h3>Dados de Emergência (CIT)</h3>
        <p class="lead" style="margin-top:0">Suspeita de intoxicação ligar para o CEATOX ${esc(useSettingsStore.getState().emergencyPhone)}</p>
      </div>
    </div>
    ${licensesBlock()}
    ${clientTechSignatures(so)}`;
  openPrint(`Laudo · ${c?.name ?? ''}`, body);
}
