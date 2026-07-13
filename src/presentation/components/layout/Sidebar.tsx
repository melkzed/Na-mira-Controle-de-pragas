import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { navForRole } from '@/application/navigation';
import { Icon } from '../ui/Icon';
import { cn } from '@/lib/utils';
import { ROLE_META } from '@/domain/enums';
import { Avatar } from '../ui/Avatar';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAppStore((s) => s.currentUser);
  const items = navForRole(user.role);

  const groups = items.reduce<Record<string, typeof items>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Marca */}
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-glow">
          <Icon name="ShieldCheck" size={20} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-foreground">Na Mira</p>
          <p className="text-[11px] text-muted-foreground">Controle de Pragas</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {Object.entries(groups).map(([group, groupItems]) => (
          <div key={group}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group}
            </p>
            <div className="space-y-0.5">
              {groupItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'text-brand'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-lg bg-brand-soft"
                          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                        />
                      )}
                      <Icon name={item.icon} size={18} className="relative z-10 shrink-0" />
                      <span className="relative z-10">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Usuário */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {ROLE_META[user.role].label}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
