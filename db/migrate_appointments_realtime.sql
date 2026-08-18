-- ============================================================================
-- Na Mira · Controle de Pragas — completa a tabela appointments e habilita
-- Realtime, para a Fase 2 (dados compartilhados de verdade — Agenda é o
-- segundo módulo migrado, depois de Clientes).
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- Campos do domínio (src/domain/types.ts → Appointment) que ainda não
-- existiam na tabela.
alter table public.appointments
  add column if not exists fixed_time           boolean not null default false,
  add column if not exists technician_notes     text,
  add column if not exists photos               jsonb,
  add column if not exists technician_signature text,
  add column if not exists products             jsonb default '[]'::jsonb;

-- Realtime: sem isso, mudanças feitas por um usuário (ex.: atendimento
-- reagenda uma visita) só chegam pros outros ao recarregar a página.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;
