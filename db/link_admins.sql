-- ============================================================================
-- Na Mira · Controle de Pragas — vincula os administradores reais
-- Rodar no SQL Editor do Supabase DEPOIS de criar os usuários em
-- Authentication → Users (melkzedektech@gmail.com e namiracomercial@gmail.com).
-- Idempotente: pode rodar de novo sem duplicar organização/usuários.
-- ============================================================================

-- Garante uma organização (reaproveita a primeira existente, se houver).
insert into public.organizations (id, name, legal_name, email)
select gen_random_uuid(), 'Na Mira Controle de Pragas', 'Na Mira Serviços de Dedetização Ltda', 'contato@namira.com'
where not exists (select 1 from public.organizations);

-- Vincula os dois administradores: cria (ou atualiza) a linha em public.users
-- com o auth_user_id correspondente ao usuário já criado em auth.users.
insert into public.users (org_id, auth_user_id, name, email, role, is_active)
select
  (select id from public.organizations order by created_at limit 1),
  au.id,
  case au.email
    when 'melkzedektech@gmail.com' then 'Melk'
    when 'namiracomercial@gmail.com' then 'Vanessa'
  end,
  au.email,
  'admin',
  true
from auth.users au
where au.email in ('melkzedektech@gmail.com', 'namiracomercial@gmail.com')
on conflict (org_id, email) do update
  set auth_user_id = excluded.auth_user_id,
      role = 'admin',
      is_active = true;

-- Confere o resultado.
select id, org_id, auth_user_id, name, email, role, is_active from public.users;
