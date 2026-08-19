import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getSessionUser, landingPathFor } from '@/application/auth';
import { useAppStore } from '@/store/appStore';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { LogoMark } from '../components/ui/Logo';

/**
 * Landing page do link de convite/recuperação de senha do Supabase Auth
 * (redirectTo da função convidar-tecnico e de "esqueci minha senha").
 *
 * O cliente Supabase deste app é criado com `detectSessionInUrl: false`
 * (ver src/lib/supabaseClient.ts) — então essa página trata a URL na mão:
 * o link chega como `#access_token=...&refresh_token=...&type=invite`
 * (fluxo implícito) ou `?code=...` (PKCE), dependendo da configuração do
 * projeto. Cobre os dois formatos.
 */
export function DefinirSenhaPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'resolving' | 'ready' | 'invalid'>('resolving');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!supabase) { setStatus('invalid'); return; }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const query = new URLSearchParams(window.location.search);
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      const code = query.get('code');

      if (accessToken && refreshToken) {
        const { error: setErr } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        setStatus(setErr ? 'invalid' : 'ready');
      } else if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        setStatus(exErr ? 'invalid' : 'ready');
      } else {
        // Sem token na URL — talvez a sessão já tenha sido resolvida antes
        // (ex.: usuário atualizou a página); confirma se já está logado.
        const { data } = await supabase.auth.getSession();
        setStatus(data.session ? 'ready' : 'invalid');
      }
    })();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    if (!supabase) return;

    setSaving(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setSaving(false);
      setError('Não foi possível definir a senha. Tente abrir o link do e-mail novamente.');
      return;
    }
    const user = await getSessionUser();
    setSaving(false);
    if (user) {
      useAppStore.setState({ currentUser: user });
      navigate(landingPathFor(user), { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex items-center gap-2.5">
          <LogoMark size={34} className="shrink-0 text-brand" />
          <div className="leading-tight">
            <p className="font-bold text-foreground">Gestão</p>
            <p className="-mt-0.5 font-bold text-foreground">Dedetizadora</p>
          </div>
        </div>

        {status === 'resolving' && (
          <p className="text-sm text-muted-foreground">Verificando o link…</p>
        )}

        {status === 'invalid' && (
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Link inválido ou expirado</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Peça para o administrador enviar um novo convite, ou tente entrar normalmente se já tiver uma senha definida.
            </p>
            <Button className="mt-6" onClick={() => navigate('/login')}>Ir para o login</Button>
          </div>
        )}

        {status === 'ready' && (
          <>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Defina sua senha</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha a senha que vai usar daqui pra frente para entrar no sistema.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Nova senha" required>
                <div className="relative">
                  <Input
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
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

              <Field label="Confirmar senha" required>
                <Input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
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

              <Button type="submit" size="lg" className="w-full" disabled={saving} leftIcon={<KeyRound size={16} />}>
                {saving ? 'Salvando…' : 'Definir senha e entrar'}
              </Button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
