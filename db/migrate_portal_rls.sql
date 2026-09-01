-- ============================================================================
-- Na Mira · Controle de Pragas — RLS do Portal do Cliente
--
-- Problema que este arquivo resolve:
--
--   O cliente entra no Portal com CPF/CNPJ + senha, mas não tinha sessão do
--   Supabase Auth — era um "usuário sintético" só do lado do navegador. Sem
--   JWT, o RLS nega tudo: o Portal ficava vazio. E a alternativa que fazia ele
--   "funcionar" era pior: desligar o RLS, o que deixa a chave anônima (que vai
--   no bundle JavaScript, à vista de qualquer um) baixar a tabela de clientes
--   inteira — documento, endereço, telefone e o hash da senha do portal.
--
--   Agora o login passa pela Edge Function `login-cliente`, que confere a senha
--   no servidor e devolve uma sessão de verdade. O cliente vira um usuário
--   autenticado com `app_role = 'cliente'` e `customer_id` nos claims, e as
--   políticas abaixo o prendem aos próprios registros.
--
-- Ordem: rode DEPOIS de db/rls.sql e db/auth_hook.sql. É idempotente.
-- Depois de rodar, reimplante a função:
--   supabase functions deploy login-cliente --no-verify-jwt
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Claim customer_id — quem o cliente é, para as políticas.
-- ---------------------------------------------------------------------------
create or replace function auth_customer_id() returns text
  language sql stable set search_path = '' as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'customer_id', '')
  $$;

-- O hook passa a injetar customer_id junto de org_id/app_role/user_id.
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
  -- inteira — o hook deixaria de injetar claims para admin, funcionário e
  -- técnico, e o RLS negaria tudo, inclusive o login.
  if found then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(app_user.org_id::text));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(app_user.role));
    claims := jsonb_set(claims, '{user_id}', to_jsonb(app_user.user_id::text));
    -- Cliente do Portal: sem este claim as políticas abaixo não têm a quem
    -- prender o acesso, e o RLS nega tudo.
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

-- ---------------------------------------------------------------------------
-- 1.1) O hook precisa LER public.users.
--
--      Isto também está em db/auth_hook.sql, repetido aqui de propósito: sem
--      o grant e a política, a consulta do hook roda fora de um request
--      autenticado (auth_org_id() nulo), devolve zero linhas, nenhum claim é
--      injetado — e aí TODAS as políticas negam tudo, para todo mundo. É a
--      falha que deixa o sistema inteiro vazio, não só o Portal.
-- ---------------------------------------------------------------------------
grant select on public.users to supabase_auth_admin;

drop policy if exists auth_admin_read_users on public.users;
create policy auth_admin_read_users on public.users
  as permissive for select
  to supabase_auth_admin
  using (true);

-- ---------------------------------------------------------------------------
-- 1.2) RLS LIGADO nas tabelas que o Portal alcança.
--
--      Política sem RLS habilitado não protege nada — e a conferência passaria
--      a dar ✅ mesmo com a tabela aberta, que é pior do que falhar. Normalmente
--      db/rls.sql já fez isso; repetir aqui torna este arquivo suficiente
--      sozinho, e `enable` é idempotente.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
     where c.table_schema = 'public' and c.column_name = 'org_id'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
  end loop;
  -- Sem org_id próprio: herdam o isolamento pela FK, mas precisam de RLS igual.
  foreach t in array array['trap_inspections']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security;', t);
      execute format('alter table public.%I force row level security;', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) O isolamento por organização deixa de valer para o cliente.
--
--    `org_isolation` libera TODA a organização a qualquer autenticado. Um
--    cliente logado passaria por ela e enxergaria os outros clientes. Aqui a
--    política geral passa a excluir o papel `cliente`, e o que ele pode ver
--    vira uma lista explícita, no passo 3.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.table_name
      from information_schema.columns c
     where c.table_schema = 'public' and c.column_name = 'org_id'
       -- Estas usam `staff_only` (ver db/rls.sql) e são tratadas logo abaixo.
       and c.table_name not in (
         'finance_entries','finance_accounts','finance_categories','commissions',
         'invoices','fiscal_settings','licenses','inspections','audit_logs'
       )
  loop
    execute format($p$
      drop policy if exists org_isolation on public.%1$I;
      create policy org_isolation on public.%1$I
        for all
        using (org_id = auth_org_id() and coalesce(auth_role(), '') <> 'cliente')
        with check (org_id = auth_org_id() and coalesce(auth_role(), '') <> 'cliente');
    $p$, t);
  end loop;
