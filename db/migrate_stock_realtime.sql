-- ============================================================================
-- Na Mira · Controle de Pragas — Fase 2, Estoque: saldos (stockStore),
-- solicitações de reposição (stockRequestsStore) e solicitações de
-- equipamento (equipmentRequestsStore).
-- Rodar no SQL Editor do Supabase, depois de db/migrate_ids_to_text.sql.
-- Idempotente.
-- ============================================================================

-- ── stock_balances: id/location_id gerados no cliente (mesmo motivo de
--    migrate_ids_to_text.sql). location_id nunca teve uma tabela
--    stock_locations de verdade por trás no app (é um rótulo livre, tipo
--    "loc-central") — dropa essa FK "aspiracional" em vez de recriar. ──────
alter table public.stock_balances drop constraint if exists stock_balances_location_id_fkey;
alter table public.stock_balances alter column id type text using id::text;
alter table public.stock_balances alter column id set default gen_random_uuid()::text;
alter table public.stock_balances alter column location_id type text using location_id::text;
-- product_id já é text (convertido em migrate_ids_to_text.sql).
-- batch_id referencia product_batches, tabela não usada pelo app hoje — deixa como está.

create table if not exists public.stock_requests (
  id               text primary key default gen_random_uuid()::text,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  product_id       text not null references public.products(id) on delete restrict,
  quantity         numeric(14,3) not null,
  requested_by     uuid references public.users(id) on delete set null,
  service_order_id text references public.service_orders(id) on delete set null,
  appointment_id   text references public.appointments(id) on delete set null,
  note             text,
  status           text not null default 'pendente',
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

create table if not exists public.equipment_requests (
  id                 text primary key default gen_random_uuid()::text,
  org_id             uuid not null references public.organizations(id) on delete cascade,
  technician_id      uuid not null references public.users(id) on delete cascade,
  equipment_id       text not null references public.equipment(id) on delete cascade,
  note               text,
  status             text not null default 'pendente',
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  resolved_by        uuid references public.users(id) on delete set null,
  expected_return_at timestamptz
);

do $$
declare
  t text;
begin
  foreach t in array array['stock_balances', 'stock_requests', 'equipment_requests']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Lembrete: depois de criar as tabelas novas, rode db/rls.sql de novo (a
-- política org_isolation é criada por introspecção de toda tabela com org_id).
