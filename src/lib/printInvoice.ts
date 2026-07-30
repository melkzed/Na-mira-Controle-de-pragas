/**
 * NFS-e (SIMULAÇÃO): geração de PDF (impressão) e XML da nota.
 * O layout e o XML são representativos; a emissão real é feita pelo provedor
 * municipal (padrões ABRASF/GINFES etc.).
 */
import type { Customer, Invoice } from '@/domain/types';
import * as seed from '@/infrastructure/seed/data';
import { formatCurrency, formatDocument } from './utils';
import { toast } from '@/store/toastStore';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmt(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('pt-BR') : '—';
}

export function printNfse(invoice: Invoice, customer?: Customer): void {
  const org = seed.orgProfile;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>NFS-e ${invoice.number}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;margin:0;padding:32px}
    .doc{max-width:760px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
    .top{background:#0f172a;color:#fff;padding:18px 22px;display:flex;justify-content:space-between;align-items:center}
    .top h1{font-size:15px;margin:0} .top .n{text-align:right;font-size:12px;color:#cbd5e1}
    .top .n b{display:block;font-size:22px;color:#fff}
    .sec{padding:16px 22px;border-bottom:1px solid #e2e8f0}
    .sec h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 8px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:13px} .grid span{color:#64748b}
    .val{padding:16px 22px;display:flex;justify-content:space-between;align-items:center;background:#f8fafc}
    .val .t{font-size:12px;color:#64748b} .val .v{font-size:24px;font-weight:800;color:#D32F2F}
    .foot{padding:12px 22px;font-size:11px;color:#94a3b8;text-align:center}
    @media print{body{padding:0}.doc{border:0}@page{margin:14mm}}
  </style></head><body>
  <div class="doc">
    <div class="top">
      <div><h1>NOTA FISCAL DE SERVIÇO ELETRÔNICA</h1><div style="font-size:12px;color:#cbd5e1">${esc(org.legalName)} · CNPJ ${esc(org.cnpj)}</div></div>
      <div class="n">Número<b>${esc(invoice.number)}</b>Série ${esc(invoice.series)}</div>
    </div>
    <div class="sec"><h2>Prestador</h2><div class="grid">
      <div><span>Razão social:</span> ${esc(org.legalName)}</div>
      <div><span>CNPJ:</span> ${esc(org.cnpj)}</div>
      <div><span>Município:</span> ${esc(org.city)}/${esc(org.state)}</div>
      <div><span>Emissão:</span> ${esc(fmt(invoice.issuedAt))}</div>
    </div></div>
    <div class="sec"><h2>Tomador</h2><div class="grid">
      <div><span>Nome:</span> ${esc(customer?.name ?? '—')}</div>
      <div><span>Documento:</span> ${esc(formatDocument(customer?.document))}</div>
      <div><span>Endereço:</span> ${esc([customer?.street, customer?.district, customer?.city].filter(Boolean).join(', ') || '—')}</div>
      <div><span>Telefone:</span> ${esc(customer?.phone ?? '—')}</div>
    </div></div>
    <div class="sec"><h2>Discriminação do serviço</h2>
      <p style="font-size:13px;margin:0">${esc(invoice.description)}</p>
      <p style="font-size:12px;color:#64748b;margin:6px 0 0">Código de serviço: 14.02 – Dedetização, desinfecção, higienização e congêneres · ISS ${esc((invoice.taxAmount / invoice.amount * 100).toFixed(1))}%</p>
    </div>
    <div class="val">
      <div><div class="t">Valor do ISS: ${esc(formatCurrency(invoice.taxAmount))}</div><div class="t">Status: ${invoice.status === 'emitida' ? 'Emitida (simulação)' : 'Cancelada'}</div></div>
      <div style="text-align:right"><div class="t">Valor total</div><div class="v">${esc(formatCurrency(invoice.amount))}</div></div>
    </div>
    <div class="foot">Documento gerado por Gestão Dedetizadora — simulação de NFS-e (emissão real via provedor municipal)</div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},150);};</script></body></html>`;
  const w = window.open('', '_blank', 'width=880,height=1000');
  if (!w) { toast('Permita pop-ups para gerar o PDF da NFS-e.', { tone: 'warning' }); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

export function downloadNfseXml(invoice: Invoice, customer?: Customer): void {
  const org = seed.orgProfile;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe>
  <InfNfse numero="${esc(invoice.number)}" serie="${esc(invoice.series)}">
    <DataEmissao>${esc(invoice.issuedAt)}</DataEmissao>
    <Status>${esc(invoice.status)}</Status>
    <Prestador>
      <RazaoSocial>${esc(org.legalName)}</RazaoSocial>
      <Cnpj>${esc(org.cnpj)}</Cnpj>
      <Municipio>${esc(org.city)}/${esc(org.state)}</Municipio>
    </Prestador>
    <Tomador>
      <Nome>${esc(customer?.name ?? '')}</Nome>
      <Documento>${esc(customer?.document ?? '')}</Documento>
    </Tomador>
    <Servico>
      <CodigoServico>14.02</CodigoServico>
      <Discriminacao>${esc(invoice.description)}</Discriminacao>
      <ValorServicos>${invoice.amount.toFixed(2)}</ValorServicos>
      <ValorIss>${invoice.taxAmount.toFixed(2)}</ValorIss>
    </Servico>
  </InfNfse>
</NFSe>`;
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `nfse-${invoice.number}.xml`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
