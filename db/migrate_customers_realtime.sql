-- ============================================================================
-- Na Mira · Controle de Pragas — completa a tabela customers e habilita
-- Realtime, para a Fase 2 da migração (dados compartilhados de verdade,
-- começando pelo módulo Clientes).
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- Campos do domínio (src/domain/types.ts → Customer) que ainda não existiam
-- na tabela — cadastro completo (estrutura do local, contratos, etc.).
alter table public.customers
  add column if not exists permanent_notes         text,
  add column if not exists monitoring_contracted    boolean not null default false,
  add column if not exists registration_status      text,
  add column if not exists economic_activity        text,
  add column if not exists registration_tier        text,
  add column if not exists local_structure          text[] default '{}',
  add column if not exists reservoirs                jsonb,
  add column if not exists contact_schedule          jsonb,
  add column if not exists contracts                 jsonb,
  add column if not exists complementary_services    text[] default '{}';

-- Realtime: sem isso, mudanças feitas por um usuário não chegam ao vivo pros
-- outros — cada um só veria a mudança ao recarregar a página (a próxima
-- consulta já traria o dado certo graças ao RLS, mas não em tempo real).
-- "alter publication ... add table" dá erro se rodar de novo; o bloco abaixo
-- só adiciona se ainda não estiver na publicação (idempotente).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customers'
  ) then
    alter publication supabase_realtime add table public.customers;
  end if;
end $$;
