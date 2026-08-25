/**
 * Importação por planilha — tela única, usada por todos os módulos.
 *
 * O que muda de um módulo para outro está em `lib/importModules.ts`
 * (`ImportSpec`): nomes de coluna aceitos, campo obrigatório, como a linha
 * vira registro. Aqui fica só o fluxo, que é sempre o mesmo: escolher o
 * arquivo → conferir e corrigir o que o sistema entendeu → confirmar.
 * Nada é gravado antes da confirmação.
 */
import { useEffect, useState } from 'react';
import { Check, Download, Trash2, Upload } from 'lucide-react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Drawer } from './ui/Drawer';
import { parseSheet, readSheetFile } from '@/lib/importSheet';
import {
  existingIndex, importTemplateCsv, matchOf, previewImport,
  type ImportPreview, type ImportSpec,
} from '@/lib/importModules';
import { downloadTextFile } from '@/lib/export';
import { uid } from '@/store/createEntityStore';
import { currentOrgId } from '@/store/appStore';
import { toast } from '@/store/toastStore';

interface ImportDrawerProps<T extends { id: string }> {
  open: boolean;
  onClose: () => void;
  spec: ImportSpec<T>;
  /** Registros já cadastrados — usados para marcar o que a planilha atualiza. */
  items: T[];
  /** Grava um registro novo. Pode ser assíncrono (ex.: convite do técnico);
   *  lançar erro conta a linha como não importada. O retorno é ignorado. */
  add: (entity: T) => unknown;
  update: (id: string, patch: Partial<T>) => void;
  /** Módulos em que atualizar não faz sentido (financeiro): tudo vira novo. */
  createOnly?: boolean;
}

