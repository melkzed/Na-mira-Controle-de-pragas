-- ============================================================================
-- Cor do técnico na agenda
--
-- Cada técnico escolhe uma cor no próprio cadastro; a agenda pinta os
-- atendimentos com ela. Atendimento finalizado sai sempre em verde,
-- independentemente do técnico — isso é regra do aplicativo, não do banco.
--
-- Sem esta coluna o app continua funcionando (a cor é derivada da id do
-- técnico), mas a escolha feita na tela não fica gravada.
-- ============================================================================

alter table public.users
  add column if not exists color text;

comment on column public.users.color is
  'Cor do técnico na agenda, em hexadecimal (#RRGGBB). Nulo = cor derivada da id.';

-- ============================================================================
-- Aprovação de despesas (opcional)
--
-- Com a aprovação ligada, uma conta a pagar só pode ser paga depois que
-- alguém dá o de acordo. Nasce desligada: em equipe pequena quem lança a
-- despesa é quem paga, e o passo só atrasa a baixa. A escolha fica em
-- Configurações → Operacional.
-- ============================================================================

alter table public.fiscal_settings
  add column if not exists require_expense_approval boolean not null default false;

comment on column public.fiscal_settings.require_expense_approval is
  'Exige aprovação da despesa antes do pagamento. Falso = despesa já nasce liberada.';

notify pgrst, 'reload schema';

-- Conferência: as duas colunas precisam aparecer.
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and (   (table_name = 'users' and column_name = 'color')
        or (table_name = 'fiscal_settings' and column_name = 'require_expense_approval'))
 order by table_name;
