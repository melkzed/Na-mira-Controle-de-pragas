# Arquitetura — Na Mira · Controle de Pragas

Este documento descreve a arquitetura de software, os fluxos principais, o
modelo de permissões e as decisões técnicas da plataforma.

## 1. Princípios

- **Clean Architecture** — dependências apontam para o domínio; a UI depende de
  abstrações, não de detalhes de infraestrutura.
- **SOLID** — responsabilidades separadas, inversão de dependência entre
  apresentação e fonte de dados.
- **Componentização & Design System** — primitivos reutilizáveis, tokens
  semânticos, tema claro/escuro.
- **Escalabilidade / Multi-tenant** — modelo de dados por `org_id`, pronto para
  Row Level Security no Supabase.
- **Segurança** — RBAC por papel, isolamento do técnico, auditoria (`audit_logs`).

## 2. Camadas

```
┌───────────────────────────────────────────────────────────┐
│ presentation/ (React)                                      │
│   pages/  ← consomem application/ (nunca infra diretamente)│
│   components/ui + layout  ← design system                  │
└───────────────▲───────────────────────────────────────────┘
                │ usa
┌───────────────┴───────────────────────────────────────────┐
│ application/                                               │
│   repository.ts   ← fachada de dados (porta)              │
│   metrics.ts      ← KPIs derivados                        │
│   navigation.ts   ← mapa de navegação + RBAC             │
└───────────────▲───────────────────────────────────────────┘
                │ implementada por
┌───────────────┴───────────────────────────────────────────┐
│ infrastructure/                                           │
│   seed/           ← dataset em memória (atual)           │
│   (supabase/)     ← adaptador futuro (mesma interface)   │
└───────────────▲───────────────────────────────────────────┘
                │ tipos de
┌───────────────┴───────────────────────────────────────────┐
│ domain/  entities (types.ts) + enums.ts  (puros)          │
└───────────────────────────────────────────────────────────┘
```

**Regra de ouro (revisada):** a ideia original era trocar a fonte de dados só em
`application/repository.ts`, mas na prática as telas fazem mutações (`add`/
`update`/`remove`) direto nas stores Zustand de cada módulo (`repository.ts` só
tem leituras tipo `getCustomer(id)`). Migrar um módulo pro Supabase de verdade
significa reescrever a store daquele módulo (ex.: `customersStore.ts`) mantendo
a mesma interface pública — nenhuma página muda, mas o arquivo que muda é a
store, não só o repository. Ver §3.1 para o padrão exato.

## 3. Estado da aplicação

- **Zustand** (`store/appStore.ts`): tema (persistido em `localStorage`), usuário
  atual (para demonstrar RBAC), notificações e paleta de comandos.
- Estado local de tela via `useState`/`useMemo` (filtros, seleção, drawers).

### 3.1 Padrão de store dual-mode (localStorage ↔ Supabase compartilhado)

Migração em andamento, módulo por módulo — dados reais compartilhados entre
usuários da organização (não só o login, que já é real desde a Fase 1). Cada
store convertida segue exatamente o mesmo desenho de `customersStore.ts`
(primeiro módulo migrado — use como referência ao converter o próximo):

1. **Interface pública não muda.** `add`/`update`/`remove` continuam
   **síncronos** (mesma assinatura de sempre) — nenhuma página precisa saber
   se está falando com `localStorage` ou com o Supabase.
2. **Escrita otimista.** A store atualiza o estado local (e a UI) na hora;
   a chamada ao Supabase roda em segundo plano (`.then(...)`, sem `await`
   bloqueando o clique). Se a gravação falhar, desfaz o estado otimista e
   mostra um toast de erro — não trava a interface esperando rede.
3. **Realtime para sincronizar entre usuários.** Um canal
   `supabase.channel('<tabela>-sync').on('postgres_changes', ...)` mantém
   os outros clientes atualizados ao vivo. O merge é idempotente (upsert por
   `id` em INSERT/UPDATE, remove por `id` em DELETE) — o eco da própria
   escrita otimista do usuário não causa duplicata nem pisca.
4. **Mapeamento linha↔domínio explícito.** `toRow()`/`fromRow()` convertem
   entre o formato snake_case do Postgres e o tipo do domínio (camelCase).
   Cada módulo com campos que ainda não existem na tabela precisa de uma
   migration (`db/migrate_<modulo>_*.sql`) antes — ver `docs/DATABASE.md`.
