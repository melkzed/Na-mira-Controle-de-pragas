/**
 * Par de botões de documento: baixar o PDF e visualizar/imprimir.
 *
 * O botão principal baixa o arquivo direto — sem abrir janela nem passar pela
 * caixa "Salvar como PDF". O ícone de impressora ao lado abre a pré-visualização
 * do navegador, para quem quer conferir antes ou mandar para a impressora.
 */
import { useState, type ReactNode } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { Button } from '@/presentation/components/ui/Button';
import type { DocumentOutput } from '@/lib/printDocuments';

interface Props {
  /** Rótulo do documento — "OS (PDF)", "Certificado", "Laudo"… */
  label: string;
  icon?: ReactNode;
  /** Gera o documento no formato pedido. */
  onGenerate: (output: DocumentOutput) => void;
  size?: 'sm' | 'md';
}

export function DocumentActions({ label, icon, onGenerate, size = 'sm' }: Props) {
  const [gerando, setGerando] = useState(false);

  const baixar = () => {
    if (gerando) return;
    setGerando(true);
    onGenerate('baixar');
    // A geração é assíncrona (as bibliotecas de PDF entram por import dinâmico)
    // e não devolve promessa aqui; o tempo trava o botão contra o clique duplo,
    // que geraria o mesmo arquivo duas vezes.
    setTimeout(() => setGerando(false), 2500);
  };

  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      <Button
        variant="ghost"
        size={size}
        className="rounded-none"
        leftIcon={gerando ? <Loader2 size={13} className="animate-spin" /> : icon}
        onClick={(e) => { e.stopPropagation(); baixar(); }}
        aria-label={`Baixar ${label} em PDF`}
      >
        {gerando ? 'Gerando…' : label}
      </Button>
      <button
        type="button"
        className="border-l border-border px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={(e) => { e.stopPropagation(); onGenerate('imprimir'); }}
        aria-label={`Visualizar e imprimir ${label}`}
        title="Visualizar e imprimir"
      >
        <Printer size={13} />
      </button>
    </div>
  );
}
