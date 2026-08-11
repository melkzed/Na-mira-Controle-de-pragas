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

-- Confere diretamente pelos IDs que apareceram no console do navegador
-- (essa consulta roda como postgres/superuser aqui no editor, ignora RLS —
-- se aparecer linha aqui mas o app não achar, o problema é o hook/JWT, não o vínculo).
select id, org_id, auth_user_id, email, role, is_active
from public.users
where auth_user_id in (
  'b9fdd7c3-be38-4cb2-a5aa-9d3357a4d039',
  'b2314f79-5843-4da7-a39e-573b5087f46e'
);