5. **Realtime precisa ser habilitado por tabela** (`alter publication
   supabase_realtime add table ...`) — não é automático só por ter RLS.
6. **`reset()` (se existir) vira no-op no modo Supabase** — não faz sentido
   apagar dado real e compartilhado só porque existe um botão de demo.

Limite conhecido: como o sandbox de desenvolvimento não alcança
`*.supabase.co`, o comportamento em modo Supabase (sincronização entre dois
usuários, Realtime) não é verificável por aqui — só o modo standalone
(regressão) é testado automaticamente a cada módulo migrado. O teste do modo
Supabase precisa acontecer no ambiente publicado, com dois logins reais.

**Exceção deliberada à regra 1 — `serviceOrdersStore.add`:** essa store é a
única cujo `add` é `async` (retorna `Promise<ServiceOrder>`) em vez de
síncrono. Motivo: `OrdensPage.tsx` cria, logo após a OS, registros
dependentes que referenciam `service_orders.id` por FK (`finance_entries`,
e indiretamente `service_orders.appointment_id` via `updateOs`). Com escrita
puramente otimista/fire-and-forget, esses inserts dependentes podiam chegar
ao Postgres antes do INSERT da OS ter sido confirmado, violando a FK (erro
`23503 finance_entries_service_order_id_fkey`, visto em produção). Por isso
`add` só resolve depois que o INSERT remoto é confirmado (no modo Supabase;
no modo standalone resolve na mesma tick, sem mudança de comportamento) —
`OrdensPage.tsx` faz `await add(input)` antes de criar os dependentes. Novas
stores com essa mesma forma (dependente com FK para uma entidade recém-criada
na mesma ação) devem seguir o mesmo padrão em vez de assumir `add` síncrono.

### 3.2 Variante genérica — `createEntityStore` (módulos "chatos")

Os módulos de cadastro simples (sem lógica própria além de CRUD — Usuários,
Departamentos, Produtos, Financeiro, Equipamentos, Veículos, Serviços,
Não-conformidades, Pragas, Áreas tratadas, Tipos de armadilha, Licenças,
Contas a pagar recorrentes, Contas bancárias, Cheques, Empréstimos) não
ganham um `toRow`/`fromRow` manual cada um — em vez disso, `createEntityStore`
(`src/store/createEntityStore.ts`) já nasceu dual-mode e genérico, usando
`src/lib/caseConvert.ts` (camelCase ↔ snake_case automático, só no nível raiz
do objeto — valores aninhados como `jsonb` passam intactos). Isso exige que a
tabela Postgres tenha uma coluna para cada campo do domínio, com o nome em
snake_case equivalente — ver `db/migrate_entitystores_realtime.sql`.
Um módulo com uma regra especial de verdade (numeração automática como
`serviceOrdersStore`, carimbo diário como `appointmentsStore`) continua
ganhando uma store bespoke própria, não a fábrica genérica.

**Convenção de tipo de id — importante:** toda tabela cujo `id` é gerado no
**cliente** (o padrão em 100% das stores deste app, sempre foi assim desde a
Fase 1 — necessário pra escrita otimista funcionar) precisa ter a coluna
`id` como **`text`**, nunca `uuid`. `schema.sql` originalmente definiu essas
tabelas como `uuid primary key default gen_random_uuid()`, pressupondo que o
Postgres geraria o id — mas o app nunca deixa isso pro banco, sempre manda um
id próprio tipo `"c-3f9k2z1"` já na escrita otimista. Isso quebrava (e foi
corrigido em `db/migrate_ids_to_text.sql`) a inserção de qualquer registro
novo em modo Supabase. `organizations.id` e `users.id` são a exceção — vêm de
UUID de verdade (Supabase Auth), então continuam `uuid`. Ao criar uma tabela
nova para um módulo migrado, já nasça com `id text primary key default
gen_random_uuid()::text` — não copie o padrão antigo de `schema.sql` sem
conferir.

### 3.3 Variante singleton — perfil da empresa e configurações

