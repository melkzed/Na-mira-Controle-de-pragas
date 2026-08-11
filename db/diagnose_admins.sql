-- ============================================================================
-- Na Mira · Controle de Pragas — diagnóstico do vínculo dos admins
-- Roda no SQL Editor do Supabase. Mostra se auth.users, public.users e a
-- organização estão corretamente ligados para os dois administradores.
-- ============================================================================
select
  au.email,
  au.email_confirmed_at,
  au.id as auth_user_id,
  u.id as public_users_id,
  u.org_id,
  u.role,
  u.is_active,
  o.name as org_name
from auth.users au
left join public.users u on u.auth_user_id = au.id
left join public.organizations o on o.id = u.org_id
where au.email in ('melkzedektech@gmail.com', 'namiracomercial@gmail.com');
