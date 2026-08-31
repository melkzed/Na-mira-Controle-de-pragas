# CLAUDE.md — Na Mira · Controle de Pragas

Guia para o Claude Code trabalhar neste repositório com pouco contexto. Leia
isto antes de explorar o código — evita varreduras e economiza tokens.

## O que é

SaaS de gestão para empresas de dedetização (ERP + CRM + Field Service). Frontend
completo em **React 18 + TypeScript + Vite**, roda **100% standalone** (sem
backend) com dados de exemplo persistidos no `localStorage`. UI em **pt-BR**.

## Comandos

```bash
npm run dev        # dev server (Vite, http://localhost:5173)
npm run typecheck  # tsc --noEmit  (rode SEMPRE antes de commitar)
npm run build      # tsc --noEmit && vite build
npm run lint       # ESLint (max-warnings 0)
npm run preview    # serve o build (vite preview)
```

## Arquitetura (Clean Architecture, dependências apontam ao domínio)

- `src/domain/` — `types.ts`, `enums.ts`. Tipos puros, sem framework.
- `src/application/` — casos de uso. **`repository.ts` é a fachada de dados**:
  as telas nunca leem o seed direto; chamam o repository.
- `src/infrastructure/seed/data.ts` — dataset de exemplo (datas relativas a hoje).
- `src/presentation/` — `components/ui` (design system), `components/layout`,
  `pages/` (uma página por módulo). Três áreas: `AppLayout` (escritório),
  `FieldLayout` (técnico, `/campo`) e `PortalLayout` (cliente, `/portal` —
  papel `cliente`, isolado; ver docs/ARCHITECTURE.md §3.8).
- `src/store/` — Zustand, persistido no `localStorage`.
- `src/lib/` — utilitários: `geo.ts` (projeção + distância Haversine),
  `route.ts` (otimização de rota com janelas de horário), `date.ts`, PDF (`print*.ts`),
  importação de planilha (`importSheet.ts` lê o arquivo, `importModules.ts` diz
  o que cada módulo aceita — ver docs/ARCHITECTURE.md §3.7).

## Modelo de dados standalone (IMPORTANTE)

- Cada módulo tem uma store Zustand persistida (`appointmentsStore`,
  `customersStore`, `entityStores` = produtos/serviços/veículos/etc., `trapsStore`…).
- **`repository.ts` lê das stores via `getState()`** (não do seed) para manter
  tudo consistente entre módulos. Ao adicionar consultas, siga esse padrão —
  ex.: `useAppointmentsStore.getState().appointments`.
- `appointmentsStore` usa carimbo diário: reusa o `localStorage` só no mesmo dia;
  a cada dia recarrega do seed (as datas do seed são relativas).
- Não há backend ativo. Supabase/RLS estão preparados em `db/` mas desligados.

## Convenções

- **pt-BR** em toda a UI e nos comentários.
- Cores: use tokens Tailwind (`text-brand`, `bg-muted`…) ou, em SVG/inline,
  `rgb(var(--color-brand))` — os tokens têm prefixo `--color-`.
- Feedback ao usuário: use `toast(msg, { tone, action })` de `@/store/toastStore`,
  **nunca `alert()`**. Exclusões oferecem "Desfazer".
- Acessibilidade: elementos clicáveis que não são `<button>` precisam de
  `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Espaço) e `aria-label`.
- Formulários em `Drawer`: o efeito de foco depende só de `[open]` (ver
  `Drawer.tsx`) — não reintroduza `onClose` nas deps (causa trava ao digitar).
- Datas: use `DateInput` (`components/ui/Field.tsx`) para `date`, `time` e
  `datetime-local` — nunca `<input type="date">` direto. Ele deixa o clique
  apenas focar (o campo nativo já aceita digitar nos segmentos) e move o
  calendário para um botão próprio. **Não** volte a chamar `showPicker()` no
  `onClick`/`onFocus` do campo: o seletor nativo toma o foco e impede digitar.
- Ordenação alfabética: `compareText`/`sortByName` (`lib/utils.ts`), que usam
  `Intl.Collator('pt-BR')`. `localeCompare` sem locale, ou comparação crua,
  joga todo nome acentuado para o fim da lista.

## Roteirização / mapa (feature central recente)

- `lib/geo.ts`: `projectPoints` (lat/lng → SVG), `haversineKm`, deep-links
  Maps/Waze/Apple. `RouteMap.tsx` desenha o mapa em SVG (sem tiles externos).
- `lib/route.ts`: `planRoute`/`simulateRoute` — TSP com janelas de tempo.
  Visitas com `fixedTime` (hora marcada) têm janela `[scheduledStart, scheduledEnd]`
  e não podem ser atendidas fora dela; visitas em andamento/finalizadas ficam
  travadas no início. Usado em `RotasPage` e `CampoMapaPage`.

## Fluxo de verificação e commit

- Após mudanças de UI, **verifique no navegador** com Puppeteer antes de commitar
  (headless Chromium já instalado). Veja o skill `verificar-no-navegador`.
- Antes de commitar: `npm run typecheck` limpo; remova `puppeteer-core` e qualquer
  script `_*.mjs`/screenshot de teste do working tree.
- Branch de trabalho: `claude/pest-control-erp-fsm-2uoct1`. Não faça push para
  outra branch sem permissão. PR alvo: #1.

## Não faça

- Não leia/edite o seed direto nas telas — passe pelo `repository.ts`.
- Não use `alert()`/`confirm()`; use toasts.
- Não adicione dependências de rede no mapa (o CSP em `vercel.json` bloqueia
  hosts externos; o mapa é SVG autossuficiente).
- Não deixe `puppeteer-core` no `package.json` ao commitar.
