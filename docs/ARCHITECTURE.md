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

### 3.8 Portal do Cliente e o papel `cliente`

O cliente da empresa tem acesso próprio (`/portal`), isolado do sistema
administrativo e do app de campo.

**Quem é o cliente.** Ele não é uma linha de `users` — é um `Customer`. Para o
resto do app (rotas, guardas, cabeçalho) enxergar sempre a mesma coisa,
`application/auth.ts` monta um `User` sintético de papel `cliente` apontando
para o cadastro em `customerId`. É por esse campo que todo o Portal filtra.

**Login.** CPF/CNPJ do cadastro + senha definida pelo administrador (Clientes →
Acesso do cliente). O campo da tela de login aceita e-mail *ou* documento; o
que separa os dois é `looksLikeDocument` (`lib/password.ts`). A senha nunca é
guardada nem relida em texto: fica só o hash SHA-256 com sal por cliente, então
a tela só oferece **redefinir**. Quando o Portal passar pelo Supabase Auth, a
conferência sai de `lib/password.ts` e vai para o Auth — é o único ponto a
trocar.

**Isolamento.** Três camadas, todas necessárias:
1. `RequireAuth` — `requireStaff` manda cliente para `/portal`; `requireCliente`
   impede que usuário interno entre lá. Vale também para URL digitada à mão.
2. `application/permissions.ts` — `modulesForUser` devolve `[]` e
   `hasModuleAccess` devolve `false` para o papel `cliente`: nenhum módulo
   administrativo existe para ele, nem no menu nem na rota.
3. `pages/portal/portalData.ts` — todo dado do Portal passa por um recorte só,
   pelo `customerId` do usuário logado. É esse recorte que a RLS do Supabase
   vai reforçar no servidor; enquanto isso, ele é a fronteira.

**O que o cliente vê.** Painel (próximos atendimentos, último serviço, contrato,
validade do certificado, pendências), agendamentos (com confirmação e pedido de
remarcação, que viram notificação para a equipe e entrada no histórico de
alterações), histórico de serviços, documentos (OS/Certificado/Laudo abertos
dentro do sistema), pagamentos e armadilhas. O financeiro do cliente mostra
**só receitas dele** (`financeEntriesForCustomer`) — custo interno, margem,
comissão e contas a pagar da empresa nunca chegam ali.

**Permissões da equipe interna.** Continuam em duas camadas (§3.2 do RBAC):
departamento define o padrão, exceções por usuário ajustam caso a caso. A elas
soma-se `hideFinancialValues` (`canSeeFinancialValues`), para quem precisa
abrir a OS sem ver quanto foi cobrado — acesso por módulo é tudo-ou-nada por
tela, e esse caso não cabia nele. Administrador nunca é afetado.

Migration: `db/migrate_campo_verificacao.sql` (colunas de acesso do cliente,
pedido de reagendamento, áreas específicas da OS, coordenadas das armadilhas e
os dois campos novos de `users`).

### 3.9 Quem assinou o atendimento

A assinatura colhida em campo precisa dizer **quem assinou**, não a quem o
serviço foi vendido. O contrato costuma estar no nome de uma pessoa jurídica
ou de um titular que não estava no local; quem acompanha o técnico e assina é
zelador, síndico, encarregado, funcionário do local. Rotular a assinatura com o
nome do cadastro atribuiria o aceite a alguém que não estava lá — num documento
técnico isso é informação errada, não um detalhe de exibição.

Por isso `SignerInfo` (`signerName`, `signerDocType`, `signerDocument`) é
digitada junto da assinatura e viaja com ela: fica no `Appointment` (onde é
colhida) e é copiada para a `ServiceOrder` (que vira PDF). `signerDocType` é
`cpf | rg | matricula` — CPF é o caso comum e vem pré-selecionado, mas
condomínio e indústria identificam quem recebe por matrícula funcional.

- Componente: `presentation/components/SignerFields.tsx` (formulário) e
  `lib/signer.ts` (rótulos e validação — fica em `lib` porque a impressão,
  que não é React, também precisa deles).
- `signerMissing()` bloqueia o salvamento **só quando existe assinatura**:
  assinatura sem identificação não prova nada, mas cobrar o cadastro de quem
  ainda nem assinou trava o técnico à toa.
- Os dois pontos de captura usam o mesmo componente: o menu Gerenciar
  (`field/VisitActions.tsx` → `AssinaturasDrawer`) e a confirmação de
  "Finalizar atendimento" (`CampoPage`).
