-- ============================================================================
-- Na Mira · Controle de Pragas — conferência do banco
--
-- Cole TUDO no SQL Editor do Supabase e execute. É uma consulta só, de
-- propósito: o SQL Editor exibe apenas o resultado da ÚLTIMA instrução, então
-- um script com vários SELECTs mostraria só o último e esconderia o resto.
--
-- Só de leitura: não altera nada. Linhas com ❌ vêm primeiro.
-- Se tudo vier ✅, o banco está pronto para a versão atual do sistema.
--
-- As consultas de diagnóstico (quem ficou sem setor, quem pode cadastrar)
-- estão no fim do arquivo, comentadas — rode UMA POR VEZ quando precisar.
-- ============================================================================

with esperado(migration, tabela, coluna) as (values
  -- 1 · migrate_feedback_cliente.sql
  ('1 feedback',      'products',           'chemical_group'),
  ('1 feedback',      'products',           'antidote'),
  ('1 feedback',      'products',           'report_label'),
  ('1 feedback',      'products',           'treatment'),
  ('1 feedback',      'products',           'diluent'),
  ('1 feedback',      'customers',          'room_count'),
  ('1 feedback',      'customers',          'local_structure_qty'),
  ('1 feedback',      'recurring_payables', 'start_date'),
  ('1 feedback',      'recurring_payables', 'custom_interval_months'),
  ('1 feedback',      'recurring_payables', 'duration_kind'),
  ('1 feedback',      'recurring_payables', 'occurrences'),
  ('1 feedback',      'recurring_payables', 'end_date'),
  ('1 feedback',      'fiscal_settings',    'document_texts'),
  -- 2 · migrate_stock_locations_cadastro.sql
  ('2 locais',        'stock_locations',    'kind'),
  ('2 locais',        'stock_locations',    'owner_id'),
  -- 4 · migrate_campo_verificacao.sql
  ('4 campo/portal',  'appointments',       'customer_signature'),
  ('4 campo/portal',  'appointments',       'verification'),
  ('4 campo/portal',  'appointments',       'reschedule_request'),
  ('4 campo/portal',  'appointments',       'technician_signature'),
  ('4 campo/portal',  'appointments',       'fixed_time'),
  ('4 campo/portal',  'customers',          'portal_access'),
  ('4 campo/portal',  'customers',          'portal_password_hash'),
  ('4 campo/portal',  'customers',          'portal_password_set_at'),
  ('4 campo/portal',  'service_orders',     'custom_areas'),
  ('4 campo/portal',  'service_orders',     'customer_signature'),
  ('4 campo/portal',  'service_orders',     'has_customer_signature'),
  ('4 campo/portal',  'trap_devices',       'latitude'),
  ('4 campo/portal',  'trap_devices',       'longitude'),
  ('4 campo/portal',  'users',              'hide_financial_values'),
  ('4 campo/portal',  'users',              'customer_id'),
  ('4 campo/portal',  'users',              'department_id'),
  -- 4 · cancelamento pelo cliente e identificação de quem assinou
  ('4 campo/portal',  'service_orders',     'cancelled_by'),
  ('4 campo/portal',  'service_orders',     'cancelled_at'),
  ('4 campo/portal',  'service_orders',     'cancel_reason'),
  ('4 campo/portal',  'appointments',       'signer_name'),
  ('4 campo/portal',  'appointments',       'signer_doc_type'),
  ('4 campo/portal',  'appointments',       'signer_document'),
  ('4 campo/portal',  'service_orders',     'signer_name'),
  ('4 campo/portal',  'service_orders',     'signer_doc_type'),
  ('4 campo/portal',  'service_orders',     'signer_document')
),
colunas as (
  select
    e.migration                       as migration,
    e.tabela || '.' || e.coluna       as peca,
    case when c.column_name is null then '❌ FALTA' else '✅ OK' end as situacao
  from esperado e
  left join information_schema.columns c
         on c.table_schema = 'public'
        and c.table_name   = e.tabela
        and c.column_name  = e.coluna
),
papeis as (
  select
    '5-6 papeis'                      as migration,
    'papel ' || v                     as peca,
    case when v = any(enum_range(null::user_role)::text[])
         then '✅ OK' else '❌ FALTA' end as situacao
  from (values ('admin'), ('funcionario'), ('tecnico'), ('cliente')) t(v)
),
papel_antigo as (
  select
    '5-6 papeis'                                       as migration,
    'nenhum papel antigo em uso'                       as peca,
    case when exists (
      select 1 from public.users
       where role::text in ('supervisor','financeiro','atendimento','estoque')
    ) then '❌ FALTA' else '✅ OK' end                   as situacao
),
bucket as (
  select
    '3 storage'                                        as migration,
    'bucket atendimentos'                              as peca,
    case when exists (select 1 from storage.buckets where id = 'atendimentos')
         then '✅ OK' else '❌ FALTA' end                as situacao
),
-- 9 · migrate_portal_rls.sql — o Portal do Cliente depende de cada um destes.
portal as (
  select '9 portal rls' as migration, p.peca,
         case when p.existe then '✅ OK' else '❌ FALTA' end as situacao
    from (values
      ('função auth_customer_id',
       exists (select 1 from pg_proc where proname = 'auth_customer_id')),
      ('função portal_cliente_por_documento',
       exists (select 1 from pg_proc where proname = 'portal_cliente_por_documento')),
      ('política cliente_self em customers',
       exists (select 1 from pg_policies where schemaname='public' and tablename='customers' and policyname='cliente_self')),
      ('política cliente_service_orders',
       exists (select 1 from pg_policies where schemaname='public' and tablename='service_orders' and policyname='cliente_service_orders')),
      ('gatilho portal_guard_appointments',
       exists (select 1 from pg_trigger where tgname = 'portal_guard_appointments')),
      ('gatilho portal_guard_service_orders',
       exists (select 1 from pg_trigger where tgname = 'portal_guard_service_orders')),
      -- Se esta falhar, o cliente logado enxerga a organização inteira.
      ('org_isolation exclui o papel cliente',
       exists (select 1 from pg_policies
                where schemaname='public' and tablename='customers'
                  and policyname='org_isolation' and qual like '%cliente%')),
      -- Política sem RLS habilitado não protege nada: a tabela fica aberta e
      -- as linhas acima continuariam dando ✅. Por isso o estado do RLS é
      -- conferido junto.
      ('RLS habilitado em customers',
       coalesce((select c.relrowsecurity from pg_class c
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname='public' and c.relname='customers'), false)),
      ('RLS habilitado em service_orders',
       coalesce((select c.relrowsecurity from pg_class c
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname='public' and c.relname='service_orders'), false)),
      -- Sem isto o hook não lê public.users, nenhum claim entra no JWT e o RLS
      -- nega tudo para TODO MUNDO — não só para o cliente.
      ('hook custom_access_token_hook existe',
       exists (select 1 from pg_proc where proname = 'custom_access_token_hook')),
      ('hook consegue ler users (auth_admin_read_users)',
       exists (select 1 from pg_policies
                where schemaname='public' and tablename='users'
                  and policyname='auth_admin_read_users')),
      -- Sem esta, o login do Portal falha: o app não acha a própria linha do
      -- cliente em public.users e não descobre org, papel nem customer_id.
      ('cliente lê a própria linha em users (cliente_own_user)',
       exists (select 1 from pg_policies
                where schemaname='public' and tablename='users'
                  and policyname='cliente_own_user')),
      -- Sem estas, os documentos do Portal saem sem cabeçalho da empresa,
      -- sem informações toxicológicas e sem responsável técnico.
      ('cliente lê fiscal_settings (documentos)',
       exists (select 1 from pg_policies
                where schemaname='public' and tablename='fiscal_settings'
                  and policyname='cliente_fiscal_settings')),
      ('cliente lê licenses (responsável técnico no laudo)',
       exists (select 1 from pg_policies
                where schemaname='public' and tablename='licenses'
                  and policyname='cliente_licenses')),
      -- Se esta falhar, criar OS recorrente quebra em todas as visitas com
      -- "invalid input syntax for type uuid".
      -- Gatilho que chama auth_role() sem `public.` quebra TODO update destas
      -- tabelas, para a equipe inteira, com "function auth_role() does not exist".
      ('gatilhos do Portal chamam public.auth_role()',
       not exists (
         select 1 from pg_proc p
          where p.proname in ('portal_guard_appointments', 'portal_guard_service_orders')
            and p.prosrc like '%coalesce(auth_role()%'
       )),
      ('appointments.recurrence_id é text',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='appointments'
                  and column_name='recurrence_id' and data_type = 'text'))
    ) as p(peca, existe)
)
select * from colunas
union all select * from papeis
union all select * from papel_antigo
union all select * from bucket
union all select * from portal
order by situacao desc, migration, peca;


-- ============================================================================
-- DIAGNÓSTICO — rode UMA POR VEZ (selecione a consulta e execute).
-- O SQL Editor só mostra o resultado da última instrução enviada.
-- ============================================================================

-- Quantos usuários por papel:
--   select role::text as papel, count(*) as usuarios
--     from public.users group by role order by role;

-- Funcionários sem setor (enxergam só o Dashboard):
--   select u.name, u.email, coalesce(d.name, '— SEM SETOR —') as setor
--     from public.users u
--     left join public.departments d on d.id = u.department_id
--    where u.role::text = 'funcionario'
--    order by (u.department_id is null) desc, u.name;

-- Quem pode cadastrar pessoas (admin + funcionário com "configuracoes" no setor):
--   select u.name, u.email, u.role::text as papel, coalesce(d.name, '—') as setor
--     from public.users u
--     left join public.departments d on d.id = u.department_id
--    where u.role::text = 'admin'
--       or (u.role::text = 'funcionario' and d.modules ? 'configuracoes')
--    order by u.role::text, u.name;
