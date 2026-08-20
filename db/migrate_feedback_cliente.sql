-- ============================================================================
-- Na Mira · Controle de Pragas — ajustes pedidos pela cliente:
--   · Produtos: grupo químico e preferência de exibição no laudo.
--   · Clientes: quantidade de cômodos do imóvel.
--   · Contas a pagar recorrentes: data completa do primeiro vencimento.
-- Rodar no SQL Editor do Supabase, depois das migrations da Fase 2.
-- Idempotente.
-- ============================================================================

-- Produtos: report_label define se o Laudo/Certificado mostram o nome
-- comercial ou o princípio ativo (padrão da empresa: princípio ativo).
-- chemical_group/antidote já vieram em migrate_entitystores_realtime.sql;
-- ficam aqui só por segurança, para projetos que pularam aquele passo.
alter table public.products
  add column if not exists chemical_group text,
  add column if not exists antidote text,
  add column if not exists report_label text,
  -- Vindos da planilha de produtos da empresa (importação em massa).
  add column if not exists treatment text,
  add column if not exists diluent text;

-- Clientes: quantidade de cômodos (cadastro completo de pessoa física).
alter table public.customers
  add column if not exists room_count int;

-- Contas recorrentes: antes só existia o dia do vencimento; agora guarda a
-- data completa do primeiro vencimento (dia/mês/ano) como âncora.
alter table public.recurring_payables
  add column if not exists start_date date;

notify pgrst, 'reload schema';
