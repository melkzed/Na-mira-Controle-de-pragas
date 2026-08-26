import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './presentation/components/layout/AppLayout';
import { FieldLayout } from './presentation/components/layout/FieldLayout';
import { PortalLayout } from './presentation/components/layout/PortalLayout';
import { RequireAuth } from './presentation/components/auth/RequireAuth';
import { RouteError } from './presentation/components/RouteError';
import { LoginPage } from './presentation/pages/LoginPage';
import { DefinirSenhaPage } from './presentation/pages/DefinirSenhaPage';

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
const TecnicosPage = named(() => import('./presentation/pages/TecnicosPage'), 'TecnicosPage');
const VeiculosPage = named(() => import('./presentation/pages/VeiculosPage'), 'VeiculosPage');
const FinanceiroPage = named(() => import('./presentation/pages/FinanceiroPage'), 'FinanceiroPage');
const FiscalPage = named(() => import('./presentation/pages/FiscalPage'), 'FiscalPage');
const RelatoriosPage = named(() => import('./presentation/pages/RelatoriosPage'), 'RelatoriosPage');
const ConfigPage = named(() => import('./presentation/pages/ConfigPage'), 'ConfigPage');
const HistoricoPage = named(() => import('./presentation/pages/HistoricoPage'), 'HistoricoPage');
const CampoPage = named(() => import('./presentation/pages/CampoPage'), 'CampoPage');
const CampoMapaPage = named(() => import('./presentation/pages/CampoMapaPage'), 'CampoMapaPage');
const CampoProdutosPage = named(() => import('./presentation/pages/CampoProdutosPage'), 'CampoProdutosPage');
const CampoSemanaPage = named(() => import('./presentation/pages/CampoSemanaPage'), 'CampoSemanaPage');
const CampoEstoquePage = named(() => import('./presentation/pages/CampoEstoquePage'), 'CampoEstoquePage');
const CampoPontoPage = named(() => import('./presentation/pages/CampoPontoPage'), 'CampoPontoPage');
const CampoCombustivelPage = named(() => import('./presentation/pages/CampoCombustivelPage'), 'CampoCombustivelPage');
const PortalDashboardPage = named(() => import('./presentation/pages/portal/PortalDashboardPage'), 'PortalDashboardPage');
const PortalAgendamentosPage = named(() => import('./presentation/pages/portal/PortalAgendamentosPage'), 'PortalAgendamentosPage');
const PortalHistoricoPage = named(() => import('./presentation/pages/portal/PortalHistoricoPage'), 'PortalHistoricoPage');
const PortalDocumentosPage = named(() => import('./presentation/pages/portal/PortalDocumentosPage'), 'PortalDocumentosPage');
const PortalFinanceiroPage = named(() => import('./presentation/pages/portal/PortalFinanceiroPage'), 'PortalFinanceiroPage');
const PortalMonitoramentoPage = named(() => import('./presentation/pages/portal/PortalMonitoramentoPage'), 'PortalMonitoramentoPage');
const PortalPerfilPage = named(() => import('./presentation/pages/portal/PortalPerfilPage'), 'PortalPerfilPage');
const NotFoundPage = named(() => import('./presentation/pages/NotFoundPage'), 'NotFoundPage');

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  { path: '/definir-senha', element: <DefinirSenhaPage />, errorElement: <RouteError /> },

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
      { path: 'semana', element: <CampoSemanaPage /> },
      { path: 'estoque', element: <CampoEstoquePage /> },
      { path: 'ponto', element: <CampoPontoPage /> },
      { path: 'combustivel', element: <CampoCombustivelPage /> },
      { path: 'mapa', element: <CampoMapaPage /> },
      { path: 'produtos', element: <CampoProdutosPage /> },
    ],
  },

  {
    // Portal do Cliente — área isolada: só o papel `cliente` entra, e ele não
    // entra em nenhuma outra (ver RequireAuth).
    path: '/portal',
    element: (
      <RequireAuth requireCliente>
        <PortalLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <PortalDashboardPage /> },
      { path: 'agendamentos', element: <PortalAgendamentosPage /> },
      { path: 'historico', element: <PortalHistoricoPage /> },
      { path: 'documentos', element: <PortalDocumentosPage /> },
      { path: 'financeiro', element: <PortalFinanceiroPage /> },
      { path: 'monitoramento', element: <PortalMonitoramentoPage /> },
      { path: 'perfil', element: <PortalPerfilPage /> },
      { path: '*', element: <NotFoundPage /> },
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
      { index: true, element: <RequireAuth module="dashboard"><DashboardPage /></RequireAuth> },
      { path: 'agenda', element: <RequireAuth module="agenda"><AgendaPage /></RequireAuth> },
      { path: 'rotas', element: <RequireAuth module="rotas"><RotasPage /></RequireAuth> },
      { path: 'ordens', element: <RequireAuth module="ordens"><OrdensPage /></RequireAuth> },
      { path: 'clientes', element: <RequireAuth module="clientes"><ClientesPage /></RequireAuth> },
      { path: 'crm', element: <RequireAuth module="crm"><CrmPage /></RequireAuth> },
      { path: 'monitoramento', element: <RequireAuth module="monitoramento"><MonitoramentoPage /></RequireAuth> },
      { path: 'nao-conformidade', element: <RequireAuth module="nao_conformidade"><NaoConformidadePage /></RequireAuth> },
      { path: 'estoque', element: <RequireAuth module="estoque"><EstoquePage /></RequireAuth> },
      { path: 'produtos', element: <RequireAuth module="produtos"><ProdutosPage /></RequireAuth> },
      { path: 'equipamentos', element: <RequireAuth module="equipamentos"><EquipamentosPage /></RequireAuth> },
      { path: 'tecnicos', element: <RequireAuth module="tecnicos"><TecnicosPage /></RequireAuth> },
      { path: 'veiculos', element: <RequireAuth module="veiculos"><VeiculosPage /></RequireAuth> },
      { path: 'financeiro', element: <RequireAuth module="financeiro"><FinanceiroPage /></RequireAuth> },
      { path: 'fiscal', element: <RequireAuth module="fiscal"><FiscalPage /></RequireAuth> },
      { path: 'relatorios', element: <RequireAuth module="relatorios"><RelatoriosPage /></RequireAuth> },
      { path: 'historico', element: <RequireAuth module="historico"><HistoricoPage /></RequireAuth> },
      { path: 'config', element: <RequireAuth module="configuracoes"><ConfigPage /></RequireAuth> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
], {
  future: {
    v7_relativeSplatPath: true,
  },
});
