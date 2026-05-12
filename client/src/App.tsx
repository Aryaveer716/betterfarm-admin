import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AdminLayout from "./components/AdminLayout";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Farms from "./pages/Farms";
import Community from "./pages/Community";
import Marketplace from "./pages/Marketplace";
import Reports from "./pages/Reports";
import Support from "./pages/Support";
import DiseaseDetection from "./pages/DiseaseDetection";
import AiOversight from "./pages/AiOversight";
import ActivityLogs from "./pages/ActivityLogs";
import Settings from "./pages/Settings";
import Analytics from "./pages/Analytics";
import Moderation from "./pages/Moderation";
import Revenue from "./pages/Revenue";
import SystemHealth from "./pages/SystemHealth";
import Health from "./pages/Health";
import HealthDetail from "./pages/HealthDetail";
import Verification from "./pages/Verification";
import Operator from "./pages/Operator";

function Router() {
  return (
    <AdminLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/users" component={Users} />
        <Route path="/farms" component={Farms} />
        <Route path="/community" component={Community} />
        <Route path="/marketplace" component={Marketplace} />
        <Route path="/reports" component={Reports} />
        <Route path="/support" component={Support} />
        <Route path="/disease-detection" component={DiseaseDetection} />
        <Route path="/ai-oversight" component={AiOversight} />
        <Route path="/activity-logs" component={ActivityLogs} />
        <Route path="/settings" component={Settings} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/moderation" component={Moderation} />
        <Route path="/revenue" component={Revenue} />
        <Route path="/system-health" component={SystemHealth} />
        <Route path="/health" component={Health} />
        <Route path="/health/:fingerprint" component={HealthDetail} />
        <Route path="/verification" component={Verification} />
        <Route path="/operator" component={Operator} />
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