- Na impressão (`printDocuments.ts` → `clientTechSignatures`), quando há
  `signerName` a linha passa a mostrar esse nome, a identificação apresentada e
  o rótulo "Recebido por — <cliente>"; sem ele, cai no titular do cadastro
  como antes.

Migration: `db/migrate_campo_verificacao.sql` (`signer_name`, `signer_doc_type`,
`signer_document` em `appointments` e `service_orders`). `appointmentsStore` faz
o mapeamento explícito de colunas, então os três campos foram adicionados a
`AppointmentRow`/`fromRow`/`toRow`; `serviceOrdersStore` usa `toSnakeRow` e não
precisou de mudança.

### 3.9.1 Portal do Cliente com RLS: o cliente é um usuário de Auth

O Portal nasceu com um usuário **sintético**: o cliente entrava com CPF/CNPJ +
senha, e o app montava um `User` de papel `cliente` só na memória do navegador.
Funciona sem backend, mas com Supabase quebra dos dois lados:

- **Com RLS ligado**, o cliente não tem JWT. `auth_org_id()` é nulo, toda
  política nega, e o Portal fica vazio.
- **Com RLS desligado**, para "funcionar", a chave anônima — que vai no bundle,
  à vista de qualquer um — passa a ler a tabela de clientes inteira: documento,
  endereço, telefone e o hash da senha do portal.

Não havia meio-termo, porque conferir a senha no navegador exige ler a linha do
cliente antes de saber quem ele é.

A solução tem três partes:

1. **Edge Function `login-cliente`** confere o documento e a senha com a
   Service Role (via `portal_cliente_por_documento`, `security definer` e
   revogada de todo mundo menos `service_role`), garante um usuário de Auth
   para aquele cliente e devolve um `token_hash` de uso único. O e-mail desse
   usuário é sintético (`cliente.<id>@portal.invalid`, domínio reservado pela
   RFC 2606): o e-mail do cadastro pode estar vazio, repetido, ou ser o mesmo
   de um funcionário.
2. **`verifyOtp`** no navegador troca o token por uma sessão real. A partir daí
   o cliente é um autenticado comum, e o hook de Auth injeta `customer_id` nos
   claims junto de `org_id`/`app_role`.
3. **Políticas** (`db/migrate_portal_rls.sql`): `org_isolation` e `staff_only`
   passam a excluir o papel `cliente` — sem isso ele veria a organização
   inteira —, e cada tabela do Portal ganha uma política presa a
   `auth_customer_id()`. Os catálogos (serviços, pragas, produtos) e a lista de
   técnicos são recortados ao que aparece nos registros **dele**: o catálogo
   inteiro traria preço de produto e serviço junto, e margem não é dado do
   cliente.

**Escrita.** O cliente confirma, pede reagendamento e cancela. RLS não sabe
restringir coluna, e o store manda a linha inteira no update — então dois
gatilhos (`portal_guard_appointments`, `portal_guard_service_orders`) partem de
`OLD` e aceitam de `NEW` só os campos do Portal. Coluna criada no futuro entra
automaticamente como "não pode mudar", que é o padrão seguro. Sem eles, o
cliente poderia pelo console marcar a própria OS como concluída ou mexer no
valor cobrado.

O modo standalone não muda: sem Supabase, o login do cliente continua sendo
conferido localmente (`authenticateCustomer`).

### 3.10 Recorrência: datas combinadas e confirmação

**Como o plano é montado.** A entrada é a que se usa ao fechar contrato:
**por quanto tempo** a recorrência vale (`durationMonths`) e **de quanto em
quanto tempo** a visita acontece. O número de visitas sai dessa conta
(`occurrencesForDuration`) — ninguém contrata "doze visitas", contrata "um ano,
de mês em mês". As fases (`RecurrencePhase[]`) continuam sendo o formato
guardado, e a tela produz sempre uma; OS antiga com várias fases continua
calculando certo.

Periodicidade mensal ou maior anda em **mês de calendário**, não em blocos de
30 dias (`proximaData`): somando dias, doze visitas em um ano terminam cinco
dias antes de onde começaram e o dia combinado com o cliente muda sozinho. Dia
31 em mês curto recua para o último dia do mês, que é o que "todo dia 31"
significa.

