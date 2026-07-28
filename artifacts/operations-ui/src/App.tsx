import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Layout } from './components/layout';

import { Dashboard } from './pages/dashboard';
import { PlantsOverview } from './pages/plants/index';
import { PlantDetail } from './pages/plants/detail';
import { MachineDetail } from './pages/machines/detail';
import { IncidentsList } from './pages/incidents/index';
import { IncidentDetail } from './pages/incidents/detail';
import { SloDashboard } from './pages/slo';
import { RemediationAudit } from './pages/remediation';
import { SimulatorControl } from './pages/simulator';
import { KafkaPipeline } from './pages/kafka';

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/plants" component={PlantsOverview} />
        <Route path="/plants/:siteId" component={PlantDetail} />
        <Route path="/machines/:machineId" component={MachineDetail} />
        <Route path="/incidents" component={IncidentsList} />
        <Route path="/incidents/:id" component={IncidentDetail} />
        <Route path="/slo" component={SloDashboard} />
        <Route path="/remediation" component={RemediationAudit} />
        <Route path="/simulator" component={SimulatorControl} />
        <Route path="/kafka" component={KafkaPipeline} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;