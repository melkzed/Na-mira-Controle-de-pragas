import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { DEMO_PASSWORD, demoAccounts, landingPathFor } from '@/application/auth';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Badge } from '../components/ui/Badge';
import { LogoMark } from '../components/ui/Logo';

export function LoginPage() {
  const { currentUser, login } = useAppStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Já autenticado → vai direto para a área correta.
  if (currentUser) {
    return <Navigate to={landingPathFor(currentUser)} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const user = await login(email, password);
    setLoading(false);
    if (!user) {
      setError(demoAccounts.length ? 'E-mail ou senha inválidos. Use a senha de demonstração abaixo.' : 'E-mail ou senha inválidos.');
      return;
    }
    navigate(landingPathFor(user), { replace: true });
  };

  const quickLogin = async (accEmail: string) => {
    setEmail(accEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
    setLoading(true);
    const user = await login(accEmail, DEMO_PASSWORD);
    setLoading(false);
    if (user) navigate(landingPathFor(user), { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Painel de marca (desktop) */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-brand to-red-900 lg:flex lg:flex-col lg:justify-between lg:p-12 text-white">
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <LogoMark size={30} className="text-white" />
          </div>
          <div>
            <p className="text-lg font-bold">Gestão</p>
            <p className="-mt-1 text-lg font-bold">Dedetizadora</p>
          </div>
        </div>

        <div className="relative">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-md text-3xl font-bold leading-tight"
          >
            Toda a operação de dedetização na palma da mão.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 max-w-md text-white/80"
          >
            Gestores acompanham a operação em tempo real. Técnicos recebem a
            rotina do dia, rota, checklist e estoque — direto no celular.
          </motion.p>
          <div className="mt-8 flex flex-wrap gap-2">
            {['Agenda inteligente', 'Rotas otimizadas', 'App do técnico', 'Estoque em campo'].map((t) => (
              <span key={t} className="rounded-full bg-white/12 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
                {t}
              </span>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/60">
          © {new Date().getFullYear()} Gestão Dedetizadora · O controle inteligente das suas operações
        </p>
      </div>

      {/* Formulário */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-10 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          {/* Marca (mobile) */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <LogoMark size={34} className="shrink-0 text-brand" />
            <div className="leading-tight">
              <p className="font-bold text-foreground">Gestão</p>
              <p className="-mt-0.5 font-bold text-foreground">Dedetizadora</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-foreground">Acessar o sistema</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Entre com seu e-mail e senha para continuar.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="E-mail" required>
              <Input
                type="email"
                autoComplete="username"
                placeholder="voce@namira.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>

            <Field label="Senha" required>
              <div className="relative">
                <Input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading} leftIcon={<LogIn size={16} />}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          {/* Acesso rápido (demonstração) — só existe no modo standalone, sem Supabase configurado */}
          {demoAccounts.length > 0 && (
            <div className="mt-8">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                <Sparkles size={13} /> Acesso rápido · demonstração
              </div>
              <div className="grid grid-cols-2 gap-2">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    onClick={() => quickLogin(acc.email)}
                    disabled={loading}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm transition hover:border-brand/50 hover:bg-muted disabled:opacity-50"
                  >
                    <span className="font-medium text-foreground">{acc.label}</span>
                    {acc.role === 'tecnico' && <Badge tone="brand">campo</Badge>}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Senha de demonstração: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{DEMO_PASSWORD}</code>
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
