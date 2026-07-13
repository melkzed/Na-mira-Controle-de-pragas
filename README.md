<div align="center">

# 🛡️ Na Mira · Controle de Pragas

**Plataforma SaaS de gestão operacional para empresas de controle de pragas, dedetização e sanitização.**

ERP · CRM · Field Service Management (FSM) · Agenda Inteligente · Estoque · Financeiro · Fiscal

</div>

---

## ✨ Visão geral

A **Na Mira** unifica em uma única plataforma toda a operação de uma empresa de
dedetização — do primeiro contato do cliente até a conclusão do serviço, emissão
de documentos, controle de estoque utilizado pelo técnico e relatórios gerenciais.

O diferencial é o **módulo inteligente de agendamento e gestão de equipes em
campo**: gestores acompanham a operação em tempo real e técnicos têm uma visão
clara e simples da sua rotina diária, com rota otimizada, checklist e estoque
próprio.

> Este repositório contém uma **implementação funcional de referência** (frontend
> completo + modelagem de dados) que roda 100% standalone com dados de exemplo,
> além do **esquema de banco de dados normalizado** pronto para PostgreSQL/Supabase.

---

## 🧭 Módulos

| Módulo | O que faz |
| --- | --- |
| **Dashboard** | +25 indicadores, gráficos animados, alertas e agenda do dia |
| **Agenda** ⭐ | Visões Dia / Semana / Mês / Agenda / Mapa (estilo Google Calendar) |
| **Roteirização** | Sequência otimizada de visitas, distância/tempo, integração de mapas |
| **App do Técnico** | Painel de campo mobile-first: rota, checklist, estoque, iniciar/finalizar |
| **Clientes** | Cadastro PF/PJ completo, histórico, contratos, auto-save |
| **CRM** | Funil de vendas em kanban (contato → orçamento → negociação → ganho) |
| **Estoque** | Dois níveis: central + individual por técnico, com movimentações |
| **Produtos** | Catálogo com princípio ativo, registro, dosagem, FISPQ |
| **Ordens de Serviço** | OS completa com produtos, pragas, assinaturas e geração de PDF |
| **Equipamentos / Veículos** | Patrimônio, manutenções, abastecimentos, frota |
| **Financeiro** | Fluxo de caixa, contas a pagar/receber, DRE, comissões |
| **Fiscal** | Licenças, alvarás, responsáveis técnicos, NFS-e (estrutura) |
| **Relatórios** | +18 relatórios com filtros e exportação PDF/Excel/CSV |
| **Configurações** | Usuários, organização e matriz de permissões (RBAC) |

---

## 🏗️ Arquitetura

O projeto segue **Clean Architecture** e princípios **SOLID**, com dependências
apontando sempre para o domínio:

```
src/
├── domain/            # Entidades e enums puros (sem framework)
│   ├── enums.ts
│   └── types.ts
├── application/       # Casos de uso: métricas, navegação (RBAC), repositório
│   ├── metrics.ts
│   ├── navigation.ts
│   └── repository.ts  # fachada de dados (troca seed ⇄ Supabase sem mudar telas)
├── infrastructure/    # Implementações concretas (fonte de dados)
│   └── seed/          # dataset de exemplo em memória
├── presentation/      # React: design system + páginas
│   ├── components/
│   │   ├── ui/        # Card, Button, Badge, Table, Drawer, Field, ...
│   │   └── layout/    # Sidebar, Topbar, AppLayout, CommandPalette
│   └── pages/         # uma página por módulo
├── store/             # estado global (Zustand): tema, usuário, notificações
└── lib/               # utilitários (formatação, datas)
```

A camada de apresentação **nunca** conhece a fonte de dados: ela conversa com
`application/repository.ts`. Para plugar o Supabase, basta reimplementar essa
fachada — as telas permanecem inalteradas (**Dependency Inversion**).

Detalhes em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 🗄️ Banco de dados

Esquema PostgreSQL **normalizado e multi-tenant** (por `org_id`), com ~50 tabelas
cobrindo usuários/permissões, clientes, produtos, lotes, estoque em dois níveis,
agendamentos, rotas, ordens de serviço, checklists, financeiro, fiscal, CRM,
notificações e auditoria.

- Esquema: [`db/schema.sql`](db/schema.sql)
- Dados de exemplo: [`db/seed.sql`](db/seed.sql)
- Documentação e diagrama: [`docs/DATABASE.md`](docs/DATABASE.md)

---

## 🎨 Design System

Interface moderna inspirada em **Linear, Stripe, Notion e Vercel**:

- Tokens de cor semânticos com **tema claro/escuro** (CSS variables + Tailwind)
- **Framer Motion**: fade-in, slide-up, stagger, contadores animados, transições
  de página, layout animations, hover elevado, skeletons
- Glassmorphism leve, cards elegantes, ícones minimalistas (lucide)
- Paleta da marca em **esmeralda** (controle/proteção)
- Paleta de gráficos acessível (Recharts)

---

## 🚀 Como rodar

Requisitos: **Node 18+**.

```bash
npm install
npm run dev       # http://localhost:5173
```

Outros scripts:

```bash
npm run build     # typecheck + build de produção
npm run preview   # serve o build
npm run typecheck # apenas verificação de tipos
npm run lint      # ESLint
```

O app roda **sem backend** usando os dados de exemplo (`VITE_DATA_SOURCE=seed`).
Para conectar o Supabase futuramente, copie `.env.example` para `.env` e
preencha as chaves.

> 💡 Use o seletor **"Perfil"** no topo para alternar entre papéis (Administrador,
> Supervisor, Financeiro, Técnico…) e ver o **RBAC** em ação — o menu e os acessos
> mudam conforme a permissão. Pressione **⌘K / Ctrl+K** para a paleta de comandos.

---

## 🛠️ Stack

| Camada | Tecnologia |
| --- | --- |
| UI | React 18 + TypeScript + Vite |
| Estilo | Tailwind CSS (design tokens) |
| Animações | Framer Motion |
| Gráficos | Recharts |
| Ícones | lucide-react |
| Rotas | React Router |
| Estado | Zustand |
| Datas | date-fns (pt-BR) |
| Banco (alvo) | PostgreSQL / Supabase |

---

## 🔐 Permissões (RBAC)

Seis perfis — **Administrador, Supervisor, Financeiro, Atendimento, Estoque,
Técnico** — cada um enxergando apenas o necessário. O técnico acessa somente o
**App do Técnico**, sem dados administrativos. A matriz completa está em
**Configurações** e em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 🗺️ Roadmap de integração

- [ ] Conectar `repository.ts` ao Supabase (Auth + Postgres + Storage)
- [ ] Row Level Security por `org_id` e políticas por papel
- [ ] Roteirização real (Google Maps Directions / Distance Matrix)
- [ ] Emissão de NFS-e via provedor municipal
- [ ] Geração de PDF de OS e notificações (WhatsApp / push)
- [ ] App mobile nativo do técnico (offline-first)

---

<div align="center">
<sub>Feito com foco em reduzir erros, automatizar processos e facilitar o acompanhamento das equipes em campo.</sub>
</div>
