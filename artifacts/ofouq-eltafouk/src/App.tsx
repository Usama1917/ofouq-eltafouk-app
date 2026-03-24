import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/auth-context";
import { Layout } from "@/components/layout";

// Public pages
import Login from "@/pages/login";
import Register from "@/pages/register";
import AdminLogin from "@/pages/admin-login";
import OwnerLogin from "@/pages/owner-login";

// Main app pages
import Dashboard from "@/pages/dashboard";
import Books from "@/pages/books";
import Videos from "@/pages/videos";
import Social from "@/pages/social";
import AiChat from "@/pages/ai-chat";
import Points from "@/pages/points";
import Games from "@/pages/games";
import Rewards from "@/pages/rewards";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";

// Panel pages (have their own layout)
import AdminPanel from "@/pages/admin-panel";
import OwnerPanel from "@/pages/owner-panel";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function Router() {
  return (
    <Switch>
      {/* Auth pages — standalone, no app layout */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/admin-login" component={AdminLogin} />
      <Route path="/owner-login" component={OwnerLogin} />

      {/* Panel pages — have their own layout with sidebar */}
      <Route path="/admin" component={AdminPanel} />
      <Route path="/owner" component={OwnerPanel} />

      {/* Main app pages — wrapped in shared Layout */}
      <Route>
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
            <Route path="/profile" component={Profile} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <Router />
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
