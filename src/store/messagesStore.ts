import { create } from 'zustand';

/**
 * Mensagens de WhatsApp (SIMULAÇÃO).
 * Modela o envio de confirmação/lembrete/conclusão e a confirmação do cliente.
 * Para produção, troque `send`/`markDelivered` por chamadas à API do WhatsApp
 * (Meta Cloud API ou Twilio) mantendo a mesma interface — a UI não muda.
 */
export type WhatsMessageType = 'confirmacao' | 'lembrete' | 'conclusao';
export type WhatsMessageStatus = 'enviada' | 'entregue' | 'lida' | 'confirmada';

export interface WhatsMessage {
  id: string;
  appointmentId?: string;
  customerId: string;
  phone?: string;
  type: WhatsMessageType;
  body: string;
  status: WhatsMessageStatus;
  sentAt: string;
  deliveredAt?: string;
  confirmedAt?: string;
}

const KEY = 'namira-whatsapp';

interface MessagesState {
  messages: WhatsMessage[];
  send: (m: Omit<WhatsMessage, 'id' | 'status' | 'sentAt'>) => WhatsMessage;
  setStatus: (id: string, status: WhatsMessageStatus) => void;
}

function load(): WhatsMessage[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as WhatsMessage[];
  } catch {
    /* ignora */
  }
  return [];
}
const save = (v: unknown) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignora */ } };
const uid = () => 'wa-' + Math.random().toString(36).slice(2, 9);

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messages: load(),
  send: (m) => {
    const msg: WhatsMessage = { id: uid(), status: 'enviada', sentAt: new Date().toISOString(), ...m };
    const messages = [msg, ...get().messages];
    save(messages); set({ messages });
    // Simula confirmação de entrega pelo gerenciador (após breve intervalo).
    setTimeout(() => get().setStatus(msg.id, 'entregue'), 900);
    return msg;
  },
  setStatus: (id, status) => {
    const messages = get().messages.map((m) => (m.id === id
      ? { ...m, status, deliveredAt: status === 'entregue' ? new Date().toISOString() : m.deliveredAt, confirmedAt: status === 'confirmada' ? new Date().toISOString() : m.confirmedAt }
      : m));
    save(messages); set({ messages });
  },
}));
