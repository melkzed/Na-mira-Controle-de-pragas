import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './presentation/components/layout/AppLayout';
import { FieldLayout } from './presentation/components/layout/FieldLayout';
import { RequireAuth } from './presentation/components/auth/RequireAuth';
import { LoginPage } from './presentation/pages/LoginPage';
import { DashboardPage } from './presentation/pages/DashboardPage';
import { AgendaPage } from './presentation/pages/AgendaPage';
import { RotasPage } from './presentation/pages/RotasPage';
import { OrdensPage } from './presentation/pages/OrdensPage';
import { ClientesPage } from './presentation/pages/ClientesPage';
import { CrmPage } from './presentation/pages/CrmPage';
import { EstoquePage } from './presentation/pages/EstoquePage';
import { ProdutosPage } from './presentation/pages/ProdutosPage';
import { EquipamentosPage } from './presentation/pages/EquipamentosPage';
import { VeiculosPage } from './presentation/pages/VeiculosPage';
import { FinanceiroPage } from './presentation/pages/FinanceiroPage';
import { FiscalPage } from './presentation/pages/FiscalPage';
import { RelatoriosPage } from './presentation/pages/RelatoriosPage';
import { ConfigPage } from './presentation/pages/ConfigPage';
import { CampoPage } from './presentation/pages/CampoPage';
import { NotFoundPage } from './presentation/pages/NotFoundPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },

  // App do Técnico — acesso a qualquer usuário autenticado (técnico é a home;
  // staff pode pré-visualizar). Chrome dedicado, sem menu administrativo.
  {
    path: '/campo',
    element: (
      <RequireAuth>
        <FieldLayout />
      </RequireAuth>
    ),
    children: [{ index: true, element: <CampoPage /> }],
  },

  // Área administrativa — bloqueada para técnicos (redireciona a /campo).
  {
    path: '/',
    element: (
      <RequireAuth requireStaff>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'agenda', element: <AgendaPage /> },
      { path: 'rotas', element: <RotasPage /> },
      { path: 'ordens', element: <OrdensPage /> },
      { path: 'clientes', element: <ClientesPage /> },
      { path: 'crm', element: <CrmPage /> },
      { path: 'estoque', element: <EstoquePage /> },
      { path: 'produtos', element: <ProdutosPage /> },
      { path: 'equipamentos', element: <EquipamentosPage /> },
      { path: 'veiculos', element: <VeiculosPage /> },
      { path: 'financeiro', element: <FinanceiroPage /> },
      { path: 'fiscal', element: <FiscalPage /> },
      { path: 'relatorios', element: <RelatoriosPage /> },
      { path: 'config', element: <ConfigPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