Trocar a duração ou a periodicidade **descarta as datas ajustadas à mão**: os
ajustes são guardados por posição, então mantê-los faria a data escolhida para
a visita 3 do plano semanal reaparecer na visita 3 do bimestral — outro dia,
outro mês.

A periodicidade calcula a data; ela nem sempre serve. A conta pode cair num
sábado, num feriado ou num dia em que o estabelecimento não abre — e quem
programa precisa **ver o dia da semana antes de fechar**, não descobrir depois.
Por isso `OsRecurrence.dates` guarda a data efetiva de cada visita: o que a
conta sugeriu, quando ninguém mexeu, ou o dia escolhido no lugar dela. É desta
lista que saem os agendamentos, e não do cálculo.

Mudar uma data **não desloca as seguintes**. Cascatear obrigaria a refazer o
plano inteiro por causa de um feriado; o caso real é remarcar uma visita.

Uma visita programada **não vira Ordem de Serviço sozinha**. Entre a
programação e a data, o cliente troca o dia, o contrato muda, a visita perde o
sentido. Uma semana antes (`DIAS_DE_AVISO`), `notifyPendingRecurrences()` avisa
e a Agenda mostra "Recorrências a confirmar"; `confirmRecurrenceVisit()` cria a
OS copiando a última OS do mesmo plano — serviços, pragas, áreas, equipe,
produtos e valor, porque visita recorrente é a repetição do mesmo atendimento.

O que **não** é copiado importa tanto quanto: assinaturas, horários de execução
e pagamento ficam de fora. São fatos do atendimento anterior, e repeti-los
produziria uma OS afirmando o que não aconteceu. A nova OS também nasce com
`recurrence.enabled: false` — é uma ocorrência do plano, não a origem de um
plano novo, senão cada confirmação geraria outra árvore de agendamentos.

Visita atrasada continua na lista: sumir da tela é exatamente o que faz uma
visita contratada ser esquecida.

Sem migration — `service_orders.recurrence` já é `jsonb`.

- `lib/recurrence.ts`: `planDates`, `weekdayLabel`, `isWeekend`, `withinNextYear`.
- `application/recurrenceConfirm.ts`: pendências, notificação e geração da OS.

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

Duas perguntas separadas, cada uma com um dono:

**Por qual porta a pessoa entra?** — é o **papel** (`UserRole`). São quatro, e
cada um tem comportamento no código; por isso não é um cadastro editável.

| Papel | Onde entra | Acesso |
| --- | --- | --- |
| `admin` | Escritório | Tudo. Ignora setor e `hideFinancialValues`. |
| `funcionario` | Escritório | **Só o que o setor dele permitir.** |
| `tecnico` | `/campo` | App do Técnico, fora do sistema de módulos. |
| `cliente` | `/portal` | Portal do Cliente (§3.8), isolado. |

**Quais telas ela abre depois de entrar?** — é o **setor**
(`departments.modules`), um cadastro editável em Configurações → Departamento.
Funcionário **sem setor** enxerga apenas o Dashboard: acesso nunca é um padrão
implícito que ninguém configurou, e a tela marca esses usuários com um aviso.

Sobre isso há duas camadas finas:
- **Exceções por usuário** (`permissionOverrides`) — libera ou bloqueia um
  módulo para uma pessoa sem mexer no setor inteiro.
- **`hideFinancialValues`** (`canSeeFinancialValues`) — a pessoa abre a tela
  liberada mas não vê valores em dinheiro. Existe porque acesso por módulo é
  tudo-ou-nada por tela, e "abrir a OS sem ver quanto foi cobrado" não cabia
  nele. Admin nunca é afetado.

Tudo isso vale também para URL digitada à mão: `RequireAuth` refaz a checagem
na rota, não só no menu.

Os papéis `supervisor`, `financeiro`, `atendimento` e `estoque` foram
consolidados em `funcionario` (`db/migrate_papeis.sql`). Eles não abriam nem
fechavam tela nenhuma por si — só serviam de padrão de reserva e duplicavam o
que o setor já decide, deixando duas respostas possíveis para "por que essa
pessoa não vê Financeiro?". Com isso, `navItems` deixou de carregar `roles`:
a única fonte de verdade de acesso é o setor.

**Quem pode cadastrar pessoas** deixou de ser um papel fixo: é o administrador
e o funcionário cujo setor tenha o módulo `configuracoes` marcado — que é
justamente onde a tela de cadastro vive. A checagem roda no servidor, na Edge
Function `convidar-tecnico` (§3.4), não só na interface.


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
