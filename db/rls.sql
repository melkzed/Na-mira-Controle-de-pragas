-- ============================================================================
-- Na Mira · Controle de Pragas — Row Level Security (Supabase/PostgreSQL)
-- Aplicar após db/schema.sql. Isola dados por organização (multi-tenant) e
-- restringe o técnico aos próprios registros.
-- ----------------------------------------------------------------------------
-- Pressupõe JWT (Supabase Auth) com claims: org_id, role, user_id.
-- ============================================================================

-- Helpers que leem os claims do token autenticado.
create or replace function auth_org_id() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'org_id','')::uuid $$;

-- Lê "app_role" (papel da aplicação), não "role" — esse último é reservado
-- pelo PostgREST para a role do Postgres da conexão (ver db/auth_hook.sql).
create or replace function auth_role() returns text
  language sql stable as $$ select current_setting('request.jwt.claims', true)::jsonb ->> 'app_role' $$;

create or replace function auth_user_id() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_id','')::uuid $$;

-- ---------------------------------------------------------------------------
-- 1) Habilita RLS e cria a política de ISOLAMENTO POR ORGANIZAÇÃO em todas as
--    tabelas de negócio que possuem a coluna org_id.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'org_id'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    -- Acesso restrito à organização do usuário autenticado.
    execute format($p$
      drop policy if exists org_isolation on public.%1$I;
      create policy org_isolation on public.%1$I
        for all
        using (org_id = auth_org_id())
        with check (org_id = auth_org_id());
    $p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Restrições específicas do TÉCNICO (além do isolamento por org).
--    Técnico só enxerga/edita os próprios atendimentos e ordens de serviço.
--    Demais papéis (admin, supervisor, atendimento...) seguem a política de org.
-- ---------------------------------------------------------------------------

-- Agendamentos
drop policy if exists tech_own_appointments on public.appointments;
create policy tech_own_appointments on public.appointments
  for all
  using (
    org_id = auth_org_id()
    and (auth_role() <> 'tecnico' or technician_id = auth_user_id())
  )
  with check (
    org_id = auth_org_id()
    and (auth_role() <> 'tecnico' or technician_id = auth_user_id())
  );

-- Ordens de serviço
drop policy if exists tech_own_service_orders on public.service_orders;
create policy tech_own_service_orders on public.service_orders
  for all
  using (
    org_id = auth_org_id()
    and (auth_role() <> 'tecnico' or technician_id = auth_user_id())
  )
  with check (
    org_id = auth_org_id()
    and (auth_role() <> 'tecnico' or technician_id = auth_user_id())
  );

-- Estoque individual: técnico só vê os saldos do próprio local de estoque.
drop policy if exists tech_own_stock on public.stock_balances;
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

-- ---------------------------------------------------------------------------
-- 3) Módulos exclusivamente administrativos: bloqueia leitura para o técnico.
--    (Isolamento por org já vale; aqui negamos explicitamente o papel técnico.)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'finance_entries','finance_accounts','finance_categories','commissions',
    'invoices','fiscal_settings','licenses','inspections','audit_logs'
  ]
  loop
    execute format('drop policy if exists org_isolation on public.%I;', t);
    execute format($p$
      create policy staff_only on public.%1$I
        for all
        using (org_id = auth_org_id() and auth_role() <> 'tecnico')
        with check (org_id = auth_org_id() and auth_role() <> 'tecnico');
    $p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Tabelas sem coluna org_id própria — a varredura automática do passo (1)
--    não as alcança. O cliente (supabase-js/PostgREST) pode consultá-las
--    diretamente, então cada uma precisa de política explícita, herdando o
--    isolamento por organização via FK para a tabela-pai.
-- ---------------------------------------------------------------------------

-- organizations: cada usuário só enxerga a própria organização (linha única).
alter table public.organizations enable row level security;
alter table public.organizations force row level security;
drop policy if exists org_self on public.organizations;
create policy org_self on public.organizations
  for all
  using (id = auth_org_id())
  with check (id = auth_org_id());

-- permissions / role_permissions: catálogo global (não por organização) —
-- leitura liberada para qualquer usuário autenticado; sem política de escrita,
-- então INSERT/UPDATE/DELETE do cliente ficam bloqueados por padrão (só a
-- service role, usada em migrações, pode alterar).
alter table public.permissions enable row level security;
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions
  for select
  using (auth.role() = 'authenticated');

alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions
  for select
  using (auth.role() = 'authenticated');

-- Tabelas de junção/detalhe: isolamento via FK para a tabela-pai (que já tem
-- org_id e RLS pelo passo 1). O padrão é sempre o mesmo — usar/checar que o
-- pai pertence à organização do usuário autenticado.
alter table public.user_permissions enable row level security;
alter table public.user_permissions force row level security;
drop policy if exists user_permissions_org on public.user_permissions;
create policy user_permissions_org on public.user_permissions
  for all
  using (user_id in (select id from public.users where org_id = auth_org_id()))
  with check (user_id in (select id from public.users where org_id = auth_org_id()));

alter table public.team_members enable row level security;
alter table public.team_members force row level security;
drop policy if exists team_members_org on public.team_members;
create policy team_members_org on public.team_members
  for all
  using (team_id in (select id from public.teams where org_id = auth_org_id()))
  with check (team_id in (select id from public.teams where org_id = auth_org_id()));

alter table public.equipment_maintenance enable row level security;
alter table public.equipment_maintenance force row level security;
drop policy if exists equipment_maintenance_org on public.equipment_maintenance;
create policy equipment_maintenance_org on public.equipment_maintenance
  for all
  using (equipment_id in (select id from public.equipment where org_id = auth_org_id()))
  with check (equipment_id in (select id from public.equipment where org_id = auth_org_id()));

alter table public.vehicle_fuel_logs enable row level security;
alter table public.vehicle_fuel_logs force row level security;
drop policy if exists vehicle_fuel_logs_org on public.vehicle_fuel_logs;
create policy vehicle_fuel_logs_org on public.vehicle_fuel_logs
  for all
  using (vehicle_id in (select id from public.vehicles where org_id = auth_org_id()))
  with check (vehicle_id in (select id from public.vehicles where org_id = auth_org_id()));

alter table public.vehicle_maintenance enable row level security;
alter table public.vehicle_maintenance force row level security;
drop policy if exists vehicle_maintenance_org on public.vehicle_maintenance;
create policy vehicle_maintenance_org on public.vehicle_maintenance
  for all
  using (vehicle_id in (select id from public.vehicles where org_id = auth_org_id()))
  with check (vehicle_id in (select id from public.vehicles where org_id = auth_org_id()));

alter table public.appointment_products enable row level security;
alter table public.appointment_products force row level security;
drop policy if exists appointment_products_org on public.appointment_products;
create policy appointment_products_org on public.appointment_products
  for all
  using (appointment_id in (select id from public.appointments where org_id = auth_org_id()))
  with check (appointment_id in (select id from public.appointments where org_id = auth_org_id()));

alter table public.service_order_products enable row level security;
alter table public.service_order_products force row level security;
drop policy if exists service_order_products_org on public.service_order_products;
create policy service_order_products_org on public.service_order_products
  for all
  using (service_order_id in (select id from public.service_orders where org_id = auth_org_id()))
  with check (service_order_id in (select id from public.service_orders where org_id = auth_org_id()));

alter table public.service_order_pests enable row level security;
alter table public.service_order_pests force row level security;
drop policy if exists service_order_pests_org on public.service_order_pests;
create policy service_order_pests_org on public.service_order_pests
  for all
  using (service_order_id in (select id from public.service_orders where org_id = auth_org_id()))
  with check (service_order_id in (select id from public.service_orders where org_id = auth_org_id()));

alter table public.service_order_equipment enable row level security;
alter table public.service_order_equipment force row level security;
drop policy if exists service_order_equipment_org on public.service_order_equipment;
create policy service_order_equipment_org on public.service_order_equipment
  for all
  using (service_order_id in (select id from public.service_orders where org_id = auth_org_id()))
  with check (service_order_id in (select id from public.service_orders where org_id = auth_org_id()));

alter table public.crm_activities enable row level security;
alter table public.crm_activities force row level security;
drop policy if exists crm_activities_org on public.crm_activities;
create policy crm_activities_org on public.crm_activities
  for all
  using (lead_id in (select id from public.crm_leads where org_id = auth_org_id()))
  with check (lead_id in (select id from public.crm_leads where org_id = auth_org_id()));

-- ============================================================================
-- Observações:
--  • Ajuste os papéis conforme sua regra de negócio (ex.: 'estoque' pode
--    precisar de acesso a stock_* em toda a org).
--  • auth_org_id()/auth_role()/auth_user_id() só funcionam se o JWT emitido
--    pelo Supabase Auth carregar os claims org_id/role/user_id — isso exige
--    um Custom Access Token Hook (Auth Hooks) lendo public.users pelo
--    auth_user_id. Sem o hook, toda política acima nega tudo por padrão
--    (fail-closed): mais seguro que vazar dados, mas o app não funciona até
--    o hook estar configurado.
-- ============================================================================
