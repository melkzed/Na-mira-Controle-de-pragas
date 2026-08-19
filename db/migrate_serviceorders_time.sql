-- ============================================================================
-- Na Mira · Controle de Pragas — adiciona o horário do serviço à O.S.
-- Rodar no SQL Editor do Supabase, DEPOIS de db/migrate_serviceorders_realtime.sql.
-- Idempotente.
-- ============================================================================

-- Sem horário, a O.S. só tinha data — o agendamento vinculado (appointments)
-- caía sempre em meia-noite, então não dava pra posicionar a visita na
-- Agenda nem pra roteirização (lib/route.ts) tratar como hora marcada.
alter table public.service_orders
  add column if not exists execution_time text;
