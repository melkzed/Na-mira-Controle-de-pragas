import { useRef, type ChangeEvent } from 'react';
import { Camera, X } from 'lucide-react';
import type { ServiceOrderPhoto } from '@/domain/types';
import { cn } from '@/lib/utils';

type Phase = 'antes' | 'durante' | 'apos';
const PHASES: { key: Phase; label: string }[] = [
  { key: 'antes', label: 'Antes' },
  { key: 'durante', label: 'Durante' },
  { key: 'apos', label: 'Após' },
];

/** Redimensiona a imagem (máx. 1000px) e devolve um dataURL JPEG leve. */
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 1000;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(String(reader.result)); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Captura de fotos por fase (antes / durante / após). Usa a câmera no celular
 * (capture) e armazena como dataURL leve. Vinculável à OS ou à visita.
 */
export function PhotoCapture({
  photos,
  onChange,
  compact = false,
  disabled = false,
}: {
  photos: ServiceOrderPhoto[];
  onChange: (next: ServiceOrderPhoto[]) => void;
  compact?: boolean;
  /** Bloqueia adicionar/remover fotos — usado antes de "Iniciar atendimento",
   *  já que a foto serve como registro de que o atendimento está em curso. */
  disabled?: boolean;
}) {
  const inputs = useRef<Record<Phase, HTMLInputElement | null>>({ antes: null, durante: null, apos: null });

  const addFiles = async (phase: Phase, e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 6);
    const added: ServiceOrderPhoto[] = [];
    for (const file of files) {
      try { added.push({ dataUrl: await toDataUrl(file), phase, name: file.name }); } catch { /* ignora */ }
    }
    if (added.length) onChange([...photos, ...added]);
    e.target.value = '';
  };
  const removeAt = (idx: number) => onChange(photos.filter((_, i) => i !== idx));

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {PHASES.map(({ key, label }) => {
        const list = photos.map((p, i) => ({ p, i })).filter(({ p }) => p.phase === key);
        return (
          <div key={key}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">{label}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => inputs.current[key]?.click()}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs transition',
                  disabled ? 'cursor-not-allowed text-muted-foreground/50' : 'text-brand hover:bg-brand-soft',
                )}
              >
                <Camera size={13} /> Adicionar
              </button>
              <input
                ref={(el) => (inputs.current[key] = el)}
                type="file" accept="image/*" capture="environment" multiple
                onChange={(e) => addFiles(key, e)} className="hidden"
                disabled={disabled}
              />
            </div>
            {list.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">Nenhuma foto.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {list.map(({ p, i }) => (
                  <div key={i} className="relative">
                    <img src={p.dataUrl} alt={p.name ?? label} className="h-16 w-20 rounded-lg border border-border object-cover" />
                    {!disabled && (
                      <button type="button" onClick={() => removeAt(i)} aria-label="Remover foto" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white"><X size={11} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
