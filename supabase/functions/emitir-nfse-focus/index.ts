// Supabase Edge Function — Emissão de NFS-e via Focus NFe.
//
// Este é o COMPONENTE DE BACKEND para emitir nota fiscal usando a Focus NFe
// (https://focusnfe.com.br), que já cuida do certificado digital e da
// integração com a prefeitura por conta própria — bem mais simples que a
// integração direta com o governo (sem assinatura XML, sem TLS mútuo). Ainda
// assim precisa rodar num backend: o TOKEN da conta Focus NFe dá acesso total
// à emissão de notas e NÃO pode ser exposto no navegador.
//
// Pré-requisitos:
//   1. Conta na Focus NFe com o CNPJ da empresa habilitado para NFS-e no
//      município de prestação (nem todo município é suportado — confirme
//      antes de contratar).
//   2. Token de acesso (gerado no painel da Focus NFe) no secret FOCUS_NFE_TOKEN.
//   3. Testar em homologação antes de apontar para produção (cfg.environment
//      no app, enviado aqui como "ambiente").
//
// O schema exato do payload de emissão varia por plugin municipal da Focus
// NFe — o formato montado em src/application/fiscal/providers.ts
// (buildFocusNfePayload) é um subconjunto representativo. Confira a
// documentação atual (https://focusnfe.com.br/doc/#nfse-emitir-nota) e ajuste
// os campos ao ativar um município novo.
//
// Emissão na Focus NFe é ASSÍNCRONA: o POST inicial normalmente responde
// "processando_autorizacao", e a autorização sai depois (webhook ou consulta
// posterior). Esta função faz algumas tentativas curtas de consulta antes de
// devolver "processando" ao app — para produção, prefira configurar o webhook
// da Focus NFe para atualizar o status da nota assim que ela for autorizada,
// em vez de depender só deste poll limitado.
//
// Deploy:  supabase functions deploy emitir-nfse-focus
//          supabase secrets set FOCUS_NFE_TOKEN=xxxxx
// Depois, cole a URL da função em Fiscal → Integração NFS-e (Focus NFe) →
// "URL do backend de emissão".

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ status: 'rejeitada', message: 'Use POST.' }, 405);

  const token = Deno.env.get('FOCUS_NFE_TOKEN');
  if (!token) return json({ status: 'rejeitada', message: 'FOCUS_NFE_TOKEN não configurado nos secrets da function.' }, 500);

  try {
    const { payload, ref, ambiente } = await req.json();
    if (!payload || !ref) return json({ status: 'rejeitada', message: 'payload/ref ausentes.' }, 400);

    const baseUrl = ambiente === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';
    const auth = 'Basic ' + btoa(`${token}:`);

    const submit = await fetch(`${baseUrl}/v2/nfse?ref=${encodeURIComponent(ref)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(payload),
    });
    let data = await submit.json().catch(() => ({}));

    if (!submit.ok) return json(mapResult(data), submit.status);

    // Poll curto enquanto a prefeitura ainda não autorizou (ver nota sobre webhook acima).
    for (let i = 0; i < 4 && data?.status === 'processando_autorizacao'; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const check = await fetch(`${baseUrl}/v2/nfse/${encodeURIComponent(ref)}`, { headers: { Authorization: auth } });
      data = await check.json().catch(() => data);
    }

    return json(mapResult(data));
  } catch (e) {
    return json({ status: 'rejeitada', message: e instanceof Error ? e.message : 'Erro interno.' }, 500);
  }
});

function mapResult(data: Record<string, unknown>) {
  if (data.status === 'autorizado') {
    return {
      status: 'emitida',
      numero: data.numero,
      chaveAcesso: data.chave_acesso ?? data.chave_nfse,
      codigoVerificacao: data.codigo_verificacao,
      protocolo: data.numero,
      ref: data.ref,
    };
  }
  if (data.status === 'processando_autorizacao') {
    return { status: 'processando', ref: data.ref, message: 'Ainda em processamento na prefeitura — consulte novamente em instantes.' };
  }
  const erros = data.erros as Array<{ mensagem?: string }> | undefined;
  return { status: 'rejeitada', message: erros?.[0]?.mensagem ?? (data.mensagem as string) ?? 'Rejeição da Focus NFe.', erros };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
