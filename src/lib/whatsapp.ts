import type { Appointment, Customer } from '@/domain/types';
import type { WhatsMessageType } from '@/store/messagesStore';

/** Modelos de mensagem de WhatsApp para a jornada da visita. */
export function buildWhatsMessage(type: WhatsMessageType, customer: Customer, appt: Appointment, serviceName?: string): string {
  const first = customer.name.split(' ')[0];
  const d = new Date(appt.scheduledStart);
  const data = d.toLocaleDateString('pt-BR');
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const svc = serviceName ?? 'atendimento';

  switch (type) {
    case 'confirmacao':
      return `Olá, ${first}! Aqui é da Na Mira Controle de Pragas. Confirmamos sua visita de ${svc} para ${data} às ${hora}. Responda *SIM* para confirmar ou entre em contato para reagendar.`;
    case 'lembrete':
      return `Olá, ${first}! Lembrete: sua visita de ${svc} está agendada para amanhã, ${data}, às ${hora}. Nosso técnico chegará no horário. Até lá!`;
    case 'conclusao':
      return `Olá, ${first}! O serviço de ${svc} foi concluído com sucesso. Em breve você receberá a Ordem de Serviço e o certificado. Obrigado por confiar na Na Mira!`;
  }
}

export const WHATS_TYPE_LABEL: Record<WhatsMessageType, string> = {
  confirmacao: 'Confirmação',
  lembrete: 'Lembrete',
  conclusao: 'Conclusão',
};
