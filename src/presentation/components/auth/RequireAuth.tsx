import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Loader2, ShieldOff } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useDepartmentsStore } from '@/store/entityStores';
import { hasModuleAccess } from '@/application/permissions';
import type { PermissionModule } from '@/domain/enums';
import { MODULE_META } from '@/domain/enums';

/**
 * Guarda de rota. Redireciona para /login se não autenticado.
 * `requireStaff` bloqueia técnicos (vão para /campo) e clientes (vão para
 * /portal) em rotas administrativas. `requireCliente` faz o inverso: só o
 * papel `cliente` entra no Portal — nenhum usuário interno cai lá dentro.
 * `module`, quando informado, bloqueia o acesso à rota se o usuário (pelo
 * departamento + exceções individuais) não tiver esse módulo liberado — a
 * mesma checagem que já esconde o item do Sidebar/⌘K, agora também na URL
 * direta (sem isso, dava pra contornar a permissão digitando a rota).
 */
export function RequireAuth({
  children,
  requireStaff = false,
  requireCliente = false,
  module,
}: {
  children: ReactNode;
  requireStaff?: boolean;
  requireCliente?: boolean;
  module?: PermissionModule;
}) {
  const user = useAppStore((s) => s.currentUser);
  const authLoading = useAppStore((s) => s.authLoading);
  const departments = useDepartmentsStore((s) => s.items);
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
  // Cliente nunca entra no sistema administrativo nem no app de campo: seja
  // qual for a rota interna, volta para o Portal.
  if (user.role === 'cliente' && !requireCliente) {
    return <Navigate to="/portal" replace />;
  }
  if (requireCliente && user.role !== 'cliente') {
    return <Navigate to={user.role === 'tecnico' ? '/campo' : '/'} replace />;
  }
  if (module && !hasModuleAccess(user, module, departments)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={36} className="text-muted-foreground" />
        <div>
          <p className="font-semibold text-foreground">Acesso restrito</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Você não tem permissão para acessar {MODULE_META[module].label}. Fale com um administrador se precisar desse acesso.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
