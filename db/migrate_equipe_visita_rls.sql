-- ============================================================================
-- Equipe da visita: o ajudante enxerga o atendimento e a OS
--
-- O agendamento guarda um técnico só (`appointments.technician_id`), mas a OS
-- aceita a equipe inteira (`service_orders.technician_ids`, jsonb). O app já
-- deriva a equipe a partir da OS — só que, no modo Supabase, a linha nem chega
-- ao ajudante: as políticas de db/rls.sql prendem o técnico ao próprio
-- `technician_id`, então o Postgres devolve zero linhas e não há o que filtrar
-- no cliente.
--
-- Consequência prática sem esta migration: o segundo técnico da OS não vê a
-- visita, nem a "Mensagem para o Técnico" que vem com ela, nem consegue
-- registrar produtos/estoque daquele atendimento.
--
-- Ordem importa: `service_orders` primeiro. A política de `appointments`
-- pergunta se existe uma OS daquela visita com o técnico na equipe, e essa
-- consulta roda sob o RLS de `service_orders` — se a OS ainda estiver invisível
-- para ele, o `exists` continua falso.
--
-- Idempotente: recria as duas políticas.
-- ============================================================================

-- Ordens de serviço: o técnico enxerga a OS em que é o responsável OU um dos
-- integrantes da equipe. `technician_ids` é jsonb (array de ids em texto), daí
-- o operador `?`, que testa a presença do elemento.
drop policy if exists tech_own_service_orders on public.service_orders;
create policy tech_own_service_orders on public.service_orders
  for all
  using (
    org_id = auth_org_id()
    and (
      auth_role() <> 'tecnico'
      or technician_id = auth_user_id()
      or coalesce(technician_ids, '[]'::jsonb) ? auth_user_id()::text
    )
  )
  with check (
    org_id = auth_org_id()
    and (
      auth_role() <> 'tecnico'
      or technician_id = auth_user_id()
      or coalesce(technician_ids, '[]'::jsonb) ? auth_user_id()::text
    )
  );

-- Agendamentos: além do responsável gravado na visita, libera quem está na
-- equipe da OS vinculada a ela.
drop policy if exists tech_own_appointments on public.appointments;
create policy tech_own_appointments on public.appointments
  for all
  using (
    org_id = auth_org_id()
    and (
      auth_role() <> 'tecnico'
      or technician_id = auth_user_id()
      or exists (
        select 1
          from public.service_orders so
         where so.appointment_id = appointments.id
           and (
             so.technician_id = auth_user_id()
             or coalesce(so.technician_ids, '[]'::jsonb) ? auth_user_id()::text
           )
      )
    )
  )
  with check (
    org_id = auth_org_id()
    and (
      auth_role() <> 'tecnico'
      or technician_id = auth_user_id()
      or exists (
        select 1
          from public.service_orders so
         where so.appointment_id = appointments.id
           and (
             so.technician_id = auth_user_id()
             or coalesce(so.technician_ids, '[]'::jsonb) ? auth_user_id()::text
           )
      )
    )
  );

notify pgrst, 'reload schema';

-- Conferência: as duas políticas devem aparecer citando `technician_ids`.
select tablename, policyname
  from pg_policies
 where schemaname = 'public'
   and policyname in ('tech_own_service_orders', 'tech_own_appointments')
   and qual like '%technician_ids%';
