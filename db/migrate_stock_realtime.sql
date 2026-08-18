-- ============================================================================
-- Na Mira · Controle de Pragas — Fase 2, Estoque: saldos (stockStore),
-- solicitações de reposição (stockRequestsStore) e solicitações de
-- equipamento (equipmentRequestsStore).
-- Rodar no SQL Editor do Supabase, depois de db/migrate_ids_to_text.sql.
-- Idempotente.
-- ============================================================================

-- ── stock_balances/stock_locations: id gerado no cliente (mesmo motivo de
--    migrate_ids_to_text.sql). location_id É referenciado pela política
--    "tech_own_stock" (db/rls.sql) — precisa derrubar a política antes de
--    trocar o tipo da coluna, senão o Postgres recusa o ALTER. ────────────
drop policy if exists tech_own_stock on public.stock_balances;

alter table public.stock_balances drop constraint if exists stock_balances_location_id_fkey;
alter table public.stock_movements drop constraint if exists stock_movements_from_location_id_fkey;
alter table public.stock_movements drop constraint if exists stock_movements_to_location_id_fkey;

alter table public.stock_locations alter column id type text using id::text;
alter table public.stock_locations alter column id set default gen_random_uuid()::text;
alter table public.stock_balances   alter column id type text using id::text;
alter table public.stock_balances   alter column id set default gen_random_uuid()::text;
alter table public.stock_balances   alter column location_id type text using location_id::text;
alter table public.stock_movements  alter column from_location_id type text using from_location_id::text;
alter table public.stock_movements  alter column to_location_id type text using to_location_id::text;
-- product_id já é text (convertido em migrate_ids_to_text.sql).
-- batch_id referencia product_batches, tabela não usada pelo app hoje — deixa como está.

alter table public.stock_balances  add constraint stock_balances_location_id_fkey foreign key (location_id) references public.stock_locations(id) on delete cascade;
alter table public.stock_movements add constraint stock_movements_from_location_id_fkey foreign key (from_location_id) references public.stock_locations(id) on delete set null;
alter table public.stock_movements add constraint stock_movements_to_location_id_fkey foreign key (to_location_id) references public.stock_locations(id) on delete set null;

-- Recria a política (mesma definição de db/rls.sql) — sem isso, ninguém no
-- papel "tecnico" enxergaria stock_balances até rodar db/rls.sql de novo.
create policy tech_own_stock on public.stock_balances
  for all
  using (
    org_id = auth_org_id()
    and (
      auth_role() <> 'tecnico'
      or location_id in (
        select id from public.stock_locations
        where owner_id = auth_user_id()
      )
    )
  )
  with check (org_id = auth_org_id());

-- Os ids de local de estoque são fixos no frontend (ver
-- src/infrastructure/seed/data.ts → stockLocations): "loc-central" +
-- um "loc-t<n>" por técnico. Sem uma linha em stock_locations pra cada um,
-- a FK acima rejeita qualquer stock_balances novo — cria "loc-central"
-- (idempotente). Só roda se houver exatamente 1 organização (o app assume
-- um projeto Supabase por empresa) — "loc-central" é PK única, então com
-- mais de uma org o insert abaixo teria que ser refeito manualmente por org.
insert into public.stock_locations (id, org_id, kind, name, owner_id)
select 'loc-central', o.id, 'central', 'Estoque Central', null
from public.organizations o
where (select count(*) from public.organizations) = 1
on conflict (id) do nothing;

-- Atenção: as linhas "loc-t<n>" (uma por técnico) e o campo owner_id de cada
-- uma precisam ser cadastradas/ajustadas por você — o app não tem uma tela
-- de cadastro de locais de estoque, e este script não sabe o id real (uuid)
-- de cada técnico no seu projeto. Exemplo pra cada técnico que já existir em
-- public.users:
--   insert into public.stock_locations (id, org_id, kind, name, owner_id)
--   values ('loc-t1', '<org_id>', 'tecnico', 'Estoque · <nome>', '<user_id>')
--   on conflict (id) do nothing;
-- Enquanto não fizer isso, a política "tech_own_stock" nega TUDO pro técnico
-- nessas linhas (fail-closed) — o gestor/admin continua enxergando normal.

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
