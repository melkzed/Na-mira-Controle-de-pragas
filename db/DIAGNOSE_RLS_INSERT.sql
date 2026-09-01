-- ============================================================================
-- Na Mira · Controle de Pragas — o RLS ainda nega, e o JWT tem os claims?
--
-- Use SÓ se o token do navegador já mostra org_id/app_role/user_id e mesmo
-- assim aparece "new row violates row-level security policy". Aí a causa não é
-- o claim faltando, e sim alguma política restritiva ou um org_id divergente.
--
-- Cole tudo e execute. É de leitura.
-- ============================================================================

-- 1) Todas as políticas de service_orders e appointments, com o texto delas.
--    Política RESTRITIVA ("permissive = RESTRICTIVE") é E, não OU: uma sozinha
--    barra tudo, mesmo com as outras liberando.
select
  tablename                                   as tabela,
  policyname                                  as politica,
  case permissive when 'PERMISSIVE' then 'permissiva (OU)' else '⚠ RESTRITIVA (E)' end as tipo,
  cmd                                         as comando,
  coalesce(qual, '—')                         as condicao_leitura,
  coalesce(with_check, '—')                   as condicao_escrita
from pg_policies
where schemaname = 'public'
  and tablename in ('service_orders', 'appointments')
order by tablename, policyname;

-- ----------------------------------------------------------------------------
-- 2) Quantas organizações existem? Rode SEPARADAMENTE (o editor só mostra o
--    último resultado). Se houver mais de uma, o cadastro do usuário pode estar
--    numa e a OS sendo criada em outra.
--
--   select o.id, o.name, (select count(*) from public.users u where u.org_id = o.id) as usuarios
--     from public.organizations o order by o.name;
--
-- 3) O usuário órfão do Auth, que nunca entrou e não tem cadastro.
--    Não atrapalha nada enquanto ninguém entrar com ele — mas se alguém entrar,
--    o sistema abre vazio e nega tudo, sem explicar o motivo.
--    Para removê-lo: painel → Authentication → Users → apagar o e-mail.
--    Para dar acesso a ele: cadastre a pessoa em Configurações → Departamento,
--    com este mesmo e-mail, que o vínculo é feito no primeiro login.
--
--   select au.email, au.created_at, au.last_sign_in_at
--     from auth.users au
--     left join public.users u on u.auth_user_id = au.id
--    where u.id is null;
-- ----------------------------------------------------------------------------
