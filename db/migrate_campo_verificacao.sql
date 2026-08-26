-- ============================================================================
-- Na Mira · Controle de Pragas — ações do técnico em campo.
--   · Assinatura do cliente capturada na visita (antes só existia na OS).
--   · Verificação do local (checklist MIP) registrada na visita.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================================

alter table public.appointments
  add column if not exists customer_signature text,
  add column if not exists verification jsonb;

notify pgrst, 'reload schema';

-- ============================================================================
-- Portal do Cliente: acesso do cliente e pedidos feitos por ele.
-- ============================================================================

-- Acesso do cliente ao Portal (login por CPF/CNPJ + senha definida pelo
-- administrador). Guardamos apenas o hash — nunca a senha.
alter table public.customers
  add column if not exists portal_access boolean not null default false,
  add column if not exists portal_password_hash text,
  add column if not exists portal_password_set_at timestamptz;

-- Pedido de reagendamento feito pelo cliente no Portal.
alter table public.appointments
  add column if not exists reschedule_request jsonb;

-- Áreas específicas de uma OS (escritas na hora, fora do catálogo global).
alter table public.service_orders
  add column if not exists custom_areas jsonb;

-- Posição das armadilhas, para o mapa no app do técnico.
alter table public.traps
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- Usuário interno: ocultar valores em dinheiro; cliente vinculado (papel cliente).
alter table public.users
  add column if not exists hide_financial_values boolean not null default false,
  add column if not exists customer_id text;

notify pgrst, 'reload schema';
