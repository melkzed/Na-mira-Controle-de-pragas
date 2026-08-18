-- ============================================================================
-- Na Mira · Controle de Pragas — corrige o TIPO das colunas de id que o app
-- gera no cliente (ex.: "c-3f9k2z1", "a-8h2p1qz", "prod-1"...).
--
-- schema.sql originalmente definiu essas colunas como `uuid`, mas o app é
-- standalone-first: cada store gera seu próprio id curto no navegador (para
-- permitir escrita otimista — a UI atualiza antes da resposta do servidor),
-- não um UUID de verdade. Sem este fix, criar um registro novo em modo
-- Supabase falha com "invalid input syntax for type uuid".
--
-- `organizations.id` e `users.id` NÃO mudam — vêm de UUIDs reais (Supabase
-- Auth / seed com gen_random_uuid()), e toda referência a eles (org_id,
-- technician_id, assigned_to, driver_id, owner_id, performed_by, created_by,
-- responsible_id) continua `uuid`.
--
-- Rodar no SQL Editor do Supabase. Idempotente (repetir não quebra nada:
-- colunas já em `text` são no-op, `drop constraint if exists` tolera
-- constraint ausente). Rodar ANTES de db/migrate_entitystores_realtime.sql.
-- ============================================================================

-- ── Fase 1: remove as constraints de FK que impedem a troca de tipo ────────
alter table public.product_batches   drop constraint if exists product_batches_product_id_fkey;
alter table public.stock_balances    drop constraint if exists stock_balances_product_id_fkey;
alter table public.stock_movements   drop constraint if exists stock_movements_product_id_fkey;
alter table public.equipment_maintenance drop constraint if exists equipment_maintenance_equipment_id_fkey;
alter table public.vehicle_fuel_logs drop constraint if exists vehicle_fuel_logs_vehicle_id_fkey;
alter table public.vehicle_maintenance drop constraint if exists vehicle_maintenance_vehicle_id_fkey;
alter table public.stock_locations   drop constraint if exists stock_locations_vehicle_id_fkey;
alter table public.appointments      drop constraint if exists appointments_customer_id_fkey;
alter table public.appointments      drop constraint if exists appointments_service_type_id_fkey;
alter table public.appointments      drop constraint if exists appointments_vehicle_id_fkey;
alter table public.appointment_products drop constraint if exists appointment_products_appointment_id_fkey;
alter table public.appointment_products drop constraint if exists appointment_products_product_id_fkey;
alter table public.service_orders    drop constraint if exists service_orders_customer_id_fkey;
alter table public.service_orders    drop constraint if exists service_orders_service_type_id_fkey;
alter table public.service_orders    drop constraint if exists service_orders_appointment_id_fkey;
alter table public.service_order_products drop constraint if exists service_order_products_product_id_fkey;
alter table public.service_order_pests drop constraint if exists service_order_pests_pest_id_fkey;
alter table public.service_order_equipment drop constraint if exists service_order_equipment_equipment_id_fkey;
alter table public.checklist_runs    drop constraint if exists checklist_runs_appointment_id_fkey;
alter table public.finance_entries   drop constraint if exists finance_entries_customer_id_fkey;
alter table public.invoices          drop constraint if exists invoices_customer_id_fkey;
alter table public.crm_leads         drop constraint if exists crm_leads_customer_id_fkey;

-- ── Fase 2: troca o tipo das chaves primárias (id gerado no cliente) ───────
alter table public.customers      alter column id type text using id::text;
alter table public.appointments   alter column id type text using id::text;
alter table public.products       alter column id type text using id::text;
alter table public.equipment      alter column id type text using id::text;
alter table public.vehicles       alter column id type text using id::text;
alter table public.service_types  alter column id type text using id::text;
alter table public.pests          alter column id type text using id::text;
alter table public.treated_areas  alter column id type text using id::text;
alter table public.licenses       alter column id type text using id::text;
alter table public.finance_entries alter column id type text using id::text;

alter table public.customers      alter column id set default gen_random_uuid()::text;
alter table public.appointments   alter column id set default gen_random_uuid()::text;
alter table public.products       alter column id set default gen_random_uuid()::text;
alter table public.equipment      alter column id set default gen_random_uuid()::text;
alter table public.vehicles       alter column id set default gen_random_uuid()::text;
alter table public.service_types  alter column id set default gen_random_uuid()::text;
alter table public.pests          alter column id set default gen_random_uuid()::text;
alter table public.treated_areas  alter column id set default gen_random_uuid()::text;
alter table public.licenses       alter column id set default gen_random_uuid()::text;
alter table public.finance_entries alter column id set default gen_random_uuid()::text;