end $$;

-- `staff_only` barrava só o técnico — o cliente passava direto e via o
-- financeiro inteiro da organização.
do $$
declare t text;
begin
  foreach t in array array[
    'finance_entries','finance_accounts','finance_categories','commissions',
    'invoices','fiscal_settings','licenses','inspections','audit_logs'
  ]
  loop
    execute format($p$
      drop policy if exists staff_only on public.%1$I;
      create policy staff_only on public.%1$I
        for all
        using (org_id = auth_org_id() and coalesce(auth_role(), '') not in ('tecnico', 'cliente'))
        with check (org_id = auth_org_id() and coalesce(auth_role(), '') not in ('tecnico', 'cliente'));
    $p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) O que o cliente PODE ler — sempre preso ao próprio customer_id.
-- ---------------------------------------------------------------------------

-- O próprio cadastro (e só ele).
drop policy if exists cliente_self on public.customers;
create policy cliente_self on public.customers
  for select using (auth_role() = 'cliente' and id = auth_customer_id());

drop policy if exists cliente_appointments on public.appointments;
create policy cliente_appointments on public.appointments
  for select using (auth_role() = 'cliente' and customer_id = auth_customer_id());

drop policy if exists cliente_service_orders on public.service_orders;
create policy cliente_service_orders on public.service_orders
  for select using (auth_role() = 'cliente' and customer_id = auth_customer_id());

-- Financeiro: só os lançamentos do próprio cliente. `staff_only` acima já
-- barrou o resto.
drop policy if exists cliente_finance on public.finance_entries;
create policy cliente_finance on public.finance_entries
  for select using (auth_role() = 'cliente' and customer_id = auth_customer_id());

drop policy if exists cliente_invoices on public.invoices;
create policy cliente_invoices on public.invoices
  for select using (auth_role() = 'cliente' and customer_id = auth_customer_id());

drop policy if exists cliente_traps on public.trap_devices;
create policy cliente_traps on public.trap_devices
  for select using (auth_role() = 'cliente' and customer_id = auth_customer_id());

-- trap_inspections não tem customer_id: herda pelo dispositivo.
drop policy if exists cliente_trap_inspections on public.trap_inspections;
create policy cliente_trap_inspections on public.trap_inspections
  for select using (
    auth_role() = 'cliente'
    and trap_id in (select id from public.trap_devices where customer_id = auth_customer_id())
  );

-- Catálogos: só o que aparece nos documentos DELE. O catálogo inteiro traria
-- junto preço de produto e serviço — margem da empresa não é dado do cliente.
drop policy if exists cliente_service_types on public.service_types;
create policy cliente_service_types on public.service_types
  for select using (
    auth_role() = 'cliente'
    and (
      id in (select service_type_id from public.appointments where customer_id = auth_customer_id())
      or id in (select service_type_id from public.service_orders where customer_id = auth_customer_id())
      or id in (
        select jsonb_array_elements_text(coalesce(service_type_ids, '[]'::jsonb))
          from public.service_orders where customer_id = auth_customer_id()
      )
    )
  );

drop policy if exists cliente_pests on public.pests;
create policy cliente_pests on public.pests
  for select using (
    auth_role() = 'cliente'
    and id in (
      select jsonb_array_elements_text(coalesce(pest_ids, '[]'::jsonb))
        from public.service_orders where customer_id = auth_customer_id()
    )
  );

drop policy if exists cliente_products on public.products;
create policy cliente_products on public.products
  for select using (
    auth_role() = 'cliente'
    and id in (
      select p->>'productId'
        from public.service_orders so,
             lateral jsonb_array_elements(coalesce(so.products, '[]'::jsonb)) p
       where so.customer_id = auth_customer_id()
    )
  );

-- Técnicos: só quem de fato atendeu este cliente. O cadastro completo da
-- equipe (e-mail, telefone, setor de todo mundo) não é dado do cliente.
drop policy if exists cliente_technicians on public.users;
create policy cliente_technicians on public.users
  for select using (
    auth_role() = 'cliente'
    and (
      id in (select technician_id from public.appointments where customer_id = auth_customer_id())
      or id in (select technician_id from public.service_orders where customer_id = auth_customer_id())
      or id::text in (
        select jsonb_array_elements_text(coalesce(technician_ids, '[]'::jsonb))
          from public.service_orders where customer_id = auth_customer_id()
      )
    )
  );

