import { useState, type ChangeEvent } from 'react';
import { Camera, X } from 'lucide-react';
import { Field } from './ui/Field';
import { photoSrc, resizeImage, uploadImage } from '@/lib/photoStorage';
import { toast } from '@/store/toastStore';
import type { StoredImage } from '@/domain/types';

/**
 * Campo de fotos — tirar/escolher, reduzir e subir para o Storage.
 *
 * A não conformidade já fazia isso dentro do próprio formulário. Como a
 * armadilha passou a ter foto do ponto, o fluxo virou este componente: a
 * imagem é reduzida antes de subir (é o técnico em campo, no pacote de dados
 * dele) e o que fica guardado é a referência devolvida pelo Storage.
 */
export function PhotoField({ label, hint, folder, value, onChange, max = 4, disabled }: {
  label: string;
  hint?: string;
  /** Pasta no Storage — separa as fotos por origem ('armadilha', 'nao-conformidade'…). */
  folder: string;
  value: StoredImage[];
  onChange: (fotos: StoredImage[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const [enviando, setEnviando] = useState(false);

  const adicionar = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, max - value.length);
    e.target.value = '';
    if (!files.length) return;
    setEnviando(true);
    try {
      const novas: StoredImage[] = [];
      for (const file of files) {
        const reduzida = await resizeImage(file);
        novas.push(await uploadImage(reduzida, folder, file.name));
      }
      onChange([...value, ...novas]);
    } catch {
      toast('Não foi possível anexar a foto. Tente novamente.', { tone: 'danger' });
    } finally {
      setEnviando(false);
    }
  };

  const cheio = value.length >= max;

  return (
    <Field label={label} hint={hint}>
      {!disabled && !cheio && (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground transition hover:bg-muted">
          <Camera size={17} />
          {enviando ? 'Enviando…' : 'Tirar foto'}
          <input type="file" accept="image/*" capture="environment" multiple onChange={adicionar} className="hidden" disabled={enviando} />
        </label>
      )}
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((ph, i) => (
            <div key={ph.url ?? i} className="relative">
              <img src={photoSrc(ph)} alt={ph.name ?? `Foto ${i + 1}`} className="h-20 w-24 rounded-lg border border-border object-cover" />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label={`Remover foto ${i + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Field>
  );
}
