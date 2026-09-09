-- ============================================================================
-- Relatórios de Monitoramento e MIP — ocorrência e ação tomada na inspeção
--
-- O relatório de monitoramento entregue ao cliente tem duas colunas que o
-- sistema não guardava: "Ocorrência" (o que foi encontrado no dispositivo) e
-- "Ação Tomada" (o que o técnico fez). Até aqui a inspeção só tinha
-- `consumed`, um sim/não, que não distingue isca totalmente consumida de
-- parcialmente consumida, nem consumo de captura.
--
-- `consumed` continua existindo e continua alimentando a taxa de consumo dos
-- indicadores. `action` também: ela muda a SITUAÇÃO da armadilha (retirada,
-- extraviada) e é outra coisa do que o serviço prestado no ponto.
--
-- Sem esta migration o app funciona e os relatórios saem — só que as duas
-- colunas novas ficam vazias em modo Supabase.
-- ============================================================================

alter table public.trap_inspections
  add column if not exists occurrence   text,
  add column if not exists action_taken text;

comment on column public.trap_inspections.occurrence is
  'O que foi encontrado no dispositivo — "Isca Totalmente Consumida", "Com Captura"…';
comment on column public.trap_inspections.action_taken is
  'O que o técnico fez no ponto — "Reposição Isca", "Isca Atrativa"…';

notify pgrst, 'reload schema';

-- Conferência: as duas colunas precisam aparecer.
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'trap_inspections'
   and column_name in ('occurrence', 'action_taken')
 order by column_name;
