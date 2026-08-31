/**
 * Aplicação — confirmação das visitas de um plano de recorrência.
 *
 * Um plano de recorrência gera agendamentos com meses de antecedência. Entre a
 * programação e a data, quase tudo pode mudar: o cliente troca o dia, o
 * contrato muda de escopo, a visita deixa de fazer sentido. Por isso a visita
 * programada não vira Ordem de Serviço sozinha — uma semana antes o sistema
 * avisa, e alguém confirma.
 *
 * Ao confirmar, a OS nasce copiando a última OS daquele mesmo plano: serviços,
 * pragas, áreas, equipe, produtos e valor já vêm preenchidos, porque visita
 * recorrente é, por definição, a repetição do mesmo atendimento. O que muda é
 * a data.
 */
import type { Appointment, ServiceOrder } from '@/domain/types';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useServiceOrdersStore, type ServiceOrderInput } from '@/store/serviceOrdersStore';
import { getCustomer, serviceOrderForAppointment } from './repository';
import { fmtDate, fmtTime } from '@/lib/date';
import { useAppStore } from '@/store/appStore';

/** Antecedência do aviso, em dias. */
export const DIAS_DE_AVISO = 7;

export interface PendingRecurrence {
  appointment: Appointment;
  /** OS que originou o plano — é dela que a nova OS é copiada. */
  origem?: ServiceOrder;
  /** Dias até a visita (0 = hoje; negativo = já passou e ninguém confirmou). */
  emDias: number;
}

function diasAte(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(iso);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

/**
 * Visitas de recorrência que precisam de confirmação: dentro da janela de
 * aviso (ou atrasadas), ainda sem Ordem de Serviço e ainda não finalizadas.
 *
 * Visita atrasada continua na lista de propósito — some da tela é justamente o
 * que faz uma visita contratada ser esquecida.
 */
export function pendingRecurrenceConfirmations(): PendingRecurrence[] {
  const appts = useAppointmentsStore.getState().appointments;
  return appts
    .filter((a) => a.recurrenceId)
    .filter((a) => a.status === 'programada' || a.status === 'agendado')
    .map((a) => ({ appointment: a, emDias: diasAte(a.scheduledStart) }))
    .filter(({ emDias }) => emDias <= DIAS_DE_AVISO)
    .filter(({ appointment }) => !serviceOrderForAppointment(appointment.id))
    .map(({ appointment, emDias }) => ({
      appointment,
      emDias,
      origem: origemDaRecorrencia(appointment),
    }))
    .sort((a, b) => a.emDias - b.emDias);
}

/** A OS mais recente do mesmo plano — o modelo do próximo atendimento. */
export function origemDaRecorrencia(appt: Appointment): ServiceOrder | undefined {
  const grupo = appt.recurrenceId;
  if (!grupo) return undefined;
  const doPlano = useServiceOrdersStore
    .getState()
    .orders.filter((o) => o.recurrence?.recurrenceGroupId === grupo)
    .sort((a, b) => (b.executionDate ?? b.createdAt).localeCompare(a.executionDate ?? a.createdAt));
  return doPlano[0];
}

/**
 * Cria a Ordem de Serviço da visita, copiando a OS anterior do plano.
 *
 * O que NÃO é copiado é tão importante quanto o que é: assinaturas, horários
 * de execução, pagamento e o próprio plano de recorrência ficam de fora — são
 * fatos do atendimento anterior, e repeti-los produziria uma OS que afirma
 * coisas que não aconteceram.
 */
export async function confirmRecurrenceVisit(pendente: PendingRecurrence): Promise<ServiceOrder | null> {
  const { appointment, origem } = pendente;
  if (!origem) return null;

  const input: ServiceOrderInput = {
    customerId: origem.customerId,
    appointmentId: appointment.id,
    serviceTypeId: origem.serviceTypeId,
    serviceTypeIds: origem.serviceTypeIds,
    technicianId: appointment.technicianId ?? origem.technicianId,
    technicianIds: origem.technicianIds,
    sellerId: origem.sellerId,
    status: 'em_andamento',
    areaIds: origem.areaIds,
    areaQty: origem.areaQty,
    customAreas: origem.customAreas,
    areaTreated: origem.areaTreated,
    procedures: origem.procedures,
    technicianMessage: origem.technicianMessage,
    pestIds: origem.pestIds,
    // Quantidade planejada, não aplicada: quem diz o que foi usado é o técnico.
    products: (origem.products ?? []).map((p) => ({ productId: p.productId, usedQty: p.usedQty })),
    paymentMethod: origem.paymentMethod,
    serviceValue: origem.serviceValue,
    serviceValueConfirmed: origem.serviceValueConfirmed,
    warranty: origem.warranty,
    executionDate: appointment.scheduledStart,
    executionTime: fmtTime(appointment.scheduledStart),
    hasCustomerSignature: false,
    // A recorrência continua sendo do plano original — esta OS é uma
    // ocorrência dele, não a origem de um plano novo.
    recurrence: { enabled: false, recurrenceGroupId: appointment.recurrenceId },
  };

  const os = await useServiceOrdersStore.getState().add(input);
  useAppointmentsStore.getState().update(appointment.id, { status: 'agendado', confirmedAt: new Date().toISOString() });
  return os;
}

/** Texto do aviso — usado na notificação e na lista da Agenda. */
export function pendingLabel(p: PendingRecurrence): string {
  if (p.emDias < 0) return `atrasada há ${Math.abs(p.emDias)} dia(s)`;
  if (p.emDias === 0) return 'é hoje';
  if (p.emDias === 1) return 'é amanhã';
  return `em ${p.emDias} dias`;
}

/**
 * Cria as notificações das visitas que precisam de confirmação.
 *
 * Idempotente por visita: a chave é o id do agendamento, então reabrir o
 * sistema várias vezes no mesmo dia não empilha o mesmo aviso — notificação
 * repetida é a forma mais rápida de a pessoa parar de ler as notificações.
 */
export function notifyPendingRecurrences(): void {
  const store = useAppStore.getState();
  const jaAvisados = new Set(
    store.notifications.filter((n) => n.entityType === 'appointment').map((n) => n.entityId),
  );
  pendingRecurrenceConfirmations().forEach((p) => {
    if (jaAvisados.has(p.appointment.id)) return;
    const cliente = getCustomer(p.appointment.customerId)?.name ?? 'Cliente';
    store.addNotification({
      title: `Recorrência a confirmar — ${cliente}`,
      body: `A visita programada ${pendingLabel(p)} (${fmtDate(p.appointment.scheduledStart)}). Confirme para gerar a ordem de serviço.`,
      tone: p.emDias < 0 ? 'danger' : 'warning',
      entityType: 'appointment',
      entityId: p.appointment.id,
    });
  });
}
