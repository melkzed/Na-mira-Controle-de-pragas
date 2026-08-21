-- ============================================================================
-- Na Mira · Controle de Pragas — locais de estoque viram cadastro de verdade.
--
-- Antes a lista de locais vinha só do seed do frontend: um técnico cadastrado
-- pela tela nunca ganhava um local, ficava com saldo zero para sempre e não
-- tinha onde guardar produto próprio. Agora o app cria o local junto com o
-- técnico (ver src/store/stockLocations.ts → ensureTechnicianStockLocation),
-- então a tabela precisa de Realtime como as demais stores dual-mode.
--
-- Rodar no SQL Editor do Supabase, DEPOIS de db/migrate_stock_realtime.sql.
-- Idempotente.
-- ============================================================================

-- Realtime: sem isso, um local criado numa sessão só aparece nas outras ao
-- recarregar a página.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stock_locations'
  ) then
    alter publication supabase_realtime add table public.stock_locations;
  end if;
end $$;

-- Cria o local de estoque que falta para cada técnico já cadastrado. O app
-- também faz isso sozinho (ao cadastrar o técnico e ao abrir o app de campo),
-- mas aqui resolve de uma vez para quem já existe.
insert into public.stock_locations (id, org_id, kind, name, owner_id)
select
  'loc-t-' || left(u.id::text, 8),
  u.org_id,
  'tecnico'::stock_location_kind,
  'Estoque · ' || u.name,
  u.id
from public.users u
where u.role = 'tecnico'
  and not exists (
    select 1 from public.stock_locations l
    where l.kind = 'tecnico' and l.owner_id = u.id
  );

notify pgrst, 'reload schema';
