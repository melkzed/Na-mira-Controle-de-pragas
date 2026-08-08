-- ============================================================================
-- Na Mira · Controle de Pragas
-- Esquema de banco de dados (PostgreSQL / Supabase) — normalizado, multi-tenant
-- ----------------------------------------------------------------------------
-- Convenções:
--   • Multi-tenant por `org_id` (Row Level Security recomendado no Supabase).
--   • Chaves primárias UUID (gen_random_uuid).
--   • timestamptz para datas/horas; `created_at` / `updated_at` em toda tabela.
--   • ENUMs para estados de domínio; catálogos em tabelas quando extensíveis.
--   • Soft-delete via `deleted_at` onde faz sentido (histórico/auditoria).
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";        -- busca textual

-- ---------------------------------------------------------------------------
-- ENUMs de domínio
-- ---------------------------------------------------------------------------
create type user_role as enum (
  'admin', 'supervisor', 'financeiro', 'atendimento', 'estoque', 'tecnico'
);

create type customer_type as enum ('pf', 'pj');

create type appointment_status as enum (
  'programada', 'agendado', 'confirmado', 'em_deslocamento', 'em_atendimento',
  'finalizado', 'cancelado', 'reagendado'
);

create type appointment_priority as enum ('baixa', 'normal', 'alta', 'urgente');

create type service_order_status as enum ('rascunho', 'em_andamento', 'concluida', 'cancelada');

create type stock_movement_type as enum (
  'entrada', 'saida', 'transferencia', 'consumo', 'perda', 'ajuste', 'devolucao'
);

create type stock_location_kind as enum ('central', 'tecnico', 'veiculo');

create type finance_entry_type as enum ('receita', 'despesa');

create type finance_entry_status as enum ('pendente', 'pago', 'atrasado', 'cancelado');

create type crm_stage as enum (
  'novo_contato', 'orcamento', 'negociacao', 'follow_up', 'ganho', 'perdido'
);

create type equipment_status as enum ('disponivel', 'em_uso', 'manutencao', 'inativo');

create type notification_channel as enum ('sistema', 'email', 'whatsapp', 'push');

-- ---------------------------------------------------------------------------
-- Núcleo: organizações (tenants), usuários, permissões
-- ---------------------------------------------------------------------------
create table organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  legal_name   text,
  cnpj         text,
  email        text,
  phone        text,
  address      jsonb,               -- { logradouro, numero, bairro, cidade, uf, cep }
  settings     jsonb default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table users (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  auth_user_id  uuid,                -- vínculo com auth.users (Supabase)
  name          text not null,
  email         text not null,
  phone         text,
  avatar_url    text,
  role          user_role not null default 'atendimento',
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, email)
);

-- Permissões finas (além do role) — override por usuário.
create table permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,             -- ex.: 'financeiro.ver', 'os.editar'
  description text not null,
  module      text not null
);

create table role_permissions (
  role          user_role not null,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role, permission_id)
);

