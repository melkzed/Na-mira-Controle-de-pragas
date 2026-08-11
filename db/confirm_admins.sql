-- ============================================================================
-- Na Mira · Controle de Pragas — confirma o e-mail dos administradores reais
-- Rodar se o login retornar 400 (grant_type=password) após criar o usuário
-- direto pelo Dashboard sem marcar "Auto Confirm User".
-- ============================================================================

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email in ('melkzedektech@gmail.com', 'namiracomercial@gmail.com');

-- Confere.
select email, email_confirmed_at, confirmed_at from auth.users
where email in ('melkzedektech@gmail.com', 'namiracomercial@gmail.com');
