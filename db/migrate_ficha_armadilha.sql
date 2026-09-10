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
-- A ficha ganhou também a foto do ponto: achar de novo uma armadilha meses
-- depois, só pela descrição escrita, é o que faz o técnico novo perder a
-- visita. O que fica na coluna é a referência devolvida pelo Storage (a mesma
-- forma usada em `non_conformities.photos`), não a imagem.
--
-- `status`, `installed_at`, `next_inspection_at` e `responsible_id` já existem
-- em `trap_devices` desde `migrate_campo_realtime.sql`. Faltam a observação e
-- as fotos.
--
-- Sem esta migration o app funciona e as duas fichas ficam iguais — só que a
-- observação e as fotos não são gravadas em modo Supabase.
-- ============================================================================

alter table public.trap_devices
  add column if not exists notes  text,
  add column if not exists photos jsonb;

comment on column public.trap_devices.notes is
  'Observação da instalação — acesso difícil, chave com terceiro, ponto compartilhado…';
comment on column public.trap_devices.photos is
  'Fotos do ponto de instalação — lista de referências do Storage, como non_conformities.photos.';

notify pgrst, 'reload schema';

-- Conferência: as duas colunas precisam aparecer.
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'trap_devices'
   and column_name in ('notes', 'photos')
 order by column_name;
