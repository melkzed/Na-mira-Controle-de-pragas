import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Ponto de corte a partir do qual a coluna aparece na tabela.
 *
 *  Vale lembrar que o corte olha a largura da JANELA, não a do espaço que
 *  sobra para a tabela: o menu lateral do escritório come 256px. Uma tabela
 *  larga em `xl` (1280) ainda estoura numa tela de 1440 — por isso o `2xl`. */
type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const MOSTRAR_A_PARTIR_DE: Record<Breakpoint, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
};

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  /**
   * Esconde a coluna em telas menores que este ponto de corte, em vez de
   * empurrar a tabela para a rolagem lateral. A informação não se perde: no
   * celular cada linha vira um cartão com todos os campos.
   */
  hideBelow?: Breakpoint;
  /** Coluna que dá título ao cartão no celular (a primeira, se nenhuma marcar). */
  primary?: boolean;
  /** Fica de fora do cartão — caixas de seleção e afins, que só fazem sentido na tabela. */
  hideOnCard?: boolean;
}

/**
 * Tabela do sistema.
 *
 * Em telas estreitas cada linha vira um cartão com rótulo e valor, porque
 * arrastar a tabela para os lados para ler o resto das colunas é a pior forma
 * de consultar dados no celular. No desktop segue tabela, e colunas marcadas
 * com `hideBelow` somem antes de a largura estourar.
 */
export function Table<T>({
  columns,
  rows,
  onRowClick,
  keyField,
  empty = 'Nenhum registro encontrado.',
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  keyField: (row: T) => string;
  empty?: string;
}) {
  const colunasDoCartao = columns.filter((c) => !c.hideOnCard);
  const principal = colunasDoCartao.find((c) => c.primary) ?? colunasDoCartao[0];
  const secundarias = colunasDoCartao.filter((c) => c !== principal);

  const acionavel = onRowClick
    ? (row: T) => ({
        role: 'button' as const,
        tabIndex: 0,
        onClick: () => onRowClick(row),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); }
        },
      })
    : () => ({});

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
      {/* Celular: um cartão por registro, sem rolagem lateral. */}
      <div className="divide-y divide-border/60 md:hidden">
        {rows.length === 0 && <p className="px-4 py-10 text-center text-muted-foreground">{empty}</p>}
        {rows.map((row) => (
          <div
            key={keyField(row)}
            {...acionavel(row)}
            className={cn(
              'space-y-2 px-4 py-3',
              onRowClick && 'cursor-pointer transition-colors hover:bg-muted/40 focus:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            )}
          >
            {principal && <div className="text-sm font-medium text-foreground">{principal.render(row)}</div>}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {secundarias.map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{c.header}</dt>
                  <dd className="break-words text-sm text-foreground">{c.render(row)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {/* Desktop: tabela. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:px-4',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.hideBelow && MOSTRAR_A_PARTIR_DE[c.hideBelow],
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                  {empty}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={keyField(row)}
                {...acionavel(row)}
                className={cn(
                  'border-b border-border/60 transition-colors last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-muted/40 focus:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-3 align-top text-foreground lg:px-4',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      c.hideBelow && MOSTRAR_A_PARTIR_DE[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
