/**
 * Geradores de PDF de relatórios (client-side, sem dependências):
 *  - Relatório de Monitoramento de Armadilhas
 *  - Relatório MIP (Monitoramento Integrado de Pragas)
 * Montam HTML formatado e abrem a impressão do navegador ("Salvar como PDF").
 */
import type { Customer, NonConformity, TrapDevice, TrapInspection } from '@/domain/types';
import { getUser } from '@/application/repository';
import * as seed from '@/infrastructure/seed/data';
import { formatDocument } from './utils';
import { toast } from '@/store/toastStore';

export const NC_CATEGORY_LABEL: Record<NonConformity['category'], string> = {
  fresta: 'Fresta',
  falha_estrutural: 'Falha estrutural',
  limpeza_inadequada: 'Limpeza inadequada',
  armazenamento_incorreto: 'Armazenamento incorreto',
  outra: 'Outra',
};
const NC_PRIORITY_LABEL: Record<string, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
const NC_STATUS_LABEL: Record<NonConformity['status'], string> = { aberta: 'Aberta', em_andamento: 'Em andamento', resolvida: 'Resolvida' };

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmt(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}
const STATUS_LABEL: Record<string, string> = {
  ativa: 'Ativa', extraviada: 'Extraviada', substituida: 'Substituída', retirada: 'Retirada',
};

