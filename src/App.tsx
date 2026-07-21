import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './presentation/components/layout/AppLayout';
import { FieldLayout } from './presentation/components/layout/FieldLayout';
import { RequireAuth } from './presentation/components/auth/RequireAuth';
import { RouteError } from './presentation/components/RouteError';
import { LoginPage } from './presentation/pages/LoginPage';

// Code splitting: cada tela vira um chunk carregado sob demanda.
const named = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, key: K) =>
  lazy(() => loader().then((m) => ({ default: m[key] })));

const DashboardPage = named(() => import('./presentation/pages/DashboardPage'), 'DashboardPage');
const AgendaPage = named(() => import('./presentation/pages/AgendaPage'), 'AgendaPage');
const RotasPage = named(() => import('./presentation/pages/RotasPage'), 'RotasPage');
const OrdensPage = named(() => import('./presentation/pages/OrdensPage'), 'OrdensPage');
const ClientesPage = named(() => import('./presentation/pages/ClientesPage'), 'ClientesPage');
const CrmPage = named(() => import('./presentation/pages/CrmPage'), 'CrmPage');
const MonitoramentoPage = named(() => import('./presentation/pages/MonitoramentoPage'), 'MonitoramentoPage');
const NaoConformidadePage = named(() => import('./presentation/pages/NaoConformidadePage'), 'NaoConformidadePage');
const EstoquePage = named(() => import('./presentation/pages/EstoquePage'), 'EstoquePage');
const ProdutosPage = named(() => import('./presentation/pages/ProdutosPage'), 'ProdutosPage');
const EquipamentosPage = named(() => import('./presentation/pages/EquipamentosPage'), 'EquipamentosPage');
const VeiculosPage = named(() => import('./presentation/pages/VeiculosPage'), 'VeiculosPage');
const FinanceiroPage = named(() => import('./presentation/pages/FinanceiroPage'), 'FinanceiroPage');
const FiscalPage = named(() => import('./presentation/pages/FiscalPage'), 'FiscalPage');
const RelatoriosPage = named(() => import('./presentation/pages/RelatoriosPage'), 'RelatoriosPage');
const ConfigPage = named(() => import('./presentation/pages/ConfigPage'), 'ConfigPage');
const HistoricoPage = named(() => import('./presentation/pages/HistoricoPage'), 'HistoricoPage');
const CampoPage = named(() => import('./presentation/pages/CampoPage'), 'CampoPage');
const CampoMapaPage = named(() => import('./presentation/pages/CampoMapaPage'), 'CampoMapaPage');
const CampoProdutosPage = named(() => import('./presentation/pages/CampoProdutosPage'), 'CampoProdutosPage');
const NotFoundPage = named(() => import('./presentation/pages/NotFoundPage'), 'NotFoundPage');

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },

  {
    path: '/campo',
    element: (
      <RequireAuth>
        <FieldLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <CampoPage /> },
      { path: 'mapa', element: <CampoMapaPage /> },
      { path: 'produtos', element: <CampoProdutosPage /> },
    ],
  },

  {
    path: '/',
    element: (
      <RequireAuth requireStaff>
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'agenda', element: <AgendaPage /> },
      { path: 'rotas', element: <RotasPage /> },
      { path: 'ordens', element: <OrdensPage /> },
      { path: 'clientes', element: <ClientesPage /> },
      { path: 'crm', element: <CrmPage /> },
      { path: 'monitoramento', element: <MonitoramentoPage /> },
      { path: 'nao-conformidade', element: <NaoConformidadePage /> },
      { path: 'estoque', element: <EstoquePage /> },
      { path: 'produtos', element: <ProdutosPage /> },
      { path: 'equipamentos', element: <EquipamentosPage /> },
      { path: 'veiculos', element: <VeiculosPage /> },
      { path: 'financeiro', element: <FinanceiroPage /> },
      { path: 'fiscal', element: <FiscalPage /> },
      { path: 'relatorios', element: <RelatoriosPage /> },
      { path: 'historico', element: <HistoricoPage /> },
      { path: 'config', element: <ConfigPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
