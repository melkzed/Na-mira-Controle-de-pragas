import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-6xl font-bold text-brand">404</p>
      <p className="mt-2 text-lg font-semibold text-foreground">Página não encontrada</p>
      <p className="mt-1 text-sm text-muted-foreground">O recurso que você procura não existe ou foi movido.</p>
      <Link to="/" className="mt-6"><Button>Voltar ao dashboard</Button></Link>
    </div>
  );
}
