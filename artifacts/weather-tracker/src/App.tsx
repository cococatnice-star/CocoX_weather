
import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { Dashboard } from "@/pages/dashboard";
import { Status } from "@/pages/status";
import { Settings } from "@/pages/settings";
import { AlertSettingsProvider } from "@/lib/alert-settings";

// Connect frontend to the deployed Render API.
setBaseUrl("https://cocox-weather.onrender.com");

const queryClient = new QueryClient();

function Router({ hasSevereAlerts, setHasSevereAlerts }: {
  hasSevereAlerts: boolean;
  setHasSevereAlerts: (value: boolean) => void;
}) {
  return (
    <Layout hasSevereAlerts={hasSevereAlerts}>
      <Switch>
        <Route path="/">
          <Dashboard onSevereAlertsChange={setHasSevereAlerts} />
        </Route>
        <Route path="/status">
          <Status />
        </Route>
        <Route path="/settings">
          <Settings />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  const [hasSevereAlerts, setHasSevereAlerts] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <AlertSettingsProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router
              hasSevereAlerts={hasSevereAlerts}
              setHasSevereAlerts={setHasSevereAlerts}
            />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AlertSettingsProvider>
    </QueryClientProvider>
  );
}

export default App;