export function ImportDrawer<T extends { id: string }>({
  open, onClose, spec, items, add, update, createOnly,
}: ImportDrawerProps<T>) {
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setFileName(''); setPreview(null); setError(null); setUpdateExisting(true); setSaving(false); }
  }, [open]);

  const requiredLabels = spec.requiredFields
    .map((key) => spec.fields.find((f) => f.key === key)?.label ?? key);

  const pick = async (file: File) => {
    setError(null); setPreview(null); setFileName(file.name);
    try {
      const sheet = parseSheet(await readSheetFile(file));
      if (!sheet || !sheet.rows.length) {
        setError('Não foi possível ler a planilha. Se for um .xlsx do Excel, salve como CSV ou "XML Planilha 2003" e tente de novo.');
        return;
      }
      const p = previewImport(sheet, spec, createOnly ? [] : items);
      const faltando = spec.requiredFields.filter((key) => !p.mappedFields.some((f) => f.key === key));
      if (faltando.length) {
        const nomes = faltando.map((key) => `"${spec.fields.find((f) => f.key === key)?.label ?? key}"`).join(' e ');
        setError(`A planilha precisa ter ${faltando.length > 1 ? 'as colunas' : 'uma coluna'} ${nomes}. Baixe o modelo abaixo para ver o formato esperado.`);
        return;
      }
      setPreview(p);
    } catch {
      setError('Falha ao ler o arquivo. Verifique se é uma planilha (.xls exportado, .csv ou .xml) e tente novamente.');
    }
  };

  /** Corrige um valor lido da planilha antes de gravar. Mexer no campo de
   *  comparação refaz a checagem de duplicado — o registro casado passa a ser
   *  outro (ou nenhum). */
  const editCell = (rowIdx: number, key: string, value: string) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const byKey = createOnly ? new Map<string, string>() : existingIndex(spec, items);
      const rows = prev.rows.map((r, i) => {
        if (i !== rowIdx) return r;
        const values = { ...r.values, [key]: value };
        if (key !== spec.matchField) return { ...r, values };
        return { ...r, values, existingId: matchOf(values, spec, byKey) };
      });
      return { ...prev, rows };
    });
  };

  const removeRow = (rowIdx: number) =>
    setPreview((prev) => (prev ? { ...prev, rows: prev.rows.filter((_, i) => i !== rowIdx) } : prev));

  const downloadTemplate = () => downloadTextFile(`modelo-${spec.key}.csv`, importTemplateCsv(spec));

  // Linhas sem o campo obrigatório (apagado na edição) não podem ser gravadas.
  const validRows = preview?.rows.filter((r) => spec.requiredFields.every((f) => (r.values[f] ?? '').trim())) ?? [];
  const novos = validRows.filter((r) => !r.existingId).length;
  const existentes = validRows.filter((r) => r.existingId).length;
  const totalGravar = novos + (updateExisting ? existentes : 0);

  const confirm = async () => {
    if (!preview || saving) return;
    setSaving(true);
    let criados = 0;
    let atualizados = 0;
    let falhas = 0;
    for (const r of validRows) {
      if (r.existingId) {
        if (!updateExisting) continue;
        update(r.existingId, spec.patch(r.values));
        atualizados += 1;
        continue;
      }
      try {
        await add(spec.create(r.values, { id: uid(spec.key.slice(0, 4)), orgId: currentOrgId() }));
        criados += 1;
      } catch {
        falhas += 1;
      }
    }
    setSaving(false);
    const partes = [`${criados} ${criados === 1 ? spec.entity : spec.entityPlural} criado(s)`];
    if (atualizados) partes.push(`${atualizados} atualizado(s)`);
    if (falhas) partes.push(`${falhas} com erro`);
    toast(`Importação concluída: ${partes.join(', ')}.`, { tone: falhas ? 'warning' : 'success' });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={spec.title}
      subtitle="Confira o que será importado antes de confirmar"
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {preview ? `${totalGravar} registro(s) serão gravados` : 'Selecione um arquivo para começar'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={confirm} disabled={!preview || totalGravar === 0 || saving} leftIcon={<Check size={15} />}>
              {saving ? 'Importando…' : 'Importar'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-center transition hover:border-brand/50 hover:bg-brand-soft/20">
          <Upload size={22} className="text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{fileName || 'Escolher planilha'}</span>
          <span className="text-xs text-muted-foreground">Planilha exportada (.xls), .xml, .csv ou .txt — colunas em qualquer ordem</span>
          <span className="text-[11px] text-muted-foreground/80">Obrigatório: {requiredLabels.join(', ')}</span>
          <input
            type="file"
            accept=".xls,.xlsx,.xml,.csv,.txt,.html,text/csv,text/xml,application/xml,text/html,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }}
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">
            Não tem uma planilha pronta? Baixe o modelo, preencha e importe aqui.
          </p>
          <Button variant="outline" size="sm" leftIcon={<Download size={14} />} onClick={downloadTemplate}>Baixar planilha modelo</Button>
        </div>

        {spec.note && (
          <p className="rounded-xl border border-info/30 bg-info-soft/40 p-3 text-xs text-foreground">{spec.note}</p>
        )}

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft/30 p-3 text-sm text-danger">{error}</div>}

        {preview && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Info label={`Novos ${spec.entityPlural}`} value={String(novos)} />
              <Info label="Já cadastrados" value={String(existentes)} />
              <Info label="Linhas ignoradas" value={String(preview.skipped)} />
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
              <p className="text-foreground"><span className="font-semibold">Colunas reconhecidas:</span> {preview.mappedFields.map((f) => f.label).join(', ')}</p>
              {preview.ignoredHeaders.length > 0 && (
                <p className="mt-1 text-muted-foreground"><span className="font-semibold">Ignoradas:</span> {preview.ignoredHeaders.join(', ')}</p>
              )}
            </div>

            {existentes > 0 && (
              <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border" />
                <span>
                  <span className="block text-sm font-medium text-foreground">Atualizar registros já cadastrados</span>
                  <span className="block text-xs text-muted-foreground">{existentes} da planilha já existem no sistema. Desmarque para importar somente os novos.</span>
                </span>
              </label>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Pré-visualização</p>
                <p className="text-xs text-muted-foreground">Clique em qualquer campo para corrigir antes de importar.</p>
              </div>
              <div className="max-h-80 overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Situação</th>
                      {preview.mappedFields.map((f) => <th key={f.key} className="px-2 py-1.5 text-left font-semibold text-muted-foreground">{f.label}</th>)}
                      <th className="w-8 px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="px-2 py-1.5">
                          <Badge tone={r.existingId ? 'warning' : 'success'} className="text-[10px]">{r.existingId ? 'Atualiza' : 'Novo'}</Badge>
                        </td>
                        {preview.mappedFields.map((f) => (
                          <td key={f.key} className="px-1 py-1">
                            <input
                              value={r.values[f.key] ?? ''}
                              onChange={(e) => editCell(i, f.key, e.target.value)}
                              aria-label={`${f.label} da linha ${i + 1}`}
                              className="w-full min-w-24 rounded border border-transparent bg-transparent px-1.5 py-1 text-foreground transition hover:border-border focus:border-brand focus:bg-surface focus:outline-none"
                            />
                          </td>
                        ))}
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            aria-label={`Remover a linha ${i + 1} da importação`}
                            title="Não importar esta linha"
                            className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-danger"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Nenhuma linha restante — escolha outra planilha.</p>
              )}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/40 p-2.5"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p></div>;
}
