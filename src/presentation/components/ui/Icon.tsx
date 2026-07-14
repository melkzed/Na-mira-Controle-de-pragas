import { icons, type LucideProps } from 'lucide-react';

/** Renderiza um ícone lucide pelo nome (string), com fallback seguro. */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = icons[name as keyof typeof icons] ?? icons.Circle;
  return <Cmp {...props} />;
}
