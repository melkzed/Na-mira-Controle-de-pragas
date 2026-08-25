-- ============================================================================
-- Na Mira · Controle de Pragas — por que este usuário não consegue cadastrar
-- técnicos?
--
-- Rode no SQL Editor do Supabase. As consultas são só de leitura; a seção
-- final (comentada) corrige os dois problemas mais comuns.
--
-- Só quem tem role 'admin' ou 'supervisor' em public.users pode convidar
-- (ver supabase/functions/convidar-tecnico/index.ts). O app mostra o motivo
-- exato no toast vermelho — este script confirma no banco.
-- ============================================================================

-- 1) Panorama: todo mundo que tem login, com o cadastro correspondente.
--    Olhe as colunas "problema" e "role".
select
  au.email                                as email_do_login,
  au.email_confirmed_at is not null       as email_confirmado,
  u.name                                  as nome_no_sistema,
  u.role,
  u.is_active                             as ativo,
  o.name                                  as organizacao,
  case
    when u.id is null and exists (select 1 from public.users x where lower(x.email) = lower(au.email))
      then 'cadastro existe mas NÃO está vinculado ao login (auth_user_id nulo) — rode a correção 1'
    when u.id is null
      then 'login sem cadastro em public.users — cadastre a pessoa em Técnicos/Equipe'
    when not u.is_active
      then 'cadastro inativo — reative'
    when u.role not in ('admin', 'supervisor')
      then 'papel "' || u.role || '" não pode convidar — rode a correção 2'
    else 'ok, pode cadastrar técnicos'
  end                                     as problema
from auth.users au
left join public.users u on u.auth_user_id = au.id
left join public.organizations o on o.id = u.org_id
order by au.email;

-- 2) Cadastros duplicados (mesma pessoa em duas linhas) — a função escolhe o
--    papel mais permissivo, mas o ideal é apagar a linha errada.
select lower(email) as email, count(*) as linhas, array_agg(role) as papeis, array_agg(id) as ids
from public.users
group by lower(email)
having count(*) > 1;

-- 3) Cadastros sem vínculo com nenhum login (não conseguem entrar no sistema).
select id, name, email, role, is_active
from public.users
where auth_user_id is null;

-- ============================================================================
-- CORREÇÕES — tire o comentário (--) da que precisar e rode.
-- ============================================================================

-- Correção 1 — vincular cadastros ao login pelo e-mail (idempotente, vale
-- para todo mundo; substitui o antigo db/link_admins.sql, que tinha os
-- e-mails fixos no código).
-- update public.users u
--    set auth_user_id = au.id
--   from auth.users au
--  where u.auth_user_id is null
--    and lower(u.email) = lower(au.email);

-- Correção 2 — dar acesso de administrador a alguém (troque o e-mail).
-- update public.users
--    set role = 'admin', is_active = true
--  where lower(email) = lower('email.da.pessoa@exemplo.com');

-- Depois de qualquer correção, a pessoa precisa SAIR e ENTRAR de novo:
-- org_id e papel vão dentro do token de login (db/auth_hook.sql).
