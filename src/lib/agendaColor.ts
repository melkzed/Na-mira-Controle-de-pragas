/**
 * Cores da agenda.
 *
 * Cada técnico escolhe uma cor no próprio cadastro e é ela que pinta os
 * atendimentos na agenda — bater o olho e saber de quem é o dia. Atendimento
 * finalizado foge dessa regra: sai sempre no mesmo verde, independentemente
 * de quem executou, porque aí o que importa é que está concluído.
 */
import type { Appointment, User } from '@/domain/types';

/** Verde único de "concluído" — o mesmo do tom `success` do tema. */
export const COR_CONCLUIDO = '#16a34a';

/** Paleta oferecida no cadastro: tons bem distintos entre si, legíveis em
 *  fundo claro e escuro, e nenhum deles verde (que é reservado ao concluído). */
export const CORES_TECNICO: { value: string; label: string }[] = [
  { value: '#2563eb', label: 'Azul' },
  { value: '#7c3aed', label: 'Roxo' },
  { value: '#db2777', label: 'Rosa' },
  { value: '#dc2626', label: 'Vermelho' },
  { value: '#ea580c', label: 'Laranja' },
  { value: '#ca8a04', label: 'Mostarda' },
  { value: '#0d9488', label: 'Turquesa' },
  { value: '#0891b2', label: 'Ciano' },
  { value: '#4f46e5', label: 'Índigo' },
  { value: '#9333ea', label: 'Violeta' },
  { value: '#be123c', label: 'Carmim' },
  { value: '#57534e', label: 'Grafite' },
];

/**
 * Cor de um técnico. Sem cor escolhida, deriva uma da paleta a partir da id —
 * assim dois técnicos sem configuração ainda saem diferentes na agenda, em vez
 * de virarem um bloco só de cinza.
 */
export function technicianColor(user?: Pick<User, 'id' | 'color'>): string {
  if (user?.color) return user.color;
  if (!user?.id) return CORES_TECNICO[0].value;
  let soma = 0;
  for (let i = 0; i < user.id.length; i += 1) soma += user.id.charCodeAt(i);
  return CORES_TECNICO[soma % CORES_TECNICO.length].value;
}

/** Cor de um atendimento na agenda: verde quando concluído, senão a do técnico. */
export function appointmentColor(
  appt: Pick<Appointment, 'status' | 'technicianId'>,
  buscarUsuario: (id: string) => Pick<User, 'id' | 'color'> | undefined,
): string {
  if (appt.status === 'finalizado') return COR_CONCLUIDO;
  return technicianColor(appt.technicianId ? buscarUsuario(appt.technicianId) : undefined);
}
