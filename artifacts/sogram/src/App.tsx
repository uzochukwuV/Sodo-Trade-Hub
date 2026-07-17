import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/Layout";
import NotFound from "@/pages/not-found";

import Feed from "@/pages/Feed";
import Wallets from "@/pages/Wallets";
import WalletProfile from "@/pages/WalletProfile";
import Watchlists from "@/pages/Watchlists";
import Alerts from "@/pages/Alerts";
import Backtest from "@/pages/Backtest";
import Markets from "@/pages/Markets";
import Investigations from "@/pages/Investigations";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Feed} />
        <Route path="/wallets" component={Wallets} />
        <Route path="/wallets/:address" component={WalletProfile} />
        <Route path="/watchlists" component={Watchlists} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/backtest" component={Backtest} />
        <Route path="/investigations" component={Investigations} />
        <Route path="/markets" component={Markets} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
