-- ============================================================================
-- Na Mira · Controle de Pragas — "os dados sumiram do sistema"
--
-- Este arquivo responde à ÚNICA pergunta que importa primeiro:
--
--   os registros foram APAGADOS, ou estão no banco e o app não consegue LER?
--
-- O SQL Editor do Supabase roda com privilégio que IGNORA o RLS. Então o que
-- aparecer aqui é o que existe de verdade no banco, independente do que a tela
-- mostra. Se os números vierem grandes e a tela estiver vazia, é leitura
-- bloqueada — nada foi perdido.
--
-- Cole tudo e execute. É só de leitura.
-- ============================================================================

select
  tabela,
  registros,
  case
    when registros = 0 then '⚠ tabela vazia — os registros não estão no banco'
    else '✅ os registros estão no banco (se a tela está vazia, é leitura bloqueada)'
  end as situacao
from (
  select 'customers'      as tabela, count(*) as registros from public.customers
  union all select 'products',       count(*) from public.products
  union all select 'vehicles',       count(*) from public.vehicles
  union all select 'users',          count(*) from public.users
  union all select 'service_types',  count(*) from public.service_types
  union all select 'pests',          count(*) from public.pests
  union all select 'equipment',      count(*) from public.equipment
  union all select 'appointments',   count(*) from public.appointments
  union all select 'service_orders', count(*) from public.service_orders
) t
order by registros, tabela;

-- ----------------------------------------------------------------------------
-- SE OS NÚMEROS ESTIVEREM GRANDES (dados existem, tela vazia), rode a consulta
-- abaixo SEPARADAMENTE. Ela mostra quantos registros existem POR ORGANIZAÇÃO.
--
-- A causa mais comum: o usuário logado está numa organização e os dados em
-- outra. O RLS compara `org_id = auth_org_id()`, então tudo que estiver em
-- outra org fica invisível — sem erro nenhum na tela, só listas vazias.
--
--   select o.id as org, o.name as organizacao,
--          (select count(*) from public.users     u where u.org_id = o.id) as usuarios,
--          (select count(*) from public.customers c where c.org_id = o.id) as clientes,
--          (select count(*) from public.products  p where p.org_id = o.id) as produtos,
--          (select count(*) from public.vehicles  v where v.org_id = o.id) as veiculos
--     from public.organizations o
--    order by o.name;
--
-- Havendo mais de uma linha com dados, compare com o org_id do usuário que
-- está logado (a consulta de DIAGNOSE_CLAIMS mostra o org de cada login).
-- ----------------------------------------------------------------------------
