/**
 * Geradores de PDF de relatórios (client-side, sem dependências):
 *  - Relatório de Monitoramento de Armadilhas
 *  - Relatório MIP (Monitoramento Integrado de Pragas)
 * Montam HTML formatado e abrem a impressão do navegador ("Salvar como PDF").
 */
import { parseISO } from 'date-fns';
import type { Customer, NonConformity, TrapDevice, TrapInspection } from '@/domain/types';
import { getPest, getProduct, getServiceType, getUser, serviceOrdersForCustomer } from '@/application/repository';
import { useSettingsStore } from '@/store/settingsStore';
import { useNonConformitiesStore } from '@/store/entityStores';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { getOrgProfile } from '@/store/orgProfileStore';
import { formatDocument } from './utils';
import { toast } from '@/store/toastStore';
import { logoSvgMarkup } from './logoSvg';
import { savePdf } from './pdfFile';
import type { DocumentOutput } from './printDocuments';

export const NC_CATEGORY_LABEL: Record<NonConformity['category'], string> = {
  fresta: 'Fresta',
  falha_estrutural: 'Falha estrutural',
  limpeza_inadequada: 'Limpeza inadequada',
  armazenamento_incorreto: 'Armazenamento incorreto',
  outra: 'Outra',
};
const NC_PRIORITY_LABEL: Record<string, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
const NC_STATUS_LABEL: Record<NonConformity['status'], string> = { aberta: 'Aberta', em_andamento: 'Em andamento', resolvida: 'Resolvida' };
/** Como o resultado de cada ponto verificado aparece no Relatório MIP. */
const VERIF_LABEL: Record<string, string> = { conforme: 'Conforme', nao_conforme: 'Não conforme', nao_aplica: 'Não se aplica' };

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmt(iso?: string): string {
  return iso ? parseISO(iso).toLocaleDateString('pt-BR') : '—';
}

