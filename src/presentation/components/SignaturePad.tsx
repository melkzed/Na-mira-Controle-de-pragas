import { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';
import { Button } from './ui/Button';

/**
 * Bloco de assinatura eletrônica (canvas). Desenha com mouse ou toque, permite
 * limpar e devolve a assinatura como dataURL (PNG) via onChange.
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
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  // Prepara o canvas (resolução real conforme o DPR) e carrega valor existente.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, height);
      img.src = value;
    }
  }, [height]); // eslint-disable-line react-hooks/exhaustive-deps

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
    onChange(canvasRef.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
    onChange(undefined);
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
        {!dirty && !value && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Assine aqui</span>}
      </div>
      <div className="mt-1.5 flex justify-end">
        <Button type="button" variant="ghost" size="sm" leftIcon={<Eraser size={13} />} onClick={clear}>Limpar</Button>
      </div>
    </div>
  );
}
