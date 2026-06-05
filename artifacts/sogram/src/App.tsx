import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/Layout";
import NotFound from "@/pages/not-found";

import Feed from "@/pages/Feed";
import Signals from "@/pages/Signals";
import Traders from "@/pages/Traders";
import TraderProfile from "@/pages/TraderProfile";
import Analytics from "@/pages/Analytics";
import CopyTrading from "@/pages/CopyTrading";
import PainRoom from "@/pages/PainRoom";
import Intents from "@/pages/Intents";
import Markets from "@/pages/Markets";
import { ChatWidget } from "@/components/ChatWidget";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Feed} />
        <Route path="/signals" component={Signals} />
        <Route path="/traders" component={Traders} />
        <Route path="/traders/:id" component={TraderProfile} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/copy" component={CopyTrading} />
        <Route path="/pain-room" component={PainRoom} />
        <Route path="/intents" component={Intents} />
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
        <ChatWidget />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
