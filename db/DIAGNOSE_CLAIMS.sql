-- ============================================================================
-- Na Mira · Controle de Pragas — por que o RLS está negando?
--
-- Sintomas que esta consulta explica:
--   · "new row violates row-level security policy" ao criar OS
--   · o sistema abre vazio depois de entrar
--   · não consegue excluir ordem de serviço
--
-- Os três têm a mesma causa possível: o JWT não carrega o claim `org_id`, e
-- todas as políticas comparam `org_id = auth_org_id()`.
--
-- O hook monta os claims a partir de public.users, casando `auth_user_id` com
-- o usuário do Supabase Auth. Se esse vínculo não existir, o hook não acha
-- linha nenhuma, não injeta claim nenhum, e o RLS nega tudo — mesmo com o hook
-- registrado no painel e o login funcionando.
--
-- Cole tudo e execute. É uma consulta só, de leitura.
-- ============================================================================
select
  coalesce(u.name, '— sem cadastro em public.users —')  as usuario,
  au.email                                             as email_do_login,
  u.role::text                                         as papel,
  case
    when u.id is null then
      '❌ existe no Auth mas NÃO tem linha em public.users — o hook não tem o que ler'
    when u.auth_user_id is null then
      '❌ tem cadastro, mas auth_user_id está VAZIO — o hook não casa os dois'
    when u.auth_user_id <> au.id then
      '❌ auth_user_id aponta para outro usuário do Auth'
    when not u.is_active then
      '❌ cadastro inativo — o hook ignora (filtra por is_active)'
    else
      '✅ vínculo correto: este login recebe org_id, app_role e user_id no JWT'
  end                                                  as situacao,
  u.org_id                                             as org_do_cadastro,
  au.last_sign_in_at                                   as ultimo_login
from auth.users au
left join public.users u on u.auth_user_id = au.id
                         or lower(u.email) = lower(au.email)
order by (u.auth_user_id is null or u.id is null) desc, au.email;

-- ----------------------------------------------------------------------------
-- CORREÇÃO, quando a situação for "auth_user_id está VAZIO".
-- Confira o resultado acima ANTES de rodar: isto casa por e-mail, então só
-- funciona se o e-mail do cadastro for o mesmo do login.
--
--   update public.users u
--      set auth_user_id = au.id
--     from auth.users au
--    where lower(u.email) = lower(au.email)
--      and u.auth_user_id is null;
--
-- Depois de corrigir o vínculo, SAIA E ENTRE DE NOVO: o hook só monta os
-- claims quando um token novo é emitido, e o token atual continua sem eles.
-- ----------------------------------------------------------------------------
