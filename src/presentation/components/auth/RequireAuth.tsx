import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

/**
 * Guarda de rota. Redireciona para /login se não autenticado.
 * `requireStaff` bloqueia técnicos em rotas administrativas (vão para /campo).
 */
export function RequireAuth({
  children,
  requireStaff = false,
}: {
  children: ReactNode;
  requireStaff?: boolean;
}) {
  const user = useAppStore((s) => s.currentUser);
  const authLoading = useAppStore((s) => s.authLoading);
  const location = useLocation();

  // Com Supabase, a sessão persistida leva um instante para ser resolvida ao
  // carregar o app — evita mandar pra /login um usuário que na verdade já
  // está logado (a sessão só ainda não voltou da checagem assíncrona).
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-brand" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (requireStaff && user.role === 'tecnico') {
    return <Navigate to="/campo" replace />;
  }
  return <>{children}</>;
}
