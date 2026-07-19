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

create or replace function auth_role() returns text
  language sql stable as $$ select current_setting('request.jwt.claims', true)::jsonb ->> 'role' $$;

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

-- ============================================================================
-- Observações:
--  • As tabelas de junção sem org_id (ex.: team_members, service_order_pests)
--    herdam a proteção via FKs às tabelas com RLS; adicione políticas próprias
--    se forem acessadas diretamente pelo cliente.
--  • Ajuste os papéis conforme sua regra de negócio (ex.: 'estoque' pode
--    precisar de acesso a stock_* em toda a org).
-- ============================================================================
