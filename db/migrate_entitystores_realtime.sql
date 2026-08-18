-- ============================================================================
-- Na Mira · Controle de Pragas — Fase 2, terceiro lote: os ~16 módulos de
-- cadastro simples que usam a fábrica genérica `createEntityStore`
-- (src/store/createEntityStore.ts) — Usuários, Departamentos, Produtos,
-- Financeiro, Equipamentos, Veículos, Serviços, Não-conformidades, Pragas,
-- Áreas tratadas, Tipos de armadilha, Licenças, Contas a pagar recorrentes,
-- Contas bancárias, Cheques, Empréstimos/Aplicações.
--
-- IMPORTANTE: rodar db/migrate_ids_to_text.sql ANTES deste script — ele
-- corrige o tipo das colunas de id (uuid → text) que products/equipment/
-- vehicles/service_types/pests/treated_areas/licenses/finance_entries
-- precisam ter para aceitar os ids que o app gera no cliente.
--
-- Depois de rodar este script, rode db/rls.sql de novo — a política
-- org_isolation é criada por introspecção (toda tabela com coluna org_id),
-- então as 7 tabelas novas (departments, non_conformities, trap_types,
-- recurring_payables, bank_accounts, checks, loan_investments) só ficam
-- protegidas por RLS depois desse re-run. Idempotente, não afeta as tabelas
-- já protegidas.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- ── Tabelas novas (não existiam em schema.sql) ──────────────────────────────
-- Todas usam id `text` (gerado no cliente) desde já — ver migrate_ids_to_text.sql
-- para o porquê.

create table if not exists public.departments (
  id         text primary key default gen_random_uuid()::text,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  modules    jsonb not null default '[]'::jsonb,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.non_conformities (
  id                text primary key default gen_random_uuid()::text,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  customer_id       text references public.customers(id) on delete cascade,
  date              timestamptz not null default now(),
  category          text not null,
  description       text not null,
  priority          text not null default 'normal',
  corrective_action text,
  status            text not null default 'aberta',
  photos            jsonb,
  created_by        text,
  created_at        timestamptz not null default now()
);

create table if not exists public.trap_types (
  id        text primary key default gen_random_uuid()::text,
  org_id    uuid not null references public.organizations(id) on delete cascade,
  name      text not null,
  is_active boolean not null default true
);

create table if not exists public.recurring_payables (
  id          text primary key default gen_random_uuid()::text,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  description text not null,
  category    text,
  amount      numeric(14,2) not null default 0,
  frequency   text not null,
  due_day     int not null default 1,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.bank_accounts (
  id              text primary key default gen_random_uuid()::text,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  bank            text not null,
  agency          text,
  account         text not null,
  alias           text,
  opening_balance numeric(14,2) not null default 0,
  is_active       boolean not null default true
);

create table if not exists public.checks (
  id                text primary key default gen_random_uuid()::text,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  number            text not null,
  bank              text not null,
  amount            numeric(14,2) not null,
  issue_date        date not null default current_date,
  due_date          date,
  payee             text,
  status            text not null default 'emitido',
  finance_entry_id  text references public.finance_entries(id) on delete set null
);

create table if not exists public.loan_investments (
  id                   text primary key default gen_random_uuid()::text,
  org_id               uuid not null references public.organizations(id) on delete cascade,
  kind                 text not null,
  description          text not null,
  principal            numeric(14,2) not null,
  rate                 numeric(8,4),
  start_date           date not null default current_date,
  due_date             date,
  theoretical_balance  numeric(14,2) not null default 0,
  real_balance         numeric(14,2) not null default 0,
  active               boolean not null default true
);

-- ── Colunas que faltavam nas tabelas já existentes ──────────────────────────

alter table public.users
  add column if not exists field_app_access     boolean not null default false,
  add column if not exists department_id        text references public.departments(id) on delete set null,
  add column if not exists permission_overrides jsonb;

alter table public.products
  add column if not exists chemical_group text,
  add column if not exists antidote      text,
  add column if not exists batches       jsonb default '[]'::jsonb;

alter table public.equipment
  add column if not exists checked_out_at     timestamptz,
  add column if not exists checked_out_to     uuid references public.users(id) on delete set null,
  add column if not exists checked_out_os_id  text,
  add column if not exists checked_out_by     uuid references public.users(id) on delete set null,
  add column if not exists expected_return_at timestamptz,
  add column if not exists history            jsonb;

alter table public.vehicles
  add column if not exists in_operation boolean not null default true;

alter table public.finance_entries
  add column if not exists recurring_id          text references public.recurring_payables(id) on delete set null,
  add column if not exists approval_status       text,
  add column if not exists discount              numeric(12,2),
  add column if not exists payment_method        text,
  add column if not exists bank_account_id       text references public.bank_accounts(id) on delete set null,
  add column if not exists group_id              text,
  add column if not exists tax_kind              text,
  add column if not exists postponed_from        date,
  add column if not exists fiscal_document_name  text,
  add column if not exists fiscal_document_url   text;

-- service_types, pests, treated_areas e licenses já tinham todas as colunas
-- do domínio — só falta habilitar Realtime.

-- ── Realtime — sem isso, mudanças de um usuário só chegam pros outros ao
--    recarregar a página. ──────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'users','departments','products','finance_entries','equipment','vehicles',
    'service_types','non_conformities','pests','treated_areas','trap_types',
    'licenses','recurring_payables','bank_accounts','checks','loan_investments'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
