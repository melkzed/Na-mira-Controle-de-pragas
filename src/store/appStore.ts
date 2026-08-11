import { create } from 'zustand';
import type { AppNotification, User } from '@/domain/types';
import { users } from '@/infrastructure/seed/data';
import { authenticate, getSessionUser, signOut as authSignOut } from '@/application/auth';
import { supabase, supabaseEnabled } from '@/lib/supabaseClient';
import { daysFromNowIso } from '@/lib/misc';

type Theme = 'light' | 'dark';

interface AppState {
  theme: Theme;
  currentUser: User | null;
  /** true enquanto a sessão do Supabase Auth ainda está sendo resolvida ao
   *  carregar o app — evita redirecionar para /login antes de saber se já
   *  existe sessão válida (localStorage, sem Supabase, não precisa disso). */
  authLoading: boolean;
  notifications: AppNotification[];
  commandOpen: boolean;
  toggleTheme: () => void;
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => void;
  markAllRead: () => void;
  setCommandOpen: (open: boolean) => void;
  addNotification: (n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => void;
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

/** Modo standalone: reidrata a sessão local pelo id salvo no localStorage. */
function initUserStandalone(): User | null {
  const id = localStorage.getItem(USER_KEY);
  if (!id) return null;
  return users.find((u) => u.id === id && u.isActive) ?? null;
}

export const useAppStore = create<AppState>((set) => ({
  theme: initTheme(),
  currentUser: supabaseEnabled ? null : initUserStandalone(),
  authLoading: supabaseEnabled,
  notifications: initialNotifications,
  commandOpen: false,
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('namira-theme', theme);
      return { theme };
    }),
  login: async (email, password) => {
    const { user } = await authenticate(email, password);
    if (user) {
      if (!supabaseEnabled) localStorage.setItem(USER_KEY, user.id);
      set({ currentUser: user });
    }
    return user;
  },
  logout: () => {
    if (!supabaseEnabled) localStorage.removeItem(USER_KEY);
    set({ currentUser: null, commandOpen: false });
    void authSignOut();
  },
  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  addNotification: (n) =>
    set((s) => ({
      notifications: [
        { id: 'notif-' + Math.random().toString(36).slice(2, 9), read: false, createdAt: new Date().toISOString(), ...n },
        ...s.notifications,
      ],
    })),
}));

// Modo Supabase: resolve a sessão persistida (localStorage do supabase-js) ao
// carregar o app, e mantém currentUser sincronizado com logout/expiração de
// sessão vindos de outra aba. "SIGNED_IN" não é tratado aqui — login() já
// atualiza o estado diretamente, evitando uma segunda busca redundante.
if (supabaseEnabled && supabase) {
  getSessionUser()
    .then((user) => useAppStore.setState({ currentUser: user, authLoading: false }))
    .catch(() => useAppStore.setState({ currentUser: null, authLoading: false }));

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      useAppStore.setState({ currentUser: null });
    }
  });
}