-- category_id/supplier_id em products nunca referenciaram tabela nenhuma na
-- prática (o app usa rótulos livres tipo "cat-ins", "sup-1", sem cadastro de
-- categorias/fornecedores) — droppa a FK "aspiracional" que nunca foi
-- respeitada e ajusta o tipo, sem tentar recriá-la.
alter table public.products drop constraint if exists products_category_id_fkey;
alter table public.products drop constraint if exists products_supplier_id_fkey;
alter table public.products alter column category_id type text using category_id::text;
alter table public.products alter column supplier_id type text using supplier_id::text;

-- ── Fase 3: troca o tipo das colunas que referenciam as chaves acima ───────
alter table public.product_batches   alter column product_id type text using product_id::text;
alter table public.stock_balances    alter column product_id type text using product_id::text;
alter table public.stock_movements   alter column product_id type text using product_id::text;
alter table public.equipment_maintenance alter column equipment_id type text using equipment_id::text;
alter table public.vehicle_fuel_logs alter column vehicle_id type text using vehicle_id::text;
alter table public.vehicle_maintenance alter column vehicle_id type text using vehicle_id::text;
alter table public.stock_locations   alter column vehicle_id type text using vehicle_id::text;
alter table public.appointments      alter column customer_id type text using customer_id::text;
alter table public.appointments      alter column service_type_id type text using service_type_id::text;
alter table public.appointments      alter column vehicle_id type text using vehicle_id::text;
alter table public.appointment_products alter column appointment_id type text using appointment_id::text;
alter table public.appointment_products alter column product_id type text using product_id::text;
alter table public.service_orders    alter column customer_id type text using customer_id::text;
alter table public.service_orders    alter column service_type_id type text using service_type_id::text;
alter table public.service_orders    alter column appointment_id type text using appointment_id::text;
alter table public.service_order_products alter column product_id type text using product_id::text;
alter table public.service_order_pests alter column pest_id type text using pest_id::text;
alter table public.service_order_equipment alter column equipment_id type text using equipment_id::text;
alter table public.checklist_runs    alter column appointment_id type text using appointment_id::text;
alter table public.finance_entries   alter column customer_id type text using customer_id::text;
alter table public.invoices          alter column customer_id type text using customer_id::text;
alter table public.crm_leads         alter column customer_id type text using customer_id::text;

-- ── Fase 4: recria as constraints de FK (agora text ↔ text) ────────────────
alter table public.product_batches   add constraint product_batches_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
alter table public.stock_balances    add constraint stock_balances_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
alter table public.stock_movements   add constraint stock_movements_product_id_fkey foreign key (product_id) references public.products(id) on delete restrict;
alter table public.equipment_maintenance add constraint equipment_maintenance_equipment_id_fkey foreign key (equipment_id) references public.equipment(id) on delete cascade;
alter table public.vehicle_fuel_logs add constraint vehicle_fuel_logs_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete cascade;
alter table public.vehicle_maintenance add constraint vehicle_maintenance_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete cascade;
alter table public.stock_locations   add constraint stock_locations_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete set null;
alter table public.appointments      add constraint appointments_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete restrict;
alter table public.appointments      add constraint appointments_service_type_id_fkey foreign key (service_type_id) references public.service_types(id) on delete set null;
alter table public.appointments      add constraint appointments_vehicle_id_fkey foreign key (vehicle_id) references public.vehicles(id) on delete set null;
alter table public.appointment_products add constraint appointment_products_appointment_id_fkey foreign key (appointment_id) references public.appointments(id) on delete cascade;
alter table public.appointment_products add constraint appointment_products_product_id_fkey foreign key (product_id) references public.products(id) on delete restrict;
alter table public.service_orders    add constraint service_orders_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete restrict;
alter table public.service_orders    add constraint service_orders_service_type_id_fkey foreign key (service_type_id) references public.service_types(id) on delete set null;
alter table public.service_orders    add constraint service_orders_appointment_id_fkey foreign key (appointment_id) references public.appointments(id) on delete set null;
alter table public.service_order_products add constraint service_order_products_product_id_fkey foreign key (product_id) references public.products(id) on delete restrict;
alter table public.service_order_pests add constraint service_order_pests_pest_id_fkey foreign key (pest_id) references public.pests(id) on delete cascade;
alter table public.service_order_equipment add constraint service_order_equipment_equipment_id_fkey foreign key (equipment_id) references public.equipment(id) on delete cascade;
alter table public.checklist_runs    add constraint checklist_runs_appointment_id_fkey foreign key (appointment_id) references public.appointments(id) on delete cascade;
alter table public.finance_entries   add constraint finance_entries_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null;
alter table public.invoices          add constraint invoices_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null;
alter table public.crm_leads         add constraint crm_leads_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null;
