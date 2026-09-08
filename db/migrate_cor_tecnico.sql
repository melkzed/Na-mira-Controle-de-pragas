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

notify pgrst, 'reload schema';

-- Conferência: deve devolver uma linha com data_type = text.
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'users' and column_name = 'color';