const SHELL_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px; }
  .doc { max-width: 820px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #10b981; padding-bottom: 16px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .logo { width: 44px; height: 44px; border-radius: 10px; background: #10b981; color: #fff; display: grid; place-items: center; font-weight: 700; }
  .brand h1 { font-size: 16px; margin: 0; } .brand p { margin: 2px 0 0; font-size: 12px; color: #64748b; }
  .title { text-align: right; } .title .t { font-size: 18px; font-weight: 800; color: #10b981; } .title .s { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #10b981; margin: 22px 0 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 13px; } .grid span { color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f1f5f9; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 6px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; } .card .n { font-size: 20px; font-weight: 800; } .card .l { font-size: 11px; color: #64748b; }
  .tag { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 11px; }
  .tag-yes { background: #fee2e2; color: #b91c1c; } .tag-no { background: #dcfce7; color: #15803d; }
  .foot { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 44px; }
  .sign .line { border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 12px; color: #64748b; }
  @media print { body { padding: 0; } @page { margin: 15mm; } }
`;

function header(subtitle: string): string {
  const org = seed.orgProfile;
  return `<div class="head">
    <div class="brand"><div class="logo">NM</div><div><h1>${esc(org.name)}</h1><p>${esc(org.legalName)} · CNPJ ${esc(org.cnpj)}</p></div></div>
    <div class="title"><div class="s">${esc(subtitle)}</div><div class="t">${esc(org.name)}</div><div class="s">${new Date().toLocaleDateString('pt-BR')}</div></div>
  </div>`;
}

function openPrint(title: string, body: string): void {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${SHELL_CSS}</style></head><body><div class="doc">${body}<div class="foot">Documento gerado por Na Mira · Controle de Pragas</div></div><script>window.onload=function(){setTimeout(function(){window.print();},150);};</script></body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) { toast('Permita pop-ups para gerar o PDF.', { tone: 'warning' }); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function customerBlock(c?: Customer): string {
  return `<h2>Cliente</h2><div class="grid">
    <div><span>Nome:</span> ${esc(c?.name)}</div>
    <div><span>Documento:</span> ${esc(formatDocument(c?.document))}</div>
    <div><span>Endereço:</span> ${esc([c?.street, c?.district, c?.city].filter(Boolean).join(', '))}</div>
    <div><span>Telefone:</span> ${esc(c?.phone ?? '—')}</div>
  </div>`;
}

export function printTrapReport(customer: Customer, traps: TrapDevice[], inspections: TrapInspection[]): void {
  const lastInsp = (trapId: string) => inspections.filter((i) => i.trapId === trapId).sort((a, b) => (a.date > b.date ? -1 : 1))[0];
  const withConsumption = traps.filter((t) => lastInsp(t.id)?.consumed).length;
  const occurrences = inspections.filter((i) => i.consumed).length;
  const rate = traps.length ? Math.round((withConsumption / traps.length) * 100) : 0;

  const rows = traps.map((t) => {
    const li = lastInsp(t.id);
    return `<tr>
      <td>${esc(t.code)}</td><td>${esc(t.type)}</td><td>${esc(t.location ?? '—')}</td>
      <td>${esc(STATUS_LABEL[t.status] ?? t.status)}</td>
      <td>${esc(fmt(li?.date))}</td>
      <td>${li ? (li.consumed ? '<span class="tag tag-yes">Sim</span>' : '<span class="tag tag-no">Não</span>') : '—'}</td>
    </tr>`;
  }).join('');

  const body = `${header('Relatório de Armadilhas')}${customerBlock(customer)}
    <h2>Resumo</h2>
    <div class="cards">
      <div class="card"><div class="n">${traps.length}</div><div class="l">Armadilhas</div></div>
      <div class="card"><div class="n">${withConsumption}</div><div class="l">Com consumo</div></div>
      <div class="card"><div class="n">${rate}%</div><div class="l">Taxa de consumo</div></div>
      <div class="card"><div class="n">${occurrences}</div><div class="l">Ocorrências (hist.)</div></div>
    </div>
    <h2>Armadilhas monitoradas</h2>
    <table><thead><tr><th>Identificação</th><th>Tipo</th><th>Local</th><th>Situação</th><th>Última inspeção</th><th>Consumo</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="color:#94a3b8">Nenhuma armadilha.</td></tr>'}</tbody></table>
    <div class="sign"><div class="line">Responsável Técnico</div><div class="line">Cliente</div></div>`;
  openPrint(`Armadilhas · ${customer.name}`, body);
}

export function printMipReport(customer: Customer, traps: TrapDevice[], inspections: TrapInspection[]): void {
  const custInsp = inspections
    .filter((i) => traps.some((t) => t.id === i.trapId))
    .sort((a, b) => (a.date > b.date ? -1 : 1));
  const baitConsumed = custInsp.filter((i) => i.consumed).length;

  const inspRows = custInsp.map((i) => {
    const trap = traps.find((t) => t.id === i.trapId);
    return `<tr>
      <td>${esc(fmt(i.date))}</td>
      <td>${esc(trap?.code ?? '—')}</td>
      <td>${esc(getUser(i.technicianId)?.name ?? '—')}</td>
      <td>${i.consumed ? '<span class="tag tag-yes">Sim</span>' : '<span class="tag tag-no">Não</span>'}</td>
      <td>${esc(i.notes ?? '—')}</td>
    </tr>`;
  }).join('');

  const body = `${header('Relatório MIP')}${customerBlock(customer)}
    <h2>Monitoramento Integrado de Pragas</h2>
    <div class="cards">
      <div class="card"><div class="n">${traps.length}</div><div class="l">Dispositivos</div></div>
      <div class="card"><div class="n">${custInsp.length}</div><div class="l">Inspeções</div></div>
      <div class="card"><div class="n">${baitConsumed}</div><div class="l">Consumo de isca</div></div>
      <div class="card"><div class="n">${traps.filter((t) => t.status !== 'ativa').length}</div><div class="l">Ocorrências</div></div>
    </div>
    <h2>Inspeções realizadas</h2>
    <table><thead><tr><th>Data</th><th>Dispositivo</th><th>Técnico</th><th>Consumo</th><th>Ocorrências / observações</th></tr></thead>
    <tbody>${inspRows || '<tr><td colspan="5" style="color:#94a3b8">Sem inspeções.</td></tr>'}</tbody></table>
    <div class="sign"><div class="line">Responsável Técnico</div><div class="line">Cliente</div></div>`;
  openPrint(`MIP · ${customer.name}`, body);
}

export function printNonConformityReport(customer: Customer, items: NonConformity[]): void {
  const blocks = items.map((nc, i) => {
    const photos = (nc.photos ?? [])
      .map((ph) => `<img src="${ph.dataUrl}" alt="${esc(ph.name)}" style="width:160px;height:120px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0" />`)
      .join('');
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${i + 1}. ${esc(NC_CATEGORY_LABEL[nc.category])}</strong>
        <span class="tag ${nc.priority === 'urgente' || nc.priority === 'alta' ? 'tag-yes' : 'tag-no'}">${esc(NC_PRIORITY_LABEL[nc.priority])}</span>
      </div>
      <p style="margin:8px 0 4px;font-size:13px">${esc(nc.description)}</p>
      <p style="margin:4px 0;font-size:12px;color:#64748b">Data: ${esc(fmt(nc.date))} · Situação: ${esc(NC_STATUS_LABEL[nc.status])}</p>
      ${nc.correctiveAction ? `<p style="margin:6px 0 0;font-size:12.5px"><strong>Ação corretiva:</strong> ${esc(nc.correctiveAction)}</p>` : ''}
      ${photos ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${photos}</div>` : ''}
    </div>`;
  }).join('');

  const body = `${header('Relatório de Não Conformidade')}${customerBlock(customer)}
    <h2>Não conformidades registradas (${items.length})</h2>
    ${blocks || '<p style="color:#94a3b8">Nenhuma não conformidade registrada.</p>'}
    <div class="sign"><div class="line">Responsável Técnico</div><div class="line">Cliente</div></div>`;
  openPrint(`Não Conformidade · ${customer.name}`, body);
}
