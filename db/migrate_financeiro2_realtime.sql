-- ============================================================================
-- Na Mira · Controle de Pragas — Fase 2, Financeiro complementar: Notas
-- fiscais emitidas (invoicesStore), Transações bancárias
-- (bankTransactionsStore), Fechamento de caixa (cashClosingStore).
-- Rodar no SQL Editor do Supabase, depois de db/migrate_ids_to_text.sql e
-- db/migrate_entitystores_realtime.sql (precisa de bank_accounts existir).
-- Idempotente.
-- ============================================================================

-- ── invoices: id gerado no cliente (ex. "inv-3f9k2z1") — mesmo motivo de
--    migrate_ids_to_text.sql. `number` também vira bigint (era `text`; o
--    app trata como número para a numeração sequencial). ───────────────────
alter table public.invoices alter column id type text using id::text;
alter table public.invoices alter column id set default gen_random_uuid()::text;
alter table public.invoices alter column number type bigint using nullif(number, '')::bigint;

alter table public.invoices
  add column if not exists provider          text,
  add column if not exists access_key        text,
  add column if not exists protocol          text,
  add column if not exists verification_code text,
  add column if not exists message           text,
  add column if not exists taxes             jsonb;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invoices'
  ) then
    alter publication supabase_realtime add table public.invoices;
  end if;
end $$;

-- ── Tabelas novas ────────────────────────────────────────────────────────
create table if not exists public.bank_transactions (
  id                      text primary key default gen_random_uuid()::text,
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  account_id              text not null references public.bank_accounts(id) on delete cascade,
  type                    text not null,
  amount                  numeric(14,2) not null,
  date                    timestamptz not null default now(),
  description             text,
  reconciled              boolean not null default false,
  related_finance_entry_id text references public.finance_entries(id) on delete set null,
  transfer_pair_id        text references public.bank_transactions(id) on delete set null
);

create table if not exists public.cash_closings (
  id         text primary key default gen_random_uuid()::text,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  date       date not null default current_date,
  total_in   numeric(14,2) not null default 0,
  total_out  numeric(14,2) not null default 0,
  balance    numeric(14,2) not null default 0,
  closed_by  uuid references public.users(id) on delete set null,
  closed_at  timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['bank_transactions', 'cash_closings']
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
