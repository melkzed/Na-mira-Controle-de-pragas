---
name: novo-modulo
description: Passo a passo para adicionar um novo módulo/página ao Na Mira (rota + página + store + navegação + acesso pelo repository), seguindo a Clean Architecture do projeto. Use ao criar uma tela nova, um novo item de menu, ou uma nova entidade CRUD persistida no localStorage.
---

# Adicionar um módulo (Na Mira)

Siga a mesma arquitetura das telas existentes. Tudo standalone (localStorage).

## 1. Domínio

Se houver entidade nova, adicione o tipo em `src/domain/types.ts` (e enums em
`enums.ts`). Nada de framework aqui.

## 2. Store (se a entidade for persistida)

- CRUD simples e homogêneo: use `createEntityStore` (`src/store/createEntityStore.ts`)
  e registre em `src/store/entityStores.ts`.
- Caso especial: crie uma store própria (ex.: `trapsStore.ts`) com `load/save`
  no `localStorage` e seed inicial de `infrastructure/seed/data.ts`.

## 3. Repository (fachada)

Exponha as consultas em `src/application/repository.ts`. **Leia sempre das stores
via `getState()`** (não do seed), como `getCustomer`/`appointmentsForTechnician`.

## 4. Página

`src/presentation/pages/MinhaPage.tsx`, exportando um componente nomeado.
Reaproveite o design system de `components/ui` (`PageHeader`, `Card`, `Button`,
`Table`, `Drawer`, `Field`, `Badge`, `StatCard`). Feedback via `toast(...)`.
Elementos clicáveis não-`<button>` precisam de `role`/`tabIndex`/`onKeyDown`/`aria-label`.

## 5. Rota (lazy) em `src/App.tsx`

```ts
const MinhaPage = named(() => import('./presentation/pages/MinhaPage'), 'MinhaPage');
// dentro de children do AppLayout (staff) OU do /campo (técnico):
{ path: 'meu-modulo', element: <MinhaPage /> },
```

Área de staff exige `RequireAuth requireStaff` (já aplicado no pai `/`); o técnico
só acessa `/campo/*`.

## 6. Navegação

- Staff: adicione o item em `components/layout/Sidebar.tsx` (respeitando o RBAC de
  `application/navigation.ts`).
- Técnico: aba em `components/layout/FieldLayout.tsx` (`FIELD_TABS`).

## 7. Fechar

`npm run typecheck` limpo, verifique no navegador (skill `verificar-no-navegador`)
e commite. Branch: `claude/pest-control-erp-fsm-2uoct1`.
