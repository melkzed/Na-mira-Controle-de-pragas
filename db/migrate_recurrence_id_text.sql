-- ============================================================================
-- Na Mira · Controle de Pragas — recurrence_id passa a ser text
--
-- Sintoma: criar uma OS recorrente falha em TODAS as visitas, com
--   22P02 invalid input syntax for type uuid: "rec-coqspft"
--
-- Causa: `appointments.recurrence_id` ficou como `uuid`, mas quem gera esse id
-- é o aplicativo, com o mesmo formato prefixado de todos os outros ids dele
-- ("rec-xxxxxxx"). A migração que converteu os ids para `text`
-- (db/migrate_ids_to_text.sql) cuidou das chaves primárias e das colunas que
-- as referenciam, e deixou esta de fora — ela não é FK para tabela nenhuma,
-- é só um agrupador das visitas de um mesmo plano.
--
-- Sem recorrência ninguém tinha esbarrado nisso.
--
-- Rode uma vez. É idempotente: se a coluna já for text, não faz nada.
-- ============================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'appointments'
       and column_name = 'recurrence_id' and data_type = 'uuid'
  ) then
    alter table public.appointments alter column recurrence_id type text using recurrence_id::text;
  end if;
end $$;

notify pgrst, 'reload schema';