create table user_permissions (
  user_id       uuid not null references users(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  granted       boolean not null default true,   -- permite negar explicitamente
  primary key (user_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- Equipes de campo
-- ---------------------------------------------------------------------------
create table teams (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  leader_id   uuid references users(id) on delete set null,
  color       text default '#10b981',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (team_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Clientes (CRM/Cadastro)
-- ---------------------------------------------------------------------------
create table customers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  type           customer_type not null default 'pf',
  name           text not null,
  company_name   text,
  document       text,               -- CPF ou CNPJ
  email          text,
  phone          text,
  whatsapp       text,               -- legado; ver `contacts` para múltiplos contatos
  -- Telefone(s) de contato — quem de fato atende/agenda pelo cliente, pode
  -- divergir do `phone` principal da empresa. Formato:
  -- [{ id, name, phone, role?, isPrincipal? }]. Um item marcado como principal.
  contacts       jsonb,
  -- Endereço
  cep            text,
  street         text,
  number         text,
  complement     text,
  district       text,
  city           text,
  state          char(2),
  latitude       numeric(10,7),
  longitude      numeric(10,7),
  -- Imóvel
  property_type  text,               -- residencial, comercial, industrial, rural...
  area_m2        numeric(10,2),
  notes          text,
  tags           text[] default '{}',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index on customers using gin (name gin_trgm_ops);
create index on customers (org_id, is_active);

-- ---------------------------------------------------------------------------
-- Fornecedores, categorias, produtos
-- ---------------------------------------------------------------------------
create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  document   text,
  email      text,
  phone      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  parent_id  uuid references product_categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create table products (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  name               text not null,
  category_id        uuid references product_categories(id) on delete set null,
  manufacturer       text,
  supplier_id        uuid references suppliers(id) on delete set null,
  registration_code  text,           -- Registro no MS/Anvisa/IBAMA
  active_ingredient  text,           -- princípio ativo
  application_type   text,           -- pulverização, isca, gel, atomização...
  dosage             text,
  unit               text not null default 'un', -- un, L, ml, kg, g
  min_quantity       numeric(12,3) not null default 0,
  price              numeric(12,2) not null default 0,
  storage_location   text,
  sds_url            text,           -- FISPQ / SDS
  application_mode    text,
  restrictions       text,
  required_equipment  text,
  is_regulated       boolean not null default false,
  notes              text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on products (org_id, is_active);

-- Lotes (validade / rastreabilidade)
create table product_batches (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  batch_code     text,
  expires_at     date,
  supplier_id    uuid references suppliers(id) on delete set null,
  purchase_price numeric(12,2),
  received_at    date default current_date,
  created_at     timestamptz not null default now()
);
create index on product_batches (product_id, expires_at);

-- ---------------------------------------------------------------------------
-- Estoque em dois níveis: central + individual (técnico/veículo)
-- Locais de estoque abstraem central, técnicos e veículos.
-- ---------------------------------------------------------------------------
create table stock_locations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        stock_location_kind not null,
  name        text not null,
  owner_id    uuid references users(id) on delete set null,   -- técnico dono
  vehicle_id  uuid,                                            -- FK adicionada abaixo
  created_at  timestamptz not null default now()
);

-- Saldo por (local, produto, lote). Fonte de verdade derivada de movimentos.
create table stock_balances (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  location_id  uuid not null references stock_locations(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  batch_id     uuid references product_batches(id) on delete set null,
  quantity     numeric(14,3) not null default 0,
  updated_at   timestamptz not null default now(),
  unique (location_id, product_id, batch_id)
);
create index on stock_balances (org_id, product_id);

-- Livro-razão de movimentações (auditável).
create table stock_movements (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  type             stock_movement_type not null,
  product_id       uuid not null references products(id) on delete restrict,
  batch_id         uuid references product_batches(id) on delete set null,
  quantity         numeric(14,3) not null,
  from_location_id uuid references stock_locations(id) on delete set null,
  to_location_id   uuid references stock_locations(id) on delete set null,
  service_order_id uuid,                     -- FK adicionada abaixo
  performed_by     uuid references users(id) on delete set null,
  reason           text,
  unit_cost        numeric(12,2),
  created_at       timestamptz not null default now()
);
create index on stock_movements (org_id, product_id, created_at);
create index on stock_movements (service_order_id);

-- ---------------------------------------------------------------------------
-- Equipamentos e veículos
-- ---------------------------------------------------------------------------
create table equipment (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  code           text,               -- código interno
  asset_number   text,               -- nº patrimônio
  kind           text,               -- pulverizador, bomba, EPI, ferramenta
  status         equipment_status not null default 'disponivel',
  assigned_to    uuid references users(id) on delete set null,
  last_maintenance_at date,
  next_maintenance_at date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table equipment_maintenance (
  id            uuid primary key default gen_random_uuid(),
  equipment_id  uuid not null references equipment(id) on delete cascade,
  performed_at  date not null default current_date,
  description   text,
  cost          numeric(12,2),
  created_at    timestamptz not null default now()
);

create table vehicles (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  plate          text not null,
  model          text,
  driver_id      uuid references users(id) on delete set null,
  odometer_km    numeric(12,1) default 0,
  insurance_info text,
  documents      jsonb default '[]'::jsonb,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table vehicle_fuel_logs (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references vehicles(id) on delete cascade,
  date        date not null default current_date,
  liters      numeric(10,2),
  cost        numeric(12,2),
  odometer_km numeric(12,1),
  created_at  timestamptz not null default now()
);

create table vehicle_maintenance (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references vehicles(id) on delete cascade,
  date        date not null default current_date,
  description text,
  cost        numeric(12,2),
  odometer_km numeric(12,1),
  created_at  timestamptz not null default now()
);

-- Fecha o ciclo de FKs de stock_locations/vehicle
alter table stock_locations
  add constraint stock_locations_vehicle_fk
  foreign key (vehicle_id) references vehicles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Catálogo de serviços e pragas
-- ---------------------------------------------------------------------------
create table service_types (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,     -- Dedetização, Desratização, Sanitização...
  default_duration_min int default 60,
  default_price  numeric(12,2) default 0,
  -- Produtos padrão do serviço, pré-carregados na OS: [{ productId, qty }].
  default_products jsonb,
  -- Validade padrão do serviço (dias) — sugere a validade da OS.
  default_validity_days int,
  color          text default '#6366f1',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table pests (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references organizations(id) on delete cascade,
  name    text not null,             -- baratas, ratos, cupins, formigas...
  category    text,                  -- rasteira, voadora, roedor, cupim...
  description text,
  default_warranty_days int,          -- garantia padrão ao selecionar a praga
  default_validity_days int,          -- validade da proteção — sugere a validade da OS
  notes       text,
  is_active   boolean not null default true
);

-- Áreas tratadas (catálogo operacional) — cadastro predefinido usado na OS
-- para marcar quantidade por área (ex.: 2 Cozinha, 1 Depósito).
create table treated_areas (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  notes      text,
  is_active  boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Agendamentos (módulo principal)
-- ---------------------------------------------------------------------------
create table appointments (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  customer_id       uuid not null references customers(id) on delete restrict,
  service_type_id   uuid references service_types(id) on delete set null,
  technician_id     uuid references users(id) on delete set null,
  team_id           uuid references teams(id) on delete set null,
  vehicle_id        uuid references vehicles(id) on delete set null,
  status            appointment_status not null default 'agendado',
  priority          appointment_priority not null default 'normal',
  scheduled_start   timestamptz not null,
  scheduled_end     timestamptz not null,
  estimated_minutes int,
  -- Endereço do atendimento (pode diferir do cadastro do cliente)
  address           text,
  latitude          numeric(10,7),
  longitude         numeric(10,7),
  notes             text,
  -- Rastreamento de execução em campo
  checked_in_at     timestamptz,
  started_at        timestamptz,
  finished_at       timestamptz,
  route_id          uuid,             -- FK adicionada abaixo
  route_order       int,
  -- Agrupa as ocorrências geradas por um mesmo plano de recorrência (cada uma
  -- é independente); recurrence_rule rotula a periodicidade dessa ocorrência
  -- específica (ex.: "Mensal", "Semanal") para a janela de confirmação.
  recurrence_id     uuid,
  recurrence_rule   text,
  -- Data/hora em que a visita foi confirmada (fluxo: programada → agendado
  -- "aguardando confirmação" → confirmado → liberada ao técnico).
  confirmed_at      timestamptz,
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on appointments (org_id, scheduled_start);
create index on appointments (technician_id, scheduled_start);
create index on appointments (status);
create index on appointments (recurrence_id);

-- Produtos previstos para o atendimento
create table appointment_products (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  product_id     uuid not null references products(id) on delete restrict,
  planned_qty    numeric(14,3) not null default 0
);

-- Anexos (fotos/documentos) genéricos por entidade
create table attachments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  entity_type  text not null,       -- 'appointment', 'service_order', 'customer'...
  entity_id    uuid not null,
  kind         text,                -- 'foto_antes', 'foto_depois', 'documento', 'assinatura'
  url          text not null,
  filename     text,
  content_type text,
  size_bytes   bigint,
  uploaded_by  uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on attachments (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Roteirização
-- ---------------------------------------------------------------------------
create table routes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  technician_id  uuid references users(id) on delete set null,
  date           date not null,
  start_lat      numeric(10,7),
  start_lng      numeric(10,7),
  total_distance_km numeric(10,2),
  total_duration_min int,
  optimized      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table appointments
  add constraint appointments_route_fk
  foreign key (route_id) references routes(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Ordens de Serviço
-- ---------------------------------------------------------------------------
create table service_orders (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  number           bigint,                -- numeração sequencial por org
  appointment_id   uuid references appointments(id) on delete set null,
  customer_id      uuid not null references customers(id) on delete restrict,
  technician_id    uuid references users(id) on delete set null,
  service_type_id  uuid references service_types(id) on delete set null,
  status           service_order_status not null default 'rascunho',
  address          text,
  area_treated     text,
  procedures       text,
  notes            text,
  started_at       timestamptz,
  finished_at      timestamptz,
  total_minutes    int,
  customer_signature_url  text,
  technician_signature_url text,
  pdf_url          text,
  -- Valor final acordado do serviço — sempre com origem explícita (sugerido
  -- pelo preço padrão do serviço, mas editável) e só confirmado após o clique
  -- em "Confirmar valor"; nunca presumido a partir da sugestão automática.
  service_value           numeric(12,2),
  service_value_confirmed boolean not null default false,
  -- OS associada (ex.: retorno/garantia de um atendimento anterior).
  associated_order_id     uuid references service_orders(id) on delete set null,
  -- Plano de recorrência multi-fase: { enabled, frequency?, phases?: [{ id,
  -- frequency, occurrences }], recurrenceGroupId? } — cada fase soma sua
  -- periodicidade à data anterior; plano com fim definido, não repetição
  -- infinita. Ver Appointment.recurrence_id para as visitas geradas.
  recurrence              jsonb,
  next_visit_date         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (org_id, number)
);
create index on service_orders (org_id, created_at);
create index on service_orders (customer_id);
create index on service_orders (associated_order_id);

create table service_order_products (
  id               uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references service_orders(id) on delete cascade,
  product_id       uuid not null references products(id) on delete restrict,
  batch_id         uuid references product_batches(id) on delete set null,
  used_qty         numeric(14,3) not null default 0,
  unit             text,
  unit_cost        numeric(12,2)
);

create table service_order_pests (
  service_order_id uuid not null references service_orders(id) on delete cascade,
  pest_id          uuid not null references pests(id) on delete cascade,
  primary key (service_order_id, pest_id)
);

create table service_order_equipment (
  service_order_id uuid not null references service_orders(id) on delete cascade,
  equipment_id     uuid not null references equipment(id) on delete cascade,
  primary key (service_order_id, equipment_id)
);

-- Fecha FK de stock_movements -> service_orders
alter table stock_movements
  add constraint stock_movements_so_fk
  foreign key (service_order_id) references service_orders(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Checklists operacionais (templates + execução)
-- ---------------------------------------------------------------------------
create table checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  phase      text not null,          -- 'antes', 'durante', 'apos'
  items      jsonb not null default '[]'::jsonb,  -- [{label, required}]
  created_at timestamptz not null default now()
);

create table checklist_runs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  appointment_id   uuid references appointments(id) on delete cascade,
  service_order_id uuid references service_orders(id) on delete cascade,
  template_id      uuid references checklist_templates(id) on delete set null,
  phase            text not null,
  results          jsonb not null default '[]'::jsonb, -- [{label, checked, note}]
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------------
create table finance_accounts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,          -- caixa, banco X...
  kind       text,                   -- caixa, conta_corrente, cartao
  balance    numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table finance_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  type       finance_entry_type not null
);

create table finance_entries (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  type             finance_entry_type not null,
  status           finance_entry_status not null default 'pendente',
  category_id      uuid references finance_categories(id) on delete set null,
  account_id       uuid references finance_accounts(id) on delete set null,
  customer_id      uuid references customers(id) on delete set null,
  service_order_id uuid references service_orders(id) on delete set null,
  description      text not null,
  amount           numeric(14,2) not null,
  due_date         date,
  paid_at          date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on finance_entries (org_id, due_date);
create index on finance_entries (org_id, type, status);

create table commissions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  service_order_id uuid references service_orders(id) on delete set null,
  amount           numeric(14,2) not null,
  rate             numeric(6,3),
  status           finance_entry_status not null default 'pendente',
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fiscal / conformidade regulatória
-- ---------------------------------------------------------------------------
create table fiscal_settings (
  org_id            uuid primary key references organizations(id) on delete cascade,
  tax_regime        text,            -- Simples, Presumido, Real
  municipal_reg     text,            -- inscrição municipal
  state_reg         text,
  service_code      text,            -- código de serviço (NFS-e)
  iss_rate          numeric(6,3),
  extra             jsonb default '{}'::jsonb,
  updated_at        timestamptz not null default now()
);

create table invoices (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  service_order_id uuid references service_orders(id) on delete set null,
  customer_id      uuid references customers(id) on delete set null,
  number           text,
  series           text,
  amount           numeric(14,2) not null,
  tax_amount       numeric(14,2) default 0,
  status           text not null default 'rascunho', -- rascunho, emitida, cancelada
  issued_at        timestamptz,
  xml_url          text,
  pdf_url          text,
  created_at       timestamptz not null default now()
);

create table licenses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,       -- Alvará sanitário, licença ambiental...
  issuer        text,                -- órgão emissor
  number        text,
  responsible_id uuid references users(id) on delete set null, -- resp. técnico
  issued_at     date,
  expires_at    date,
  document_url  text,
  status        text default 'ativa', -- ativa, vencida, suspensa
  created_at    timestamptz not null default now()
);
create index on licenses (org_id, expires_at);

create table inspections (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  agency      text,
  date        date,
  result      text,
  notes       text,
  document_url text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CRM (funil de vendas / relacionamento)
-- ---------------------------------------------------------------------------
create table crm_leads (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  company      text,
  phone        text,
  email        text,
  source       text,               -- indicação, site, whatsapp, anúncio
  stage        crm_stage not null default 'novo_contato',
  estimated_value numeric(14,2),
  owner_id     uuid references users(id) on delete set null,
  customer_id  uuid references customers(id) on delete set null, -- ao converter
  next_action_at timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on crm_leads (org_id, stage);

create table crm_activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references crm_leads(id) on delete cascade,
  user_id    uuid references users(id) on delete set null,
  kind       text,                 -- ligação, whatsapp, email, reunião, nota
  content    text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notificações e auditoria
-- ---------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid references users(id) on delete cascade,   -- destinatário
  channel     notification_channel not null default 'sistema',
  title       text not null,
  body        text,
  entity_type text,
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on notifications (user_id, read_at);

create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid references users(id) on delete set null,
  action      text not null,        -- create, update, delete, login...
  entity_type text,
  entity_id   uuid,
  changes     jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index on audit_logs (org_id, created_at);

-- ---------------------------------------------------------------------------
-- Gatilho utilitário: updated_at automático
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where column_name = 'updated_at' and table_schema = 'public'
  loop
    execute format(
      'create trigger trg_%I_updated_at before update on %I
         for each row execute function set_updated_at();', t, t);
  end loop;
end $$;

-- ============================================================================
-- Fim do esquema.
-- Próximo passo (Supabase): habilitar RLS por org_id em todas as tabelas
-- multi-tenant e criar políticas por role. Ver docs/DATABASE.md.
-- ============================================================================
