-- ============================================================================
-- Na Mira · Controle de Pragas — Fase 2, Ordens de Serviço (serviceOrdersStore).
-- Rodar no SQL Editor do Supabase, DEPOIS de db/migrate_ids_to_text.sql e
-- db/migrate_entitystores_realtime.sql. Idempotente.
-- ============================================================================

-- ── Fase 1: corrige o tipo do id (mesmo motivo de migrate_ids_to_text.sql —
--    o app gera o próprio id no cliente, ex. "so-3f9k2z1", não um UUID).
--    Precisa derrubar as FKs que apontam pra service_orders(id) antes. ──────
alter table public.service_order_products drop constraint if exists service_order_products_service_order_id_fkey;
alter table public.service_order_pests    drop constraint if exists service_order_pests_service_order_id_fkey;
alter table public.service_order_equipment drop constraint if exists service_order_equipment_service_order_id_fkey;
alter table public.stock_movements        drop constraint if exists stock_movements_so_fk;
alter table public.checklist_runs         drop constraint if exists checklist_runs_service_order_id_fkey;
alter table public.finance_entries        drop constraint if exists finance_entries_service_order_id_fkey;
alter table public.commissions            drop constraint if exists commissions_service_order_id_fkey;
alter table public.invoices               drop constraint if exists invoices_service_order_id_fkey;
alter table public.service_orders         drop constraint if exists service_orders_associated_order_id_fkey;

alter table public.service_orders alter column id type text using id::text;
alter table public.service_orders alter column id set default gen_random_uuid()::text;
alter table public.service_orders alter column associated_order_id type text using associated_order_id::text;

alter table public.service_order_products  alter column service_order_id type text using service_order_id::text;
alter table public.service_order_pests     alter column service_order_id type text using service_order_id::text;
alter table public.service_order_equipment alter column service_order_id type text using service_order_id::text;
alter table public.stock_movements         alter column service_order_id type text using service_order_id::text;
alter table public.checklist_runs          alter column service_order_id type text using service_order_id::text;
alter table public.finance_entries         alter column service_order_id type text using service_order_id::text;
alter table public.commissions             alter column service_order_id type text using service_order_id::text;
alter table public.invoices                alter column service_order_id type text using service_order_id::text;

alter table public.service_order_products  add constraint service_order_products_service_order_id_fkey foreign key (service_order_id) references public.service_orders(id) on delete cascade;
alter table public.service_order_pests     add constraint service_order_pests_service_order_id_fkey foreign key (service_order_id) references public.service_orders(id) on delete cascade;
alter table public.service_order_equipment add constraint service_order_equipment_service_order_id_fkey foreign key (service_order_id) references public.service_orders(id) on delete cascade;
alter table public.stock_movements         add constraint stock_movements_so_fk foreign key (service_order_id) references public.service_orders(id) on delete set null;
alter table public.checklist_runs          add constraint checklist_runs_service_order_id_fkey foreign key (service_order_id) references public.service_orders(id) on delete cascade;
alter table public.finance_entries         add constraint finance_entries_service_order_id_fkey foreign key (service_order_id) references public.service_orders(id) on delete set null;
alter table public.commissions             add constraint commissions_service_order_id_fkey foreign key (service_order_id) references public.service_orders(id) on delete set null;
alter table public.invoices                add constraint invoices_service_order_id_fkey foreign key (service_order_id) references public.service_orders(id) on delete set null;
alter table public.service_orders          add constraint service_orders_associated_order_id_fkey foreign key (associated_order_id) references public.service_orders(id) on delete set null;

-- ── Fase 2: colunas do domínio (src/domain/types.ts → ServiceOrder) que
--    ainda não existiam — a OS "avançada" ganhou muitos campos desde que
--    schema.sql foi desenhado. ─────────────────────────────────────────────
alter table public.service_orders
  add column if not exists technician_ids             jsonb,
  add column if not exists service_type_ids            jsonb,
  add column if not exists area_ids                    jsonb,
  add column if not exists seller_id                   uuid references public.users(id) on delete set null,
  add column if not exists equipment_ids                jsonb,
  add column if not exists payment_method               text,
  add column if not exists payment_status               text,
  add column if not exists payment_date                 timestamptz,
  add column if not exists has_customer_signature       boolean not null default false,
  add column if not exists pest_ids                     jsonb not null default '[]'::jsonb,
  add column if not exists products                     jsonb not null default '[]'::jsonb,
  add column if not exists customer_signature           text,
  add column if not exists technician_signature         text,
  add column if not exists execution_date               timestamptz,
  add column if not exists due_date                     timestamptz,
  add column if not exists validity_date                timestamptz,
  add column if not exists certificate_validity_date     timestamptz,
  add column if not exists pest_validity                 jsonb,
  add column if not exists area_qty                      jsonb,
  add column if not exists technician_message            text,
  add column if not exists location                      jsonb,
  add column if not exists warranty                      jsonb;

-- ── Realtime ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_orders'
  ) then
    alter publication supabase_realtime add table public.service_orders;
  end if;
end $$;
