import { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, Upload } from 'lucide-react';
import { Button } from './ui/Button';

/**
 * Bloco de assinatura eletrônica (canvas). Desenha com mouse ou toque, aceita
 * upload de um arquivo de imagem da assinatura, permite limpar e devolve o
 * resultado como dataURL (PNG) via onChange.
 */
export function SignaturePad({
  value,
  onChange,
  height = 160,
  label,
}: {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  height?: number;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  /** Última imagem que o canvas está mostrando — evita redesenhar por causa do
   *  eco do próprio onChange (a cada traço o `value` volta igual ao que já
   *  está desenhado, e redesenhar ali causaria piscada). */
  const renderedRef = useRef<string | undefined>();

  // Prepara o canvas (resolução real conforme o DPR) e desenha o valor atual.
  // Depende de `value` de propósito: quem usa o componente pode preencher o
  // valor DEPOIS da montagem (ex.: o cadastro do técnico carrega a assinatura
  // salva num efeito) — sem isso a assinatura existente nunca aparecia.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (renderedRef.current === value) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    // Redimensionar o canvas já o limpa e zera a transformação.
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    renderedRef.current = value;
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, height);
      img.src = value;
      setDirty(true);
    } else {
      setDirty(false);
    }
  }, [height, value]);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    try { canvasRef.current!.setPointerCapture(e.pointerId); } catch { /* ponteiro não capturável */ }
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setDirty(true);
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    emit(canvasRef.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
    emit(undefined);
  };

  /** Avisa quem usa o componente e registra o que ficou desenhado, para o
   *  efeito acima ignorar o eco desse mesmo valor. */
  const emit = (dataUrl?: string) => {
    renderedRef.current = dataUrl;
    onChange(dataUrl);
  };

  /** Carrega um arquivo de imagem (foto/scan da assinatura) e desenha no canvas. */
  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(rect.width / img.width, height / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (rect.width - w) / 2, (height - h) / 2, w, h);
        setDirty(true);
        emit(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      {label && <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><PenLine size={13} /> {label}</p>}
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height, touchAction: 'none' }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="block cursor-crosshair"
        />
        {!dirty && !value && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Assine aqui ou carregue um arquivo</span>}
      </div>
      <div className="mt-1.5 flex justify-end gap-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }}
        />
        <Button type="button" variant="ghost" size="sm" leftIcon={<Upload size={13} />} onClick={() => fileInputRef.current?.click()}>Carregar arquivo</Button>
        <Button type="button" variant="ghost" size="sm" leftIcon={<Eraser size={13} />} onClick={clear}>Limpar</Button>
      </div>
    </div>
  );
}
