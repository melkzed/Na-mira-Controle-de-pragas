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

**Regra de ouro:** trocar a fonte de dados (seed → Supabase) exige reimplementar
apenas `application/repository.ts`. Nenhuma página muda.

## 3. Estado da aplicação

- **Zustand** (`store/appStore.ts`): tema (persistido em `localStorage`), usuário
  atual (para demonstrar RBAC), notificações e paleta de comandos.
- Estado local de tela via `useState`/`useMemo` (filtros, seleção, drawers).

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
