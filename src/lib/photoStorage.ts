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
import type { ServiceOrderPhoto, StoredImage } from '@/domain/types';
import { supabase, supabaseEnabled } from './supabaseClient';

/** Bucket do Storage onde as fotos ficam. Criado por db/storage_atendimentos.sql. */
const BUCKET = 'atendimentos';

/** Endereço da imagem, seja ela do Storage ou embutida (fotos antigas). */
export function photoSrc(p: StoredImage): string {
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
export async function uploadImage(dataUrl: string, folder: string, name?: string): Promise<StoredImage> {
  if (!supabaseEnabled || !supabase) return { dataUrl, name };

  try {
    const blob = dataUrlToBlob(dataUrl);
    const ext = blob.type.split('/')[1] ?? 'jpg';
    const path = `${folder}/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, name };
  } catch (e) {
    console.error('[fotos] falha ao enviar para o Storage, gravando embutida', e);
    return { dataUrl, name };
  }
}

/** Foto de atendimento — mesma subida, com a fase que a OS precisa. */
export async function uploadPhoto(
  dataUrl: string,
  phase: ServiceOrderPhoto['phase'],
  name?: string,
): Promise<ServiceOrderPhoto> {
  return { ...(await uploadImage(dataUrl, 'atendimento', name)), phase };
}

/**
 * Reduz a imagem antes de subir. Foto de celular hoje sai com 3 a 12 MB, e a
 * seção 5 do MIP mostra a imagem num quadro pequeno — subir o original gasta
 * o pacote de dados do técnico em campo sem melhorar nada no documento.
 */
export function resizeImage(file: File, maxSide = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('não foi possível ler o arquivo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('arquivo não é uma imagem válida'));
      img.onload = () => {
        const escala = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(String(reader.result)); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
