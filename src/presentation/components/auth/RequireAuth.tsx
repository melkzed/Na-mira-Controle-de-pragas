import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
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
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (requireStaff && user.role === 'tecnico') {
    return <Navigate to="/campo" replace />;
  }
  return <>{children}</>;
}
