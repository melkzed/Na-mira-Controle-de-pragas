-- ============================================================================
-- Na Mira · Controle de Pragas — Fase 2, App do Técnico: Abastecimento de
-- veículo (fuelLogsStore), Ponto (timeClockStore), Armadilhas/MIP
-- (trapsStore).
-- Rodar no SQL Editor do Supabase, depois de db/migrate_ids_to_text.sql.
-- Idempotente.
-- ============================================================================

-- ── vehicle_fuel_logs: schema.sql original não tinha org_id/technician_id
--    (obrigatórios no domínio FuelLog) nem odometer_start/odometer_end/
--    amount/notes — colunas completadas direto em schema.sql desta vez
--    (tabela nova/vazia, sem risco de dado existente). id/vehicle_id já
--    corrigidos lá também (gerado no cliente, e opcional no domínio). ──────
alter table public.vehicle_fuel_logs alter column id type text using id::text;
alter table public.vehicle_fuel_logs alter column id set default gen_random_uuid()::text;

create table if not exists public.time_clock_entries (
  id             text primary key default gen_random_uuid()::text,
  org_id         uuid not null references public.organizations(id) on delete cascade,
  technician_id  uuid not null references public.users(id) on delete cascade,
  type           text not null,
  timestamp      timestamptz not null default now()
);

create table if not exists public.trap_devices (
  id                 text primary key default gen_random_uuid()::text,
  org_id             uuid not null references public.organizations(id) on delete cascade,
  customer_id        text not null references public.customers(id) on delete cascade,
  code               text not null,
  type               text not null,
  location           text,
  status             text not null default 'ativa',
  installed_at       timestamptz,
  next_inspection_at timestamptz,
  responsible_id     uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now()
);

create table if not exists public.trap_inspections (
  id            text primary key default gen_random_uuid()::text,
  trap_id       text not null references public.trap_devices(id) on delete cascade,
  date          timestamptz not null default now(),
  consumed      boolean not null default false,
  action        text,
  technician_id uuid references public.users(id) on delete set null,
  notes         text
);

do $$
declare
  t text;
begin
  foreach t in array array['vehicle_fuel_logs', 'time_clock_entries', 'trap_devices', 'trap_inspections']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Lembrete: depois de criar as tabelas novas, rode db/rls.sql de novo — a
-- política org_isolation é criada por introspecção de toda tabela com
-- org_id. trap_inspections NÃO tem org_id (herda o isolamento via trap_id →
-- trap_devices.org_id) — sem política própria por padrão; se isso importar
-- pra você, adicione uma policy manual usando um EXISTS contra trap_devices.
