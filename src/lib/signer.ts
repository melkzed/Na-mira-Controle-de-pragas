/**
 * Identificação de quem assinou o atendimento.
 *
 * O serviço costuma estar no nome de uma empresa ou de um titular que não
 * estava no local — quem acompanha e assina é zelador, síndico, encarregado.
 * Rotular a assinatura com o nome do cadastro atribuiria o aceite a quem não
 * assinou, então esses dados são colhidos em campo e viajam com a assinatura.
 */
import type { SignerDocType, SignerInfo } from '@/domain/types';
import { formatDocument } from './utils';

export const SIGNER_DOC_TYPES: { value: SignerDocType; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'rg', label: 'RG' },
  { value: 'matricula', label: 'Matrícula' },
];

export function signerDocTypeLabel(type?: SignerDocType): string {
  return SIGNER_DOC_TYPES.find((t) => t.value === type)?.label ?? 'Identificação';
}

/** CPF ganha máscara; RG e matrícula variam demais entre estados e empresas
 *  para serem formatados — ficam como foram digitados. */
export function signerDocumentLabel(info: SignerInfo): string {
  const doc = info.signerDocument?.trim();
  if (!doc) return '';
  const valor = info.signerDocType === 'cpf' ? formatDocument(doc) : doc;
  return `${signerDocTypeLabel(info.signerDocType)}: ${valor}`;
}

/** O que ainda falta para a assinatura valer como registro; `undefined` quando
 *  está tudo preenchido. */
export function signerMissing(info: SignerInfo): string | undefined {
  if (!info.signerName?.trim()) return 'Informe o nome de quem acompanhou o serviço.';
  if (!info.signerDocument?.trim()) return `Informe a ${signerDocTypeLabel(info.signerDocType).toLowerCase()} de quem assinou.`;
  return undefined;
}