const SHELL_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px; }
  .doc { max-width: 820px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #D32F2F; padding-bottom: 16px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .logo { width: 60px; height: 60px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .brand h1 { font-size: 16px; margin: 0; } .brand p { margin: 2px 0 0; font-size: 12px; color: #64748b; }
  .title { text-align: right; } .title .t { font-size: 18px; font-weight: 800; color: #D32F2F; } .title .s { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #D32F2F; margin: 22px 0 8px; }
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
  /* Modelo do relatório de monitoramento entregue ao cliente: dois blocos de
     identificação lado a lado, faixa de título e as armadilhas agrupadas por
     local do imóvel. */
  .idrow { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-top: 18px; align-items: stretch; }
  .idbox { border: 1px solid #cbd5e1; padding: 9px 12px; font-size: 12px; line-height: 1.5; }
  .idbox strong { font-size: 12.5px; }
  .band { background: #eef2f6; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; font-size: 13px; padding: 7px; margin: 16px 0 0; }
  .localband { background: #e2e8f0; border: 1px solid #cbd5e1; border-bottom: none; font-weight: 700; font-size: 12.5px; padding: 6px 10px; margin-top: 12px; }
  table.mon { border: 1px solid #cbd5e1; }
  table.mon th { background: #eef2f6; color: #0f172a; font-weight: 700; font-size: 11.5px; text-transform: none; letter-spacing: 0; }
  table.mon td, table.mon th { border-bottom: 1px solid #e2e8f0; }
  .empty { font-size: 12px; color: #94a3b8; padding: 7px 9px; border: 1px solid #cbd5e1; border-top: none; }
  /* ── Relatório MIP: capa, marca repetida e quebra por seção ───────────── */
  .mippage { page-break-after: always; position: relative; min-height: 240mm; padding-bottom: 30px; }
  .mippage:last-child { page-break-after: auto; }
  .miphead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 26px; }
  .mipmark { border-left: 4px solid #1e3a5f; border-right: 4px solid #1e3a5f; padding: 4px 14px; }
  .mipmark .t { display: block; font-size: 21px; font-weight: 800; letter-spacing: .01em; color: #1e3a5f; }
  .mipmark .s { display: block; font-size: 11px; color: #475569; }
  .capa { display: flex; flex-direction: column; }
  .capatitulo { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .capatitulo h1 { font-size: 26px; font-weight: 800; margin: 0; max-width: 80%; }
  .capatitulo p { font-size: 14px; font-weight: 700; margin: 10px 0 0; }
  .mipfoot { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 10.5px; color: #64748b; }
  .mippage h3 { font-size: 14px; font-weight: 700; color: #0f172a; margin: 22px 0 8px; }
  .deft, .ref, .lin { font-size: 12px; line-height: 1.55; text-align: justify; margin: 6px 0; }
  .ref { color: #1e3a5f; }
  .nota { font-size: 11px; color: #475569; margin-top: 10px; }
  table.mon td.c, table.mon th.c { text-align: center; }
  td.ncimg { padding: 6px; }
  td.ncimg img { width: 100%; max-height: 120px; object-fit: cover; display: block; }
  .sign2 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; text-align: center; }
  .signline { display: block; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 11.5px; color: #334155; }
  @media print { body { padding: 0; } @page { margin: 15mm; } }
`;

function header(subtitle: string): string {
  const org = getOrgProfile();
  // Mesmo cabeçalho dos demais documentos: só a logo à esquerda.
  const logo = org.logoDataUrl
    ? `<img src="${org.logoDataUrl}" alt="Logo" style="width:58px;height:58px;object-fit:contain" />`
    : logoSvgMarkup(58);
  return `<div class="head">
    <div class="brand"><div class="logo">${logo}</div></div>
    <div class="title"><div class="s">${esc(subtitle)}</div><div class="t">${esc(org.name)}</div><div class="s">${new Date().toLocaleDateString('pt-BR')}</div></div>
  </div>`;
}

function openPrint(title: string, body: string, output: DocumentOutput = 'imprimir'): void {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${SHELL_CSS}</style></head><body><div class="doc">${body}<div class="foot">Documento gerado por ${esc(getOrgProfile().name)}</div></div><script>window.onload=function(){setTimeout(function(){window.print();},150);};</script></body></html>`;
  // Baixar entrega o arquivo direto; imprimir abre a pré-visualização.
  if (output === 'baixar') { void savePdf(title, html); return; }
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) { toast('Permita pop-ups para gerar o PDF.', { tone: 'warning' }); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function customerBlock(c?: Customer): string {
  return `<h2>Cliente</h2><div class="grid">
    <div><span>Nome:</span> <strong>${esc(c?.name)}</strong></div>
    <div><span>Documento:</span> ${esc(formatDocument(c?.document))}</div>
    <div><span>Endereço:</span> ${esc([c?.street, c?.district, c?.city].filter(Boolean).join(', '))}</div>
    <div><span>Telefone:</span> ${esc(c?.phone ?? '—')}</div>
  </div>`;
}

export interface ReportColumn<T> { header: string; value: (row: T) => unknown; align?: 'left' | 'right' }

/**
 * PDF genérico de relatório: monta a tabela do relatório solicitado (com resumo
 * opcional) e abre a impressão — não é um "print da tela".
 */
export function printDataReport<T>(
  title: string,
  subtitle: string,
  columns: ReportColumn<T>[],
  rows: T[],
  summary?: { label: string; value: string | number }[],
  output: DocumentOutput = 'imprimir',
): void {
  const cards = summary && summary.length
    ? `<h2>Resumo</h2><div class="cards">${summary.map((s) => `<div class="card"><div class="n">${esc(s.value)}</div><div class="l">${esc(s.label)}</div></div>`).join('')}</div>`
    : '';
  const head = `<tr>${columns.map((c) => `<th style="${c.align === 'right' ? 'text-align:right' : ''}">${esc(c.header)}</th>`).join('')}</tr>`;
  const body = rows.length
    ? rows.map((r) => `<tr>${columns.map((c) => `<td style="${c.align === 'right' ? 'text-align:right' : ''}">${esc(c.value(r))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" style="color:#94a3b8">Sem dados no período.</td></tr>`;
  const html = `${header(subtitle)}
    <h2 style="margin-top:22px">${esc(title)}</h2>
    ${cards}
    <h2>Detalhamento (${rows.length})</h2>
    <table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  openPrint(title, html, output);
}

/** Cabeçalho do relatório de monitoramento: logo à esquerda, identificação da
 *  empresa à direita. Diferente da OS e do laudo — este documento circula
 *  sozinho no cliente, sem o bloco do emitente logo abaixo. */
function monHeader(): string {
  const org = getOrgProfile();
  const logo = org.logoDataUrl
    ? `<img src="${org.logoDataUrl}" alt="Logo" style="width:96px;height:96px;object-fit:contain" />`
    : logoSvgMarkup(96);
  return `<div class="head" style="border-bottom:none;padding-bottom:0">
    <div class="brand"><div class="logo" style="width:100px;height:100px">${logo}</div></div>
    <div style="text-align:right;font-size:11.5px;line-height:1.5;color:#334155">
      <strong>${esc(org.name)}</strong><br/>
      <strong>CNPJ: ${esc(org.cnpj)}</strong><br/>
      ${esc(org.street)}<br/>
      ${esc(org.district)} | ${esc(org.city)}-${esc(org.state)}<br/>
      CEP: ${esc(org.cep)} | Telefone: ${esc(org.phone)}
    </div>
  </div>`;
}

/** Separa "Porta Isca 001" em tipo e número, como o relatório exige em colunas
 *  distintas. Sem número no código, a coluna sai vazia em vez de repetir o
 *  código inteiro — o cliente lê a linha pelo tipo + ponto de instalação. */
function splitTrapCode(t: TrapDevice): { nome: string; numero: string } {
  const m = /^(.*?)[\s-]*(\d+)\s*$/.exec(t.code.trim());
  if (m) return { nome: (m[1] || t.type).trim(), numero: m[2] };
  return { nome: t.code || t.type, numero: '' };
}

/**
 * Relatório de Monitoramento de Armadilhas — no formato entregue ao cliente.
 *
 * Agrupado pelo LOCAL do imóvel, que é como quem recebe o documento lê: a
 * pergunta é "o que aconteceu na área externa", não "o que aconteceu na
 * armadilha 007". Locais sem armadilha continuam aparecendo, com a tabela
 * vazia — sumir com a seção esconderia que aquele ponto foi verificado.
 */
export function printTrapReport(customer: Customer, traps: TrapDevice[], inspections: TrapInspection[], output: DocumentOutput = 'imprimir'): void {
  const lastInsp = (trapId: string) => inspections
    .filter((i) => i.trapId === trapId)
    .sort((a, b) => (a.date > b.date ? -1 : 1))[0];

  // Data e técnico do documento vêm da inspeção mais recente do cliente — é
  // a visita que este relatório está reportando.
  const ultima = inspections
    .filter((i) => traps.some((t) => t.id === i.trapId))
    .sort((a, b) => (a.date > b.date ? -1 : 1))[0];
  const dataExec = fmt(ultima?.date);
  const tecnico = getUser(ultima?.technicianId)?.name ?? '—';
  // CES é o número da OS do atendimento — é por ele que o cliente arquiva e
  // cobra o documento.
  const osDoCliente = serviceOrdersForCustomer(customer.id);
  const ces = (osDoCliente.find((o) => o.status === 'concluida') ?? osDoCliente[0])?.number;

  // Agrupa por local preservando a ordem em que os locais aparecem no cadastro.
  const locais: string[] = [];
  traps.forEach((t) => {
    const l = (t.location ?? '').trim() || 'Não informado';
    if (!locais.includes(l)) locais.push(l);
  });

  const secoes = locais.map((local) => {
    const doLocal = traps.filter((t) => ((t.location ?? '').trim() || 'Não informado') === local);
    const linhas = doLocal.map((t) => {
      const li = lastInsp(t.id);
      const { nome, numero } = splitTrapCode(t);
      // Sem ocorrência registrada, o consumo ainda diz o essencial — inspeções
      // antigas, feitas antes de o campo existir, não podem sair em branco.
      const ocorrencia = li?.occurrence
        ?? (li ? (li.consumed ? 'Isca Totalmente Consumida' : 'Sem Consumo') : '');
      const acao = li?.actionTaken ?? '';
      return `<tr>
        <td>${esc(nome)}</td>
        <td>${esc(numero)}</td>
        <td>${esc(ocorrencia)}</td>
        <td>${esc(acao)}</td>
      </tr>`;
    }).join('');
    return `<div class="localband">Local: ${esc(local)}</div>
      <table class="mon"><thead><tr><th style="width:26%">Armadilha</th><th style="width:10%">Nº</th><th style="width:37%">Ocorrência</th><th style="width:27%">Ação Tomada</th></tr></thead>
      <tbody>${linhas}</tbody></table>`;
  }).join('');

  const body = `${monHeader()}
    <div class="idrow">
      <div class="idbox">
        <strong>${esc(customer.name)}</strong><br/>
        <strong>CPF/CNPJ: ${esc(formatDocument(customer.document))}</strong><br/>
        ${customer.companyName ? `${esc(customer.companyName)}<br/>` : ''}
        ${esc(customer.street)}${customer.number ? `, ${esc(customer.number)}` : ''}${customer.complement ? ` ${esc(customer.complement)}` : ''}<br/>
        ${esc(customer.district)} | ${esc(customer.city)}-${esc(customer.state)} CEP: ${esc(customer.cep)}<br/>
        Fone: ${esc(customer.phone ?? '—')}
      </div>
      <div class="idbox">
        ${ces ? `<strong>CES: ${esc(ces)}</strong><br/>` : ''}
        <strong>Data execução ${esc(dataExec)}</strong><br/>
        Técnico: ${esc(tecnico)}
      </div>
    </div>

    <div class="band">Monitoramento de Armadilhas</div>
    ${secoes || '<p class="empty">Nenhuma armadilha cadastrada para este cliente.</p>'}`;

  openPrint(`Monitoramento ${customer.name}`, body, output);
}

/**
 * Relatório MIP — Manejo Integrado de Pragas.
 *
 * É o documento longo entregue ao cliente de food service, no formato que a
 * fiscalização espera: capa, definições, referências normativas, o que foi
 * aplicado no dia com o anexo técnico dos produtos, a verificação do local e
 * as não conformidades com foto.
 *
 * Sai da última OS concluída do cliente — é uma visita que ele reporta, não um
 * acumulado do contrato. Sem OS concluída, as seções de serviço saem vazias e
 * o monitoramento ainda é entregue.
 */
export function printMipReport(customer: Customer, inspections: TrapInspection[], output: DocumentOutput = 'imprimir'): void {
  const org = getOrgProfile();
  const { mipDefinitions, mipReferences } = useSettingsStore.getState().documentTexts;
  // A visita que este relatório reporta é a última CONCLUÍDA: uma OS ainda em
  // aberto não tem produto lançado nem verificação feita, e sairia em branco.
  const doCliente = serviceOrdersForCustomer(customer.id);
  const so = doCliente.find((o) => o.status === 'concluida') ?? doCliente[0];
  const dataServico = fmt(so?.executionDate ?? so?.finishedAt ?? so?.startedAt ?? inspections[0]?.date);
  const tecnico = getUser(so?.technicianIds?.[0] ?? so?.technicianId)?.name ?? '—';

  const rodape = `<div class="mipfoot">${esc([org.street, org.district, `${org.city}-${org.state}`].filter(Boolean).join(' | '))}</div>`;
  const marca = () => {
    const logo = org.logoDataUrl
      ? `<img src="${org.logoDataUrl}" alt="Logo" style="width:78px;height:78px;object-fit:contain" />`
      : logoSvgMarkup(78);
    return `<div class="miphead">
      <div class="mipmark"><span class="t">RELATÓRIO MIP</span><span class="s">Manejo Integrado de Pragas</span></div>
      <div>${logo}</div>
    </div>`;
  };

  // ── 3. Produtos aplicados ────────────────────────────────────────────────
  const aplicados = (so?.products ?? []).filter((p) => Number(p.usedQty) > 0);
  const produtos = aplicados.map((p) => ({ p, prod: getProduct(p.productId) }));
  const linhasProduto = produtos.map(({ p, prod }) => `<tr>
      <td>${esc(prod?.name ?? '—')}</td>
      <td>${esc(prod?.chemicalGroup ?? '—')}</td>
      <td class="c">${esc(p.usedQty)}${prod?.dosage ? ` / ${esc(prod.dosage)}` : ''}</td>
      <td>${esc(so?.areaTreated ?? '')}</td>
      <td>${esc(prod?.applicationType ?? '—')}</td>
      <td></td>
    </tr>`).join('');

  const linhasAnexo = produtos.map(({ prod }) => `<tr>
      <td>${esc(prod?.name ?? '—')}</td>
      <td>${esc(prod?.chemicalGroup ?? '—')}</td>
      <td>${esc(prod?.activeIngredient ?? '—')}</td>
      <td>${esc(prod?.registrationCode ?? '—')}</td>
      <td>${esc(prod?.antidote ?? '—')}</td>
      <td>${esc(prod?.treatment ?? '—')}</td>
    </tr>`).join('');

  const servicos = (so?.serviceTypeIds?.length ? so.serviceTypeIds : [so?.serviceTypeId])
    .map((id) => (id ? getServiceType(id)?.name : undefined)).filter(Boolean).join(' + ');
  const pragas = (so?.pestIds ?? []).map((id) => getPest(id)?.name).filter(Boolean).join('  ');

  const sig = useSettingsStore.getState();
  const assinaturaTec = so?.technicianSignature ?? (so?.technicianIds?.[0] ? sig.signatures[so.technicianIds[0]] : undefined);
  const img = (src?: string) => (src ? `<img src="${src}" alt="assinatura" style="height:40px;object-fit:contain;display:block;margin:0 auto 4px" />` : '<div style="height:40px"></div>');

  // ── 4. Verificação do local ──────────────────────────────────────────────
  // A verificação do local é registrada na VISITA (Appointment), não na OS.
  const visita = so?.appointmentId
    ? useAppointmentsStore.getState().appointments.find((a) => a.id === so.appointmentId)
    : undefined;
  const verificacoes = visita?.verification ?? [];
  const linhasVerif = verificacoes.map((v) => `<tr>
      <td></td>
      <td>${esc(v.point)}</td>
      <td>${esc(so?.areaTreated ?? '')}</td>
      <td>${esc(VERIF_LABEL[v.result] ?? v.result)}</td>
      <td>${esc(v.notes ?? '')}</td>
    </tr>`).join('');

  // ── 5. Não conformidades, com foto ───────────────────────────────────────
  const ncs = useNonConformitiesStore.getState().items
    .filter((n) => n.customerId === customer.id && n.status !== 'resolvida')
    .sort((a, b) => (a.date > b.date ? -1 : 1));
  const linhasNc = ncs.map((n) => `<tr>
      <td class="ncimg">${n.photos?.[0] ? `<img src="${n.photos[0].dataUrl}" alt="foto" />` : ''}</td>
      <td>${esc(NC_CATEGORY_LABEL[n.category])}</td>
      <td>${esc(n.description)}</td>
      <td>${esc(n.correctiveAction ?? '')}</td>
    </tr>`).join('');

  const body = `
    <section class="mippage capa">
      ${marca()}
      <div class="capatitulo">
        <h1>${esc(customer.name)}</h1>
        <p>Data: ${esc(dataServico)}</p>
      </div>
      ${rodape}
    </section>

    <section class="mippage">
      ${marca()}
      <h3>1. Definições</h3>
      ${mipDefinitions.map((d) => {
        const [termo, ...resto] = d.split(' - ');
        return resto.length
          ? `<p class="deft"><strong>${esc(termo)}</strong> - ${esc(resto.join(' - '))}</p>`
          : `<p class="deft">${esc(d)}</p>`;
      }).join('')}

      <h3>2. Referências</h3>
      ${mipReferences.map((r) => `<p class="ref">${esc(r)}</p>`).join('')}

      <h3>3. Serviços realizados e produtos utilizados</h3>
      <p class="lin">Serviços do dia: ${esc(dataServico)}</p>
      <p class="lin">${esc(servicos || '—')}</p>
      <div class="band">Produtos</div>
      <table class="mon"><thead><tr>
        <th>Produto</th><th>Grupo Químico</th><th class="c">QTD./Diluição</th><th>Local Aplicação</th><th>Equipamento Utilizado</th><th>Tempo Afastamento</th>
      </tr></thead><tbody>${linhasProduto || '<tr><td colspan="6" style="color:#94a3b8">Nenhum produto lançado nesta visita.</td></tr>'}</tbody></table>

      <div class="band">Praga(s) Combatida(s)</div>
      <p class="lin">${esc(pragas || '—')}</p>
      <p class="nota">*Outras informações dos produtos utilizados estão no ANEXO A deste documento.</p>

      <div class="sign2">
        <div>${img(assinaturaTec)}<span class="signline">${esc(tecnico)}<br/>Técnico executante do serviço</span></div>
        <div>${img(sig.companySignature)}<span class="signline">${esc(org.technicalResponsibleName)}<br/>${esc(org.technicalResponsibleRegistry)}<br/>Responsável Técnico</span></div>
      </div>
      ${rodape}
    </section>

    <section class="mippage">
      ${marca()}
      <h3>ANEXO A — Lista de informações complementares de produtos</h3>
      <table class="mon"><thead><tr>
        <th>Produto(s)</th><th>Grupo Químico</th><th>Princípio Ativo</th><th>Reg. M.S.</th><th>Antídoto</th><th>Tratamento</th>
      </tr></thead><tbody>${linhasAnexo || '<tr><td colspan="6" style="color:#94a3b8">Nenhum produto lançado nesta visita.</td></tr>'}</tbody></table>

      <h3>4. Monitoramento / Verificação</h3>
      <table class="mon"><thead><tr>
        <th style="width:16%">Imagem</th><th>Atividade Realizada</th><th>Local da Atividade</th><th>Como foi Realizada</th><th>Ação</th>
      </tr></thead><tbody>${linhasVerif || '<tr><td colspan="5" style="color:#94a3b8">Sem verificação registrada nesta visita.</td></tr>'}</tbody></table>
      <p class="lin"><strong>Monitoramento/verificações realizados em ${esc(dataServico)} pelo técnico ${esc(tecnico)}</strong></p>
      ${rodape}
    </section>

    <section class="mippage">
      ${marca()}
      <h3>5. Não Conformidades e/ou Medidas Corretivas</h3>
      <table class="mon"><thead><tr>
        <th style="width:22%">Imagem</th><th>Local</th><th>Não Conformidade</th><th>Ação Corretiva</th>
      </tr></thead><tbody>${linhasNc || '<tr><td colspan="4" style="color:#94a3b8">Nenhuma não conformidade em aberto.</td></tr>'}</tbody></table>
      <p class="lin"><strong>Não conformidades verificadas em ${esc(dataServico)} pelo técnico ${esc(tecnico)}</strong></p>
      ${rodape}
    </section>`;

  openPrint(`Relatorio MIP ${customer.name}`, body, output);
}

export function printNonConformityReport(customer: Customer, items: NonConformity[], output: DocumentOutput = 'imprimir'): void {
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
  openPrint(`Nao Conformidade ${customer.name}`, body, output);
}
