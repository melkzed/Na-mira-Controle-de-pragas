-- ============================================================================
-- Na Mira · Controle de Pragas — correções do RLS do Portal (parte 2)
--
-- O arquivo anterior (db/migrate_portal_rls.sql) prendeu o cliente aos próprios
-- registros, mas fechou demais em três pontos. Nenhum deles aparece na
-- conferência: as políticas existem, o RLS está ligado, tudo dá ✅ — e mesmo
-- assim o Portal não funciona. Só entrando no Portal para ver.
--
-- Rode DEPOIS de db/migrate_portal_rls.sql. É idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) O cliente precisa ler a PRÓPRIA linha em public.users.
--
--    Este é o que impede o login: depois de trocar o token por sessão, o app
--    busca em `users` a linha do usuário autenticado (`fetchAppUser`) para
--    saber org, papel e customer_id. A política anterior só liberava os
--    TÉCNICOS que atenderam o cliente — a linha dele próprio ficava de fora, a
--    busca voltava vazia e o login terminava em erro genérico.
-- ---------------------------------------------------------------------------
drop policy if exists cliente_own_user on public.users;
create policy cliente_own_user on public.users
  for select using (auth_role() = 'cliente' and customer_id = auth_customer_id());

-- ---------------------------------------------------------------------------
-- 2) Dados da empresa nos documentos do cliente.
--
--    O Portal gera a Ordem de Serviço, o Laudo e o Certificado — os mesmos
--    documentos do escritório. Eles montam o cabeçalho com o cadastro da
--    empresa (`organizations`), os textos padrão e o telefone de emergência
--    (`fiscal_settings`). `org_isolation` e `staff_only` passaram a excluir o
--    cliente, então esses documentos sairiam sem cabeçalho e sem as
--    informações toxicológicas — que são justamente o que um laudo precisa ter.
--
--    `organizations` já é filtrada por `org_self` (id = auth_org_id()); falta
--    liberar as configurações fiscais, em leitura.
-- ---------------------------------------------------------------------------
drop policy if exists cliente_fiscal_settings on public.fiscal_settings;
create policy cliente_fiscal_settings on public.fiscal_settings
  for select using (auth_role() = 'cliente' and org_id = auth_org_id());

-- ---------------------------------------------------------------------------
-- 3) Licenças da empresa no Laudo.
--
--    O Laudo identifica o responsável técnico e o registro dele. É informação
--    que a empresa presta AO cliente — está no documento que ele recebe
--    impresso —, então esconder no Portal não protege nada e só quebra o
--    documento. Leitura apenas, e só das licenças da própria organização.
-- ---------------------------------------------------------------------------
drop policy if exists cliente_licenses on public.licenses;
create policy cliente_licenses on public.licenses
  for select using (auth_role() = 'cliente' and org_id = auth_org_id());

notify pgrst, 'reload schema';
