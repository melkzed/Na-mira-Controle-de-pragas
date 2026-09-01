-- ============================================================================
-- Na Mira · Controle de Pragas — CORREÇÃO URGENTE do hook de Auth
--
-- Sintoma: ninguém entra no sistema. Nem a equipe, nem o cliente no Portal —
-- com login e senha certos. E, antes disso, "new row violates row-level
-- security policy" ao criar OS, e não conseguir excluir OS.
--
-- Causa: em db/migrate_portal_rls.sql eu acrescentei `u.customer_id` ao SELECT
-- do hook e mantive o teste `if app_user is not null`. Para um registro
-- composto, o PostgreSQL só considera `IS NOT NULL` verdadeiro quando TODOS os
-- campos são não-nulos. `customer_id` é nulo para toda a equipe — então a
-- condição virou falsa para admin, funcionário e técnico, e o hook parou de
-- injetar qualquer claim.
--
-- Sem claims, `auth_org_id()` é nulo e o RLS nega tudo. O login falha porque o
-- app, logo após autenticar, busca a própria linha em public.users para
-- descobrir org e papel — e essa busca também é barrada.
--
-- Antes da minha mudança o SELECT trazia só colunas sempre preenchidas, e por
-- isso funcionava. O certo é usar FOUND, que responde exatamente o que se quer
-- saber: veio linha ou não.
--
-- Rode este arquivo e, depois, SAIA E ENTRE DE NOVO (o token só ganha os
-- claims quando é emitido). Não precisa mexer no painel: o hook continua
-- registrado.
-- ============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  app_user record;
begin
  claims := event->'claims';

  select u.id as user_id, u.org_id, u.role::text as role, u.customer_id
    into app_user
    from public.users u
    where u.auth_user_id = (event->>'user_id')::uuid
      and u.is_active
    limit 1;

  -- FOUND, e não `app_user is not null`: num registro composto, `IS NOT NULL`
  -- exige TODOS os campos preenchidos, e customer_id é nulo para a equipe
  -- inteira. FOUND diz só o que importa aqui — a consulta trouxe linha.
  if found then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(app_user.org_id::text));
    -- "role" no topo do JWT é reservado pelo PostgREST (define a role do
    -- Postgres da conexão). O papel da aplicação vai em app_role.
    claims := jsonb_set(claims, '{app_role}', to_jsonb(app_user.role));
    claims := jsonb_set(claims, '{user_id}', to_jsonb(app_user.user_id::text));
    -- Só o cliente do Portal tem customer_id; para a equipe fica de fora.
    if app_user.customer_id is not null then
      claims := jsonb_set(claims, '{customer_id}', to_jsonb(app_user.customer_id));
    end if;
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

notify pgrst, 'reload schema';