`orgProfileStore` e `settingsStore` não são listas — são **uma linha por
organização** (mapeiam pra `organizations` e `fiscal_settings`). Padrão:
- **Leitura**: `select('*').single()` (ou `.maybeSingle()`) sem filtro
  explícito de `org_id` — a política RLS já restringe a exatamente uma linha
  visível (a do próprio usuário), então não precisa saber o `org_id` de
  antemão só pra ler.
- **Escrita**: aí sim precisa do `org_id` — vem direto de
  `useAppStore.getState().currentUser?.orgId` (é o id real da organização,
  vindo do JWT/claims, não o `'org-namira'` de fallback do modo standalone).
  Se ainda não resolveu (sessão carregando), a escrita local acontece mas a
  remota é pulada silenciosamente — a próxima carga reconcilia; janela de
  corrida desprezível na prática (são telas de configuração, não a primeira
  coisa que carrega).
- **Realtime**: mesmo canal de sempre, mas o merge substitui o estado
  inteiro (não é upsert-por-id numa lista) — e filtra pelo `org_id`/`id` do
  payload pra ignorar eco de outra organização (irrelevante hoje, já que RLS
  não entregaria de qualquer forma, mas documenta a intenção).

### 3.4 Convite de novo funcionário (login real)

Diferente dos módulos de cadastro comuns, "Novo técnico" (`TecnicosPage.tsx`)
não insere em `public.users` direto do navegador quando `supabaseEnabled` —
criar um LOGIN de verdade (não só uma linha de cadastro) exige a Service Role
Key do Supabase, que nunca pode ficar no cliente. O fluxo passa pela Edge
Function `supabase/functions/convidar-tecnico`:

1. O navegador chama `supabase.functions.invoke('convidar-tecnico', {...})`,
   passando o JWT do usuário logado (automático).
2. A função confirma que quem está chamando é `admin`/`supervisor` da própria
   organização (consulta `public.users` pelo `auth_user_id` do token; se não
   achar, tenta pelo e-mail do login e vincula o `auth_user_id` na hora —
   cadastro feito à mão no painel costuma vir sem esse vínculo). Cada recusa
   tem uma mensagem própria dizendo o que fazer, e o cliente a exibe via
   `functionErrorMessage` (`lib/supabaseClient.ts`): `functions.invoke`
   devolve `data: null` em qualquer status fora do 2xx, então sem ler
   `error.context` o usuário só veria "non-2xx status code".
   `db/diagnose_convite_tecnico.sql` confere no banco quem pode convidar.
3. Com a service role, cria o login. **Quem define a senha é o
   administrador**, no próprio formulário: a senha vai no corpo da requisição
   (HTTPS) e a função chama `auth.admin.createUser({ password,
   email_confirm: true })` — o técnico já entra com ela, sem e-mail de
   confirmação no caminho. A senha é guardada só pelo Supabase Auth, que
   salva apenas o hash; nada dela fica no navegador nem em `public.users`.
   Se o corpo **não** trouxer senha, a função cai em
   `auth.admin.inviteUserByEmail` (o Supabase manda um link para a pessoa
   escolher a senha) — é o caminho da importação por planilha, que não tem
   coluna de senha.
   A mesma função atende `action: 'redefinir_senha'` (`userId` + `password`),
   usada quando o administrador troca a senha de um técnico pela tela de
   edição; ela confere que o técnico é da mesma organização antes de chamar
   `auth.admin.updateUserById`.
4. A função já grava a linha em `public.users` com `auth_user_id` vinculado
   ao usuário recém-convidado — não precisa mais do passo manual
   (Authentication → Users + `db/link_admins.sql`) por novo funcionário.

O link do convite aponta para `/definir-senha` (`DefinirSenhaPage.tsx`), que
resolve a sessão a partir da URL (hash `#access_token=...` do fluxo implícito
ou `?code=...` do PKCE — o cliente Supabase deste app usa
`detectSessionInUrl: false`, então essa página é o único lugar que faz esse
parsing manualmente) e chama `supabase.auth.updateUser({ password })`.

Em modo standalone (sem Supabase), o cadastro continua 100% local, como
sempre foi — a Edge Function só existe/roda em modo Supabase. A senha
definida pelo administrador fica em `store/localPasswords.ts` para a
demonstração se comportar como o sistema de verdade; os usuários de exemplo
seguem na senha de demonstração. Essa store **nunca** é usada com Supabase
ligado.

