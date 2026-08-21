/**
 * Geração de PDF da Ordem de Serviço (client-side, sem dependências).
 * Usa o MESMO modelo visual do Laudo Técnico (mesmo CSS/estrutura de
 * printDocuments.ts) — a diferença é a inclusão do valor do serviço, para
 * que a OS funcione também como Laudo + Recibo em um único documento.
 * Monta um documento HTML formatado e abre a caixa de impressão do navegador
 * — o usuário escolhe "Salvar como PDF". Funciona offline.
 */
import type { ServiceOrder } from '@/domain/types';
import { getCustomer, getEquipment, getProduct, getServiceType, getUser } from '@/application/repository';
import { useSettingsStore } from '@/store/settingsStore';
import { getOrgProfile } from '@/store/orgProfileStore';
import { formatCurrency } from './utils';
import { currentBatch } from './batches';
import { recurrenceSummaryLabel } from './recurrence';
import {
  esc, fmtDate, fmtDateTime, header, licensesBlock, warrantyText, pestWarrantyText,
  pestValidityDate, responsibleSignatureLine, clientTechSignatures,
  openPrint, serviceNames, osPests,
} from './printDocuments';

/** Valor do serviço — usa o valor explicitamente informado na OS; só recorre
 *  à soma do preço padrão dos serviços selecionados para OS antigas, criadas
 *  antes de o campo "Valor do Serviço" existir. */
function serviceValue(so: ServiceOrder): number {
  if (so.serviceValue != null) return so.serviceValue;
  return (so.serviceTypeIds?.length ? so.serviceTypeIds : [so.serviceTypeId])
    .map((id) => getServiceType(id)?.defaultPrice ?? 0)
    .reduce((s, v) => s + v, 0);
}

export function printServiceOrder(so: ServiceOrder): void {
  const c = getCustomer(so.customerId);
  const org = getOrgProfile();
  const techIds = so.technicianIds?.length ? so.technicianIds : [so.technicianId];
  const techName = getUser(techIds[0])?.name ?? '—';
  const helperName = techIds[1] ? getUser(techIds[1])?.name : undefined;
  const sellerName = so.sellerId ? getUser(so.sellerId)?.name : undefined;
  const dataHora = fmtDateTime(so.startedAt ?? so.executionDate ?? so.createdAt);
  const validade = so.validityDate ? fmtDate(so.validityDate) : '—';
  const recorrencia = recurrenceSummaryLabel(so.recurrence);
  const proximaVisita = so.recurrence?.enabled && so.nextVisitDate ? fmtDate(so.nextVisitDate) : undefined;
  const equipNames = (so.equipmentIds ?? []).map((id) => getEquipment(id)?.name).filter(Boolean).join(', ');
  const pests = osPests(so);
  const valor = serviceValue(so);

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
      <td>${esc([prod?.antidote, prod?.treatment].filter(Boolean).join(' · ') || '—')}</td>
    </tr>`;
  }).join('');

  const pestRows = pests.map((p) => `<tr><td>${esc(p?.name)}</td><td>${esc(pestWarrantyText(p, so))}</td><td>${esc(pestValidityDate(p, so))}</td></tr>`).join('');

  const body = `${header('Ordem de Serviço')}
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
        ${esc(c?.document)}<br/>
        ${esc(c?.street)}, ${esc(c?.number ?? 's/n')} ${esc(c?.complement ?? '')}<br/>
        ${esc(c?.district)} | ${esc(c?.city)}-${esc(c?.state)}<br/>
        CEP: ${esc(c?.cep)} Fone: ${esc(c?.phone)}
      </div>
    </div>

    <div class="cesrow">
      <span><strong>OS:</strong> #${esc(so.number)}</span>
      <span><strong>Data/Hora Execução:</strong> ${esc(dataHora)}</span>
      <span><strong>Técnico:</strong> ${esc(techName)}</span>
      <span><strong>Ajudante:</strong> ${esc(helperName ?? '—')}</span>
      ${sellerName ? `<span><strong>Vendedor:</strong> ${esc(sellerName)}</span>` : ''}
    </div>

    <p class="doctitle">ORDEM DE SERVIÇO<span class="sub">Controle de pragas</span></p>
    <p class="center">Validade ${esc(validade)}</p>

    <table><thead><tr><th>Serviço</th><th>Validade</th></tr></thead>
    <tbody><tr><td>${esc(serviceNames(so))}</td><td>${esc(warrantyText(so))}</td></tr></tbody></table>

    <div class="cesrow">
      <span><strong>Valor do Serviço:</strong> ${esc(formatCurrency(valor))}</span>
      <span><strong>Forma de pagamento:</strong> ${esc(so.paymentMethod || '—')}</span>
      <span><strong>Pagamento:</strong> ${esc(so.paymentStatus === 'pago' ? `Pago${so.paymentDate ? ` em ${fmtDate(so.paymentDate)}` : ''}` : 'Pendente')}</span>
      <span><strong>Recorrência:</strong> ${esc(recorrencia)}</span>
      ${proximaVisita ? `<span><strong>Próxima visita:</strong> ${esc(proximaVisita)}</span>` : ''}
    </div>

    <h2>Produtos químicos e métodos empregados</h2>
    <table><thead><tr><th>Grupo Químico</th><th>Produto(s)</th><th>Princípio Ativo</th><th>Nº Lote</th><th>Validade</th><th>Reg. M.S.</th><th>Equipamento(s)</th><th class="r">Qtd. Aplicada</th><th>Antídoto</th></tr></thead>
    <tbody>${productRows || '<tr><td colspan="9" style="color:#94a3b8">Nenhum produto lançado.</td></tr>'}</tbody></table>

    <h2>Praga(s) combatida(s)</h2>
    <table><thead><tr><th>Praga</th><th>Garantia</th><th>Validade</th></tr></thead>
    <tbody>${pestRows || '<tr><td colspan="3" style="color:#94a3b8">—</td></tr>'}</tbody></table>

    <h2>Descrição do serviço executado</h2>
    <p class="lead">${esc(so.areaTreated || 'Não informado.')}${equipNames ? ` · Equipamentos: ${esc(equipNames)}` : ''}</p>
    ${so.procedures ? `<p class="lead">${esc(so.procedures)}</p>` : ''}
    ${c?.permanentNotes ? `<p class="lead"><strong>Observações do contrato:</strong> ${esc(c.permanentNotes)}</p>` : ''}

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

  openPrint(`OS #${so.number} · ${c?.name ?? ''}`, body);
}
