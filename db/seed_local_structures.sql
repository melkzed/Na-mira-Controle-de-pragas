-- ============================================================================
-- Na Mira · Controle de Pragas — conteúdo inicial da Estrutura do local.
--
-- A "Estrutura do local" (Configurações → Cadastro) é o cadastro dos ambientes
-- que existem no cliente. Ela alimenta dois lugares: a ficha do cliente
-- (Cadastro Completo → Estrutura do local, com quantidade por ambiente) e as
-- opções de "Áreas tratadas" da Ordem de Serviço, onde os ambientes do cliente
-- escolhido aparecem em destaque. É a mesma tabela `treated_areas` de sempre —
-- só o rótulo da interface mudou, porque os ids já estão gravados em OS
-- antigas (service_orders.area_ids / area_qty) e renomear a tabela quebraria
-- essas OS sem trocar nada que o usuário veja.
--
-- Antes desta mudança, sete ambientes ficavam fixos no código do formulário do
-- cliente (Cozinha, Produção, Escritório, Câmara Fria, Estoque, Refeitório,
-- Área Externa) e não valiam para o cliente seguinte. Quatro deles já existiam
-- no cadastro; este script cria os três que faltavam.
--
-- NÃO é uma migration: nenhuma tabela, coluna, política de RLS ou publicação
-- Realtime muda aqui. É só conteúdo inicial, por isso o nome `seed_*` e por
-- isso ele fica fora da lista ordenada de migrations em docs/DATABASE.md.
--
-- Rodar uma vez no SQL Editor do Supabase. Idempotente: pula o que a
-- organização já tem (comparando sem diferenciar maiúscula/minúscula) e rodar
-- de novo não duplica.
--
-- No modo standalone nada disto é preciso — lá o seed do frontend
-- (src/infrastructure/seed/data.ts → treatedAreas) já traz os três.
-- ============================================================================

insert into public.treated_areas (id, org_id, name, is_active)
select gen_random_uuid()::text, o.id, novo.name, true
from public.organizations o
cross join (values ('Produção'), ('Câmara Fria'), ('Refeitório')) as novo(name)
where not exists (
  select 1
  from public.treated_areas t
  where t.org_id = o.id
    and lower(t.name) = lower(novo.name)
);

-- Confere o resultado por organização.
select o.name as organizacao, count(t.id) as ambientes
from public.organizations o
left join public.treated_areas t on t.org_id = o.id
group by o.name
order by o.name;
