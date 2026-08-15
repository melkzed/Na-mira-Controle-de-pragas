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
