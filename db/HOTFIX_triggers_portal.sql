-- ============================================================================
-- Na Mira · Controle de Pragas — CORREÇÃO dos gatilhos do Portal
--
-- Sintoma: a OS é criada ("ordem criada"), mas salvar em seguida falha com
--   42883 function auth_role() does not exist
-- e o mesmo vale para qualquer alteração de agendamento.
--
-- Causa: os dois gatilhos que eu criei em db/migrate_portal_rls.sql declaram
-- `set search_path = ''` — o certo para função `security definer`, porque
-- impede que alguém redirecione a resolução de nomes. Só que aí TODA referência
-- precisa vir com o esquema, e eu chamei `auth_role()` sem o `public.`. A
-- função existe; o gatilho é que não a enxerga.
--
-- As POLÍTICAS não têm esse problema: a expressão de uma policy é resolvida
-- quando ela é criada e guardada já apontando para a função. Por isso ler e
-- inserir funcionavam, e só o UPDATE quebrava — é onde o gatilho entra.
--
-- Como o gatilho roda em toda alteração dessas tabelas, isto afeta a equipe
-- inteira, não só o Portal.
--
-- Rode este arquivo. Não precisa mexer no painel nem sair e entrar de novo.
-- ============================================================================

create or replace function public.portal_guard_appointments()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  guardado public.appointments;
begin
  -- `public.auth_role()`: com search_path vazio, nome sem esquema não resolve.
  if coalesce(public.auth_role(), '') <> 'cliente' then
    return new;
  end if;
  if new.status not in ('confirmado', 'reagendado', 'cancelado') then
    raise exception 'O cliente não pode definir este status de agendamento (%).', new.status;
  end if;
  -- Parte de OLD e aceita de NEW só os campos do Portal: coluna criada no
  -- futuro entra automaticamente como "não pode mudar".
  guardado := old;
  guardado.status := new.status;
  guardado.notes := new.notes;
  guardado.confirmed_at := new.confirmed_at;
  guardado.reschedule_request := new.reschedule_request;
  return guardado;
end;
$$;

create or replace function public.portal_guard_service_orders()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  guardado public.service_orders;
begin
  if coalesce(public.auth_role(), '') <> 'cliente' then
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

notify pgrst, 'reload schema';
