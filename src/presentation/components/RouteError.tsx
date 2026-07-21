import { useRouteError, useNavigate, isRouteErrorResponse } from 'react-router-dom';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Button } from './ui/Button';

/** Tela de erro amigável usada como errorElement das rotas. */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();

  const title = isRouteErrorResponse(error)
    ? `${error.status} · ${error.statusText}`
    : 'Algo deu errado';
  const detail =
    error instanceof Error ? error.message : 'Ocorreu um erro inesperado ao carregar esta tela.';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle size={26} />
      </div>
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{detail}</p>
      <div className="mt-6 flex gap-2">
        <Button variant="outline" leftIcon={<RotateCcw size={15} />} onClick={() => window.location.reload()}>
          Recarregar
        </Button>
        <Button leftIcon={<Home size={15} />} onClick={() => navigate('/')}>
          Ir para o início
        </Button>
      </div>
    </div>
  );
}

/** Fallback de carregamento para rotas com code splitting (React.lazy). */
export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" />
    </div>
  );
}
