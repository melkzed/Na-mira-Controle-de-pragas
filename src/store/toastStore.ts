import { create } from 'zustand';

export type ToastTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = 't-' + Math.random().toString(36).slice(2, 8);
    set({ toasts: [...get().toasts, { id, ...t }] });
    setTimeout(() => get().dismiss(id), t.action ? 6000 : 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

/** Dispara um toast de qualquer lugar (inclusive fora de componentes React). */
export function toast(message: string, opts?: { tone?: ToastTone; action?: Toast['action'] }) {
  useToastStore.getState().push({ message, tone: opts?.tone ?? 'default', action: opts?.action });
}
