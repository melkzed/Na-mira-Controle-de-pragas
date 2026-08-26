# Migrations pendentes — ordem de aplicação

Rode no **SQL Editor do Supabase**, na ordem abaixo. Todos os scripts são
idempotentes: rodar de novo não duplica nada nem quebra o que já existe.

Depois de cada um, o script já emite `notify pgrst, 'reload schema'` — não
precisa reiniciar nada.

| # | Arquivo | O que faz |
|---|---|---|
| 1 | `db/migrate_feedback_cliente.sql` | Produtos (grupo químico, antídoto, tratamento, diluente, exibição no laudo), cômodos e estrutura do cliente, contas recorrentes com duração, tipo de tributo, textos dos documentos |
| 2 | `db/migrate_stock_locations_cadastro.sql` | Locais de estoque viram cadastro real e cria os que faltam para técnicos já cadastrados |
| 3 | `db/storage_atendimentos.sql` | Bucket `atendimentos` para as fotos do atendimento |
| 4 | `db/migrate_campo_verificacao.sql` | Assinatura do cliente e verificação do local na visita; acesso ao Portal do Cliente; pedido de reagendamento; áreas específicas da OS; coordenadas das armadilhas; campos novos de `users` |
| 5 | `db/migrate_papeis.sql` | **Consolidação dos papéis** — admin / funcionário / técnico / cliente. ⚠️ Rode em duas etapas, conforme as marcações dentro do arquivo |

## Depois das migrations

Republique a Edge Function — sem isso, o cadastro de funcionários continua
usando a autorização antiga (papel `supervisor`, que deixou de existir):

```bash
npx supabase functions deploy convidar-tecnico --project-ref SEU_PROJECT_REF
```

## Conferências rápidas

```sql
-- Quem pode entrar e com que papel
select role, count(*) from public.users group by role order by role;

-- Funcionários sem setor (enxergam só o Dashboard)
select u.name, u.email from public.users u
 where u.role = 'funcionario' and u.department_id is null;

-- Quem pode cadastrar funcionários (admin + setor com "configuracoes")
select u.name, u.email, u.role, d.name as setor
  from public.users u
  left join public.departments d on d.id = u.department_id
 where u.role = 'admin'
    or (u.role = 'funcionario' and d.modules ? 'configuracoes');
```

Se alguém não conseguir cadastrar técnico, `db/diagnose_convite_tecnico.sql`
diz o motivo exato de cada login.
