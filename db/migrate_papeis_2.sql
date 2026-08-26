-- ============================================================================
-- Na Mira · Controle de Pragas — papéis, PARTE 2 de 2
--
-- Pré-requisito: db/migrate_papeis_1.sql já executado e concluído.
-- Se der "unsafe use of new value", a parte 1 não foi rodada ainda (ou foi
-- enviada junto com esta) — rode a parte 1 sozinha primeiro.
--
-- ANTES:  admin | supervisor | financeiro | atendimento | estoque | tecnico
-- DEPOIS: admin | funcionario | tecnico | cliente
--
-- Motivo: supervisor/financeiro/atendimento/estoque não abriam nem fechavam
-- nenhuma tela por si — quem decide isso é o SETOR (departments.modules).
-- Serviam só de padrão de reserva e duplicavam a configuração.
--
-- Agora: o papel diz por qual porta a pessoa entra; o setor diz quais telas
-- ela abre depois. Funcionário sem setor enxerga apenas o Dashboard.
-- Idempotente: pode rodar de novo sem efeito colateral.
-- ============================================================================

-- 1) Converte todo mundo que tinha papel intermediário em 'funcionario'.
--    Ninguém perde acesso aqui: quem já tem setor continua com os módulos do
--    setor; quem não tem cai no Dashboard e aparece na conferência do passo 4.
update public.users
   set role = 'funcionario'
 where role::text in ('supervisor', 'financeiro', 'atendimento', 'estoque');

-- 2) Novo padrão da coluna, para cadastros criados fora do app.
alter table public.users alter column role set default 'funcionario';

-- 3) Rede de segurança: quem virou funcionário e ficou sem setor recebe o
--    setor "Administrativo" da própria organização, se ele existir.
update public.users u
   set department_id = d.id
  from public.departments d
 where u.department_id is null
   and u.role::text = 'funcionario'
   and d.org_id = u.org_id
   and lower(d.name) in ('administrativo', 'adm');

-- 4) CONFERÊNCIA — funcionários que ficaram sem setor.
--    Cada um destes enxerga só o Dashboard até você atribuir um setor em
--    Configurações → Departamento (a tela marca esses casos com um aviso).
select u.name, u.email, u.role, coalesce(d.name, '— SEM SETOR —') as setor
  from public.users u
  left join public.departments d on d.id = u.department_id
 where u.role::text = 'funcionario'
 order by (u.department_id is null) desc, u.name;

-- 5) Confere que não sobrou nenhum papel antigo.
select role, count(*) from public.users group by role order by role;

notify pgrst, 'reload schema';

-- ============================================================================
-- Observações
-- ----------------------------------------------------------------------------
-- · Os valores antigos continuam existindo no tipo `user_role` — o PostgreSQL
--   não remove valor de enum. Ficam órfãos e sem uso; removê-los exigiria
--   recriar o tipo e todas as dependências, o que não compensa.
--
-- · Quem pode cadastrar funcionários deixou de ser um papel fixo. Agora é o
--   administrador e qualquer funcionário cujo SETOR tenha o módulo
--   "configuracoes" marcado — a checagem roda no servidor, na Edge Function
--   `convidar-tecnico`, que precisa ser republicada:
--       npx supabase functions deploy convidar-tecnico --project-ref SEU_REF
--
-- · Para dar esse poder a alguém sem torná-lo administrador, marque
--   "Configurações" no setor dele em Configurações → Departamento.
-- ============================================================================
