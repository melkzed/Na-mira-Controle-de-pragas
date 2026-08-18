-- ============================================================================
-- Na Mira · Controle de Pragas — Fase 2, CRM (leadsStore).
-- Rodar no SQL Editor do Supabase, depois de db/migrate_ids_to_text.sql.
-- Idempotente.
-- ============================================================================

-- id gerado no cliente (ex. "l-3f9k2z1") — mesmo motivo de migrate_ids_to_text.sql.
alter table public.crm_activities drop constraint if exists crm_activities_lead_id_fkey;
alter table public.crm_leads alter column id type text using id::text;
alter table public.crm_leads alter column id set default gen_random_uuid()::text;
alter table public.crm_activities alter column lead_id type text using lead_id::text;
alter table public.crm_activities add constraint crm_activities_lead_id_fkey foreign key (lead_id) references public.crm_leads(id) on delete cascade;

-- crm_leads já tinha todas as colunas do domínio (CrmLead) — só falta Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_leads'
  ) then
    alter publication supabase_realtime add table public.crm_leads;
  end if;
end $$;