### 3.5 Estoque combinado entre técnicos de uma OS

Quando uma OS tem mais de um técnico (`ServiceOrder.technicianIds`), o
estoque de ambos conta como um só **naquela OS** — um técnico pode levar um
produto/equipamento pro outro usar. Implementado em `CampoPage.tsx`:

- `pooledBalance(technicianIds, productId)` soma o saldo de todos os
  técnicos da OS (via seus locais de estoque, `stockLocations` no seed).
- `AppliedProducts` (tela "Produtos aplicados" no app de campo) mostra
  "Disponível no estoque: N" por produto usando esse saldo combinado — não
  bloqueia usar mais do que isso (pode ter sido um erro de comunicação entre
  o técnico e o almoxarifado), só avisa visualmente.
- Ao salvar/finalizar, `reconcileTechStock` dá baixa primeiro no estoque de
  quem está com o app aberto agora, completa pelo estoque dos outros
  técnicos da OS se faltar, e marca `ServiceOrderProduct.outOfStock = true`
  quando mesmo o total combinado não cobria a quantidade usada — a OS mostra
  esse aviso em `OrdensPage.tsx` (Produtos utilizados).
- Solicitar reposição de produto que falta continua o fluxo já existente
  (`stockRequestsStore` + aprovação do gestor em `/tecnicos`) — o aviso de
  "fora do estoque" é para quando o técnico usa sem ter solicitado antes.

### 3.6 Locais de estoque (cadastro real)

Os locais de estoque (`stock_locations`) são um cadastro dual-mode como os
demais (`useStockLocationsStore`, via a fábrica genérica — §3.2). Antes a
lista vinha só do seed do frontend, o que quebrava na prática: um técnico
convidado pela tela (§3.4) nunca ganhava um local, ficava com saldo zero
para sempre e não tinha onde guardar produto próprio.

`src/store/stockLocations.ts` concentra o acesso:
- `ensureTechnicianStockLocation(techId, nome)` — cria o local se faltar e
  devolve o id. Idempotente. Chamado ao cadastrar/convidar um técnico e
  também ao abrir o app de campo, para regularizar quem foi criado antes
  desta mudança (ou pela Edge Function de convite, que grava direto em
  `public.users` sem passar pelo frontend).
- `technicianStockLocationId(techId)` — usado pela roteirização de estoque em
  campo (`pooledBalance`/`reconcileTechStock`, §3.5).
- `centralStockLocationId()` — o padrão de entradas/compras; substituiu o
  `'loc-central'` fixo que estava espalhado pelo código.

Migration: `db/migrate_stock_locations_cadastro.sql` (habilita Realtime e
cria de uma vez os locais que faltam para os técnicos já cadastrados).

### 3.7 Importação por planilha (todos os módulos)

Todo módulo de cadastro aceita importação em massa por planilha, com a mesma
tela e o mesmo fluxo: escolher o arquivo → conferir/corrigir o que o sistema
entendeu → confirmar. Nada é gravado antes da confirmação.

Três camadas, para acrescentar um módulo sem escrever tela:

- `lib/importSheet.ts` — abre o arquivo, **sem dependência externa**.
  Detecta o formato pelo conteúdo, não pela extensão: tabela HTML salva como
  `.xls` (o que a maioria dos sistemas do setor exporta), CSV/TSV, e XML —
  tanto o "XML Planilha 2003" do Excel (SpreadsheetML, respeitando `ss:Index`)
  quanto XML genérico de sistema (registro = elemento repetido, campo =
  filho). `.xlsx` de verdade (ZIP) não é lido; a tela orienta salvar como CSV
  ou XML. Texto é lido em UTF-8 com fallback para ISO-8859-1.
- `lib/importModules.ts` — o que muda de módulo para módulo (`ImportSpec`):
  nomes de coluna aceitos por campo (comparação sem acento/caixa e sem
  depender da ordem das colunas), campos obrigatórios, campo usado para
  detectar registro já cadastrado, e como a linha vira entidade
  (`create`/`patch`). É também a fonte da planilha modelo para download.
