import { create } from 'zustand';
import type { AppNotification, User } from '@/domain/types';
import { users } from '@/infrastructure/seed/data';
import { authenticate } from '@/application/auth';
import { daysFromNowIso } from '@/lib/misc';

type Theme = 'light' | 'dark';

interface AppState {
  theme: Theme;
  currentUser: User | null;
  notifications: AppNotification[];
  commandOpen: boolean;
  toggleTheme: () => void;
  login: (email: string, password: string) => User | null;
  logout: () => void;
  markAllRead: () => void;
  setCommandOpen: (open: boolean) => void;
}

const USER_KEY = 'namira-user';

const initialNotifications: AppNotification[] = [
  { id: 'n-1', title: 'Nova Ordem de Serviço', body: 'OS #1045 criada para Restaurante Sabor & Cia', tone: 'info', entityType: 'service_order', read: false, createdAt: daysFromNowIso(0) },
  { id: 'n-2', title: 'Estoque baixo', body: 'Klerat Blocos abaixo do mínimo no estoque central', tone: 'warning', entityType: 'product', read: false, createdAt: daysFromNowIso(0) },
  { id: 'n-3', title: 'Licença vencida', body: 'Registro de Responsável Técnico (CRQ) venceu há 8 dias', tone: 'danger', entityType: 'license', read: false, createdAt: daysFromNowIso(-1) },
  { id: 'n-4', title: 'Pagamento recebido', body: 'R$ 320,00 · Padaria Pão Quente', tone: 'success', entityType: 'finance', read: true, createdAt: daysFromNowIso(0) },
  { id: 'n-5', title: 'Reagendamento solicitado', body: 'Cliente Helena Martins pediu para remarcar', tone: 'warning', entityType: 'appointment', read: true, createdAt: daysFromNowIso(-1) },
];

function initTheme(): Theme {
  const stored = localStorage.getItem('namira-theme') as Theme | null;
  const theme = stored ?? 'light';
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

/** Reidrata a sessão a partir do localStorage (sessão persistente). */
function initUser(): User | null {
  const id = localStorage.getItem(USER_KEY);
  if (!id) return null;
  return users.find((u) => u.id === id && u.isActive) ?? null;
}

export const useAppStore = create<AppState>((set) => ({
  theme: initTheme(),
  currentUser: initUser(),
  notifications: initialNotifications,
  commandOpen: false,
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('namira-theme', theme);
      return { theme };
    }),
  login: (email, password) => {
    const { user } = authenticate(email, password);
    if (user) {
      localStorage.setItem(USER_KEY, user.id);
      set({ currentUser: user });
    }
    return user;
  },
  logout: () => {
    localStorage.removeItem(USER_KEY);
    set({ currentUser: null, commandOpen: false });
  },
  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));
