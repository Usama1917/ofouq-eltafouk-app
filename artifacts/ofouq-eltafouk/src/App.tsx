import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/layout";

// Pages
import Dashboard from "@/pages/dashboard";
import Books from "@/pages/books";
import Videos from "@/pages/videos";
import Social from "@/pages/social";
import AiChat from "@/pages/ai-chat";
import Points from "@/pages/points";
import Games from "@/pages/games";
import Rewards from "@/pages/rewards";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/books" component={Books} />
        <Route path="/videos" component={Videos} />
        <Route path="/social" component={Social} />
        <Route path="/ai-chat" component={AiChat} />
        <Route path="/points" component={Points} />
        <Route path="/games" component={Games} />
        <Route path="/rewards" component={Rewards} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
