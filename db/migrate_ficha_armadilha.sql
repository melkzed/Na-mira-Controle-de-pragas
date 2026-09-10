-- ============================================================================
-- Ficha da armadilha igual em campo e no escritório
--
-- A instalação em campo pedia três campos (código, tipo, local) e o escritório
-- cinco. Agora as duas fichas pedem os mesmos seis — os três acima mais
-- situação, próxima inspeção prevista e observação — e a data de instalação e
-- o responsável, que em campo continuam vindo prontos (hoje e o próprio
-- técnico), passam a ficar visíveis e editáveis: armadilha instalada ontem e
-- cadastrada hoje é rotina.
--
-- `status`, `installed_at`, `next_inspection_at` e `responsible_id` já existem
-- em `trap_devices` desde `migrate_campo_realtime.sql`. Falta só a observação.
--
-- Sem esta migration o app funciona e as duas fichas ficam iguais — só que a
-- observação não é gravada em modo Supabase.
-- ============================================================================

alter table public.trap_devices
  add column if not exists notes text;

comment on column public.trap_devices.notes is
  'Observação da instalação — acesso difícil, chave com terceiro, ponto compartilhado…';

notify pgrst, 'reload schema';

-- Conferência: a coluna precisa aparecer.
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'trap_devices'
   and column_name = 'notes';
