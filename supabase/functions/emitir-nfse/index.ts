// Supabase Edge Function — Emissão de NFS-e no padrão NACIONAL (Governo).
//
// Este é o COMPONENTE DE BACKEND obrigatório para emitir nota fiscal direto do
// governo. Ele existe porque a assinatura digital e o TLS mútuo com o webservice
// da Receita Federal NÃO podem ser feitos no navegador (o certificado e-CNPJ
// ficaria exposto). O front-end (app Na Mira) monta a DPS e chama esta função;
// aqui o XML é assinado com o e-CNPJ e transmitido ao ambiente NFS-e Nacional.
//
// Pré-requisitos para produção:
//   1. Certificado e-CNPJ A1 (.pfx) da empresa, em base64, no secret CERT_PFX_BASE64.
//   2. Senha do certificado no secret CERT_PASSWORD.
//   3. Empresa credenciada no ambiente NFS-e Nacional (nfse.gov.br) do município.
//   4. Ajustar tpAmb (1=produção, 2=homologação) e o endpoint abaixo.
//
// Endpoints oficiais (Sefin Nacional):
//   Produção:     https://sefin.nfse.gov.br/sefinnacional/nfse
//   Homologação:  https://sefin.producaorestrita.nfse.gov.br/sefinnacional/nfse
//
// Deploy:  supabase functions deploy emitir-nfse
// Depois, cole a URL da função em Fiscal → Integração NFS-e → "URL do backend".

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const SEFIN_HOMOLOG = 'https://sefin.producaorestrita.nfse.gov.br/sefinnacional/nfse';
const SEFIN_PROD = 'https://sefin.nfse.gov.br/sefinnacional/nfse';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ status: 'rejeitada', message: 'Use POST.' }, 405);

  try {
    const { dps } = await req.json();
    if (!dps?.infDPS) return json({ status: 'rejeitada', message: 'DPS inválida.' }, 400);

    // 1) DPS (JSON) → XML no layout NFS-e Nacional.
    const dpsXml = dpsToXml(dps);

    // 2) Assinar o XML com o certificado e-CNPJ (ICP-Brasil, XMLDSig).
    //    Use uma lib de assinatura XML compatível (ex.: xml-crypto no runtime Node,
    //    ou um microserviço de assinatura). O certificado vem dos secrets:
    //      const pfx = Deno.env.get('CERT_PFX_BASE64');
    //      const pass = Deno.env.get('CERT_PASSWORD');
    const signedXml = await assinarXml(dpsXml); // TODO: implementar assinatura ICP-Brasil

    // 3) GZip + base64 do XML assinado (exigência do Sefin Nacional).
    const gzB64 = await gzipBase64(signedXml);

    // 4) Transmitir ao governo com TLS mútuo (certificado do cliente).
    const ambiente = (Deno.env.get('NFSE_AMBIENTE') ?? 'homolog') === 'prod' ? SEFIN_PROD : SEFIN_HOMOLOG;
    const resp = await fetch(ambiente, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dpsXmlGZipB64: gzB64 }),
      // Nota: o TLS mútuo (client cert) é configurado no ambiente de execução.
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return json({ status: 'rejeitada', message: data?.mensagem ?? `Rejeição (${resp.status}).` });
    }
    // 5) Retornar a NFS-e autorizada ao app.
    return json({
      status: 'emitida',
      chaveAcesso: data?.chaveAcesso,
      protocolo: data?.protocolo ?? data?.nfseXmlGZipB64 ? 'AUTORIZADO' : undefined,
      codigoVerificacao: data?.codigoVerificacao,
      nfseXmlGZipB64: data?.nfseXmlGZipB64,
    });
  } catch (e) {
    return json({ status: 'rejeitada', message: e instanceof Error ? e.message : 'Erro interno.' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ── Implementações a completar em produção ──────────────────────────────────
function dpsToXml(_dps: unknown): string {
  // Converta a DPS (JSON) para o XML do schema DPS v1.00 do NFS-e Nacional.
  throw new Error('dpsToXml: implementar a serialização XML do schema DPS.');
}
async function assinarXml(_xml: string): Promise<string> {
  // Assine com o e-CNPJ (XMLDSig, referência ao Id da infDPS). Guarde o .pfx nos secrets.
  throw new Error('assinarXml: implementar a assinatura ICP-Brasil com o e-CNPJ.');
}
async function gzipBase64(xml: string): Promise<string> {
  const gz = new Response(new Blob([xml]).stream().pipeThrough(new CompressionStream('gzip')));
  const buf = new Uint8Array(await gz.arrayBuffer());
  return btoa(String.fromCharCode(...buf));
}