- `components/ImportDrawer.tsx` — a tela, genérica sobre a `ImportSpec`. A
  página passa a store (`items`/`add`/`update`); `add` pode ser assíncrono
  (Técnicos importa passando pelo convite da §3.4, que manda o e-mail de
  senha para cada pessoa).

Colunas desconhecidas são listadas como ignoradas em vez de derrubar a
importação. Linhas que casam com um registro existente aparecem como
"Atualiza" e podem ser deixadas de fora com um checkbox; em Financeiro, onde
o mesmo lançamento se repete todo mês, o drawer roda em `createOnly`.

## 4. Fluxos principais

### 4.1 Do agendamento à Ordem de Serviço

```
Lead (CRM) ─► Cliente ─► Agendamento ─► (confirmação) ─► Rota do técnico
   ─► Check-in ─► Checklist pré ─► Em atendimento ─► Consumo de estoque
   ─► Finalização + assinaturas ─► Ordem de Serviço ─► PDF + NFS-e
   ─► Lançamento financeiro (receita) ─► Relatórios
```

### 4.2 Estoque em dois níveis

```
Estoque Central ──(transferência: registra produto, qtd, data, responsável)──►
Estoque do Técnico ──(consumo ao finalizar OS: baixa automática)──► Histórico
```

Todo movimento gera uma linha em `stock_movements` (livro-razão auditável); os
saldos em `stock_balances` são a projeção. O gestor vê, por técnico: quanto
recebeu, quanto usou, quanto resta e quando repor.

### 4.3 Notificações

Eventos de domínio (nova OS, estoque baixo, licença vencendo, pagamento recebido,
reagendamento) geram `notifications` para gestor / técnico / cliente, com canais
`sistema`, `email`, `whatsapp`, `push`.

## 5. Permissões (RBAC)

| Módulo | Admin | Supervisor | Financeiro | Atendimento | Estoque | Técnico |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Agenda / Ordens | ✅ | ✅ | — | ✅ | — | — |
| Clientes / CRM | ✅ | ✅ | ✅¹ | ✅ | — | — |
| Estoque / Produtos | ✅ | ✅ | — | — | ✅ | — |
| Financeiro / Fiscal | ✅ | — | ✅ | — | — | — |
| Relatórios | ✅ | ✅ | ✅ | — | — | — |
| App do Técnico | ✅ | ✅ | — | — | — | ✅ |

¹ Financeiro vê clientes apenas para conciliação.

O **Técnico** é isolado: só acessa o App do Técnico, sem dados administrativos,
financeiros ou de outros técnicos. Implementado em `application/navigation.ts`
(`navForRole`) e refletido no banco por `permissions` / `role_permissions` /
`user_permissions`.

## 6. Design System

- **Tokens** em `src/index.css` como CSS variables RGB, consumidos pelo
  `tailwind.config.ts` via `rgb(var(--token) / <alpha>)` → tema claro/escuro sem
  duplicar classes.
- **Primitivos** em `presentation/components/ui`: `Card`, `Button`, `Badge`,
  `Avatar`, `Table`, `Drawer`, `Field`/`Input`/`Select`, `Segmented`, `Progress`,
  `Skeleton`, `AnimatedNumber`, `Icon`.
- **Animações** (Framer Motion): transição de rota, stagger de listas, contadores,
  layout animations (nav ativo, segmented), hover elevado, skeleton shimmer.
  Respeita `prefers-reduced-motion`.

## 7. Performance

- Memoização de métricas derivadas (`useMemo`).
- Tabela e listas virtualizáveis quando o volume crescer (ponto de extensão).
- Build Vite com tree-shaking; recomendação de code-splitting por rota ao
  integrar o backend (charts e mapas em chunks separados).

## 8. Decisões técnicas

| Decisão | Motivo |
| --- | --- |
| Vite + React em vez de Next.js | App interno/SaaS autenticado; SSR não é requisito e reduz atrito de build/deploy. |
| Seed em memória como fonte inicial | Permite rodar e avaliar todo o produto sem provisionar backend. |
| Fachada `repository.ts` | Inversão de dependência: Supabase entra sem tocar nas telas. |
| PostgreSQL/Supabase como alvo | Multi-tenant com RLS, Auth e Storage integrados. |
| Tailwind + tokens | Consistência visual, tema, velocidade de iteração. |
