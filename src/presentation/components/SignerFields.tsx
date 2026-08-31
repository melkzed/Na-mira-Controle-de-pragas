/**
 * Identificação de quem assinou o atendimento.
 *
 * O contrato está no nome de uma empresa ou de um titular que quase nunca é
 * quem abre a porta: quem acompanha o serviço e assina costuma ser zelador,
 * síndico, encarregado ou funcionário do local. Herdar o nome do cadastro do
 * cliente falsifica o documento — por isso o nome e a identificação são
 * digitados na hora, ao lado da assinatura.
 */
import { CreditCard, UserRound } from 'lucide-react';
import type { SignerDocType, SignerInfo } from '@/domain/types';
import { SIGNER_DOC_TYPES, signerDocumentLabel } from '@/lib/signer';
import { Field, Input } from './ui/Field';
import { Segmented } from './ui/Segmented';

export function SignerFields({
  value,
  onChange,
  disabled,
  /** Nome do cliente do cadastro — só como referência visual; não preenche
   *  o campo sozinho, porque o titular raramente é quem assina. */
  customerName,
}: {
  value: SignerInfo;
  onChange: (next: SignerInfo) => void;
  disabled?: boolean;
  customerName?: string;
}) {
  const tipo: SignerDocType = value.signerDocType ?? 'cpf';
  const set = (patch: Partial<SignerInfo>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-2.5">
      <Field label="Quem acompanhou o serviço" required>
        <div className="relative">
          <UserRound size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={value.signerName ?? ''}
            disabled={disabled}
            onChange={(e) => set({ signerName: e.target.value })}
            placeholder="Nome completo de quem assina"
          />
        </div>
      </Field>

      <div>
        <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          Identificação <span className="text-danger">*</span>
        </span>
        <Segmented
          size="sm"
          value={tipo}
          onChange={(v) => set({ signerDocType: v })}
          options={SIGNER_DOC_TYPES}
        />
        <div className="relative mt-2">
          <CreditCard size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={value.signerDocument ?? ''}
            disabled={disabled}
            inputMode={tipo === 'cpf' ? 'numeric' : 'text'}
            onChange={(e) => set({ signerDocument: e.target.value, signerDocType: tipo })}
            placeholder={tipo === 'cpf' ? 'Somente números' : tipo === 'rg' ? 'Número do RG' : 'Número da matrícula'}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {customerName
          ? `O serviço está no nome de ${customerName}. Registre aqui quem realmente acompanhou e assinou.`
          : 'Registre quem realmente acompanhou e assinou o atendimento.'}
      </p>
    </div>
  );
}

/** Linha de leitura de quem assinou — para telas que só exibem. */
export function SignerSummary({ info }: { info: SignerInfo }) {
  if (!info.signerName?.trim()) return null;
  const doc = signerDocumentLabel(info);
  return (
    <p className="text-xs text-muted-foreground">
      Assinado por <span className="font-medium text-foreground">{info.signerName}</span>
      {doc ? ` · ${doc}` : ''}
    </p>
  );
}
