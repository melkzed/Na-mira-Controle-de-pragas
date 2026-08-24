/**
 * Fotos do atendimento — envio para o Supabase Storage.
 *
 * Antes a foto ia inteira (data URL base64) dentro da linha do banco, igual
 * já fazia no localStorage. Funcionava, mas não escala: são várias fotos por
 * visita, e cada uma inchava o registro em centenas de KB — pesa no tamanho
 * do banco, no tráfego de cada consulta e no Realtime.
 *
 * Agora, em modo Supabase, o arquivo vai para o bucket `atendimentos` e só a
 * URL fica gravada. No modo standalone (sem Supabase) nada muda: continua
 * como data URL, que é o que o localStorage consegue guardar.
 */
import type { ServiceOrderPhoto } from '@/domain/types';
import { supabase, supabaseEnabled } from './supabaseClient';

/** Bucket do Storage onde as fotos ficam. Criado por db/storage_atendimentos.sql. */
const BUCKET = 'atendimentos';

/** Endereço da imagem, seja ela do Storage ou embutida (fotos antigas). */
export function photoSrc(p: ServiceOrderPhoto): string {
  return p.url ?? p.dataUrl ?? '';
}

/** Converte o canvas/data URL em Blob para subir como arquivo binário —
 *  subir a string base64 desperdiçaria ~33% do tamanho. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] ?? 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Envia a imagem e devolve a foto pronta para gravar.
 *
 * Se o envio falhar (offline em campo, bucket ausente), cai de volta para o
 * data URL embutido em vez de perder a foto — o técnico não pode ficar sem
 * registrar o atendimento por causa de rede ruim. Nesse caso a foto fica
 * pesada, mas existe.
 */
export async function uploadPhoto(
  dataUrl: string,
  phase: ServiceOrderPhoto['phase'],
  name?: string,
): Promise<ServiceOrderPhoto> {
  if (!supabaseEnabled || !supabase) return { dataUrl, phase, name };

  try {
    const blob = dataUrlToBlob(dataUrl);
    const ext = blob.type.split('/')[1] ?? 'jpg';
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, phase, name };
  } catch (e) {
    console.error('[fotos] falha ao enviar para o Storage, gravando embutida', e);
    return { dataUrl, phase, name };
  }
}