-- A organização já é filtrada por `org_self` (id = auth_org_id()) — o cliente
-- precisa dela para o cabeçalho dos documentos.

-- ---------------------------------------------------------------------------
-- 4) O que o cliente pode ESCREVER — confirmar, pedir reagendamento, cancelar.
--
--    A política libera o UPDATE das próprias linhas; o que ele pode de fato
--    mudar é limitado pelo gatilho do passo 5. RLS não sabe restringir coluna,
--    e sem o gatilho o cliente poderia, pelo console do navegador, marcar a
--    própria OS como concluída ou mexer no valor cobrado.
-- ---------------------------------------------------------------------------
drop policy if exists cliente_appointments_write on public.appointments;
create policy cliente_appointments_write on public.appointments
  for update
  using (auth_role() = 'cliente' and customer_id = auth_customer_id())
  with check (auth_role() = 'cliente' and customer_id = auth_customer_id());

drop policy if exists cliente_service_orders_write on public.service_orders;
create policy cliente_service_orders_write on public.service_orders
  for update
  using (auth_role() = 'cliente' and customer_id = auth_customer_id())
  with check (auth_role() = 'cliente' and customer_id = auth_customer_id());

-- ---------------------------------------------------------------------------
-- 5) Gatilhos: o cliente só altera os campos do Portal.
--
--    O app manda a linha inteira no update (o store converte o objeto todo).
--    Então a regra é: parte de OLD e aceita de NEW apenas os campos que o
--    Portal oferece. Coluna nova criada no futuro entra automaticamente como
--    "não pode mudar", que é o padrão seguro.
-- ---------------------------------------------------------------------------
create or replace function public.portal_guard_appointments()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  guardado public.appointments;
begin
  if coalesce(auth_role(), '') <> 'cliente' then
    return new;
  end if;
  if new.status not in ('confirmado', 'reagendado', 'cancelado') then
    raise exception 'O cliente não pode definir este status de agendamento (%).', new.status;
  end if;
  guardado := old;
  guardado.status := new.status;
  guardado.notes := new.notes;
  guardado.confirmed_at := new.confirmed_at;
  guardado.reschedule_request := new.reschedule_request;
  return guardado;
end;
$$;

drop trigger if exists portal_guard_appointments on public.appointments;
create trigger portal_guard_appointments
  before update on public.appointments
  for each row execute function public.portal_guard_appointments();

create or replace function public.portal_guard_service_orders()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  guardado public.service_orders;
begin
  if coalesce(auth_role(), '') <> 'cliente' then
    return new;
  end if;
  if new.status <> 'cancelada' then
    raise exception 'O cliente só pode cancelar a ordem de serviço.';
  end if;
  guardado := old;
  guardado.status := new.status;
  guardado.cancelled_by := new.cancelled_by;
  guardado.cancelled_at := new.cancelled_at;
  guardado.cancel_reason := new.cancel_reason;
  return guardado;
end;
$$;

drop trigger if exists portal_guard_service_orders on public.service_orders;
create trigger portal_guard_service_orders
  before update on public.service_orders
  for each row execute function public.portal_guard_service_orders();

-- ---------------------------------------------------------------------------
-- 6) Busca do cliente pelo documento — usada só pela Edge Function de login.
--
--    O documento é guardado formatado ("123.456.789-00"), então a comparação
--    tem de ser pelos dígitos. `security definer` porque roda com a Service
--    Role antes de existir qualquer sessão; o `revoke` garante que ninguém
--    mais alcance a função (é ela que devolve o hash da senha).
-- ---------------------------------------------------------------------------
create or replace function public.portal_cliente_por_documento(doc text)
returns table (
  id text, org_id uuid, name text,
  portal_access boolean, is_active boolean, portal_password_hash text
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.org_id, c.name, c.portal_access, c.is_active, c.portal_password_hash
    from public.customers c
   where regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = regexp_replace(doc, '\D', '', 'g')
   limit 1
$$;

revoke execute on function public.portal_cliente_por_documento(text) from public, anon, authenticated;
grant execute on function public.portal_cliente_por_documento(text) to service_role;

notify pgrst, 'reload schema';
