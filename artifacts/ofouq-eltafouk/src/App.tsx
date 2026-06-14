import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { toast, Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Layout } from "@/components/layout";
import { Logo } from "@/components/logo";
import { SOFT_LAUNCH_MODE, hiddenStudentRouteRedirects } from "@/config/soft-launch";

// Public pages
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import OwnerLogin from "@/pages/owner-login";

// Main app pages
import Dashboard from "@/pages/dashboard";
import Books from "@/pages/books";
import { BooksCartPage, BooksTrackingPage, BooksOrdersHistoryPage } from "@/pages/books-subpages";
import Videos from "@/pages/videos";
import { AcademicSubjectsPage, AcademicSubscriptionRequestPage, AcademicUnitsPage, AcademicLessonsPage, AcademicLessonPage } from "@/pages/academic";
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
import TeamChatPage from "@/pages/team-chat";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
  // Global safety net: any react-query mutation that fails now surfaces a toast,
  // so admin actions (create/update/delete user, resolve report, banners, etc.)
  // can no longer fail silently. 401s are skipped — the session interceptor
  // already signs the user out and redirects to login.
  mutationCache: new MutationCache({
    onError: (error) => {
      const status = (error as { status?: number } | undefined)?.status;
      if (status === 401) return;
      const message =
        error instanceof Error && error.message ? error.message : "تعذّر تنفيذ العملية، حاول مرة أخرى";
      toast.error(message);
    },
  }),
});

function SoftLaunchRedirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(to);
  }, [setLocation, to]);

  return null;
}

function createSoftLaunchRedirect(route: keyof typeof hiddenStudentRouteRedirects) {
  return function HiddenStudentRouteRedirect() {
    return <SoftLaunchRedirect to={hiddenStudentRouteRedirects[route]} />;
  };
}

const RedirectBooks = createSoftLaunchRedirect("/books");
const RedirectBooksCart = createSoftLaunchRedirect("/books/cart");
const RedirectBooksTracking = createSoftLaunchRedirect("/books/tracking");
const RedirectBooksOrders = createSoftLaunchRedirect("/books/orders");
const RedirectSocial = createSoftLaunchRedirect("/social");
const RedirectAiChat = createSoftLaunchRedirect("/ai-chat");
const RedirectPoints = createSoftLaunchRedirect("/points");
const RedirectGames = createSoftLaunchRedirect("/games");
const RedirectRewards = createSoftLaunchRedirect("/rewards");

/** Brief brand splash while we resolve whether a stored session is valid, so a
 * logged-in visitor refreshing "/" doesn't flash the public landing page. */
function HomeSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F1E9]">
      <div className="animate-pulse">
        <Logo size={48} />
      </div>
    </div>
  );
}

/** Authenticated app shell: a SINGLE <Layout> wraps the home Dashboard and every
 * in-app page, so navigating to/from "/" never remounts the sidebar (the
 * active-tab animation keeps sliding and submenu state survives). Signed-out
 * visitors at "/" get the standalone public Landing instead; while a stored
 * session is being validated we show a brief brand splash so a logged-in refresh
 * doesn't flash the landing. */
function AppShell() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const isHome = location === "/" || location === "";

  if (isHome && isLoading) return <HomeSplash />;
  if (isHome && !user) return <Landing />;

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        {SOFT_LAUNCH_MODE ? <Route path="/books/cart" component={RedirectBooksCart} /> : <Route path="/books/cart" component={BooksCartPage} />}
        {SOFT_LAUNCH_MODE ? <Route path="/books/tracking" component={RedirectBooksTracking} /> : <Route path="/books/tracking" component={BooksTrackingPage} />}
        {SOFT_LAUNCH_MODE ? <Route path="/books/orders" component={RedirectBooksOrders} /> : <Route path="/books/orders" component={BooksOrdersHistoryPage} />}
        {SOFT_LAUNCH_MODE ? <Route path="/books" component={RedirectBooks} /> : <Route path="/books" component={Books} />}
        {/* Academic drill-down routes under /videos — most specific first */}
        <Route path="/videos/years/:yearId/subjects/:subjectId/units/:unitId/lessons/:lessonId" component={AcademicLessonPage} />
        <Route path="/videos/years/:yearId/subjects/:subjectId/units/:unitId/lessons" component={AcademicLessonsPage} />
        <Route path="/videos/years/:yearId/subjects/:subjectId/units" component={AcademicUnitsPage} />
        <Route path="/videos/years/:yearId/subscribe" component={AcademicSubscriptionRequestPage} />
        <Route path="/videos/years/:yearId" component={AcademicSubjectsPage} />
        <Route path="/videos" component={Videos} />
        {SOFT_LAUNCH_MODE ? <Route path="/social" component={RedirectSocial} /> : <Route path="/social" component={Social} />}
        {SOFT_LAUNCH_MODE ? <Route path="/ai-chat" component={RedirectAiChat} /> : <Route path="/ai-chat" component={AiChat} />}
        {SOFT_LAUNCH_MODE ? <Route path="/points" component={RedirectPoints} /> : <Route path="/points" component={Points} />}
        {SOFT_LAUNCH_MODE ? <Route path="/games" component={RedirectGames} /> : <Route path="/games" component={Games} />}
        {SOFT_LAUNCH_MODE ? <Route path="/rewards" component={RedirectRewards} /> : <Route path="/rewards" component={Rewards} />}
        <Route path="/profile" component={Profile} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Auth pages — standalone, no app layout */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/owner-login" component={OwnerLogin} />
      {/* Legacy admin login URL — redirect to the unified /login */}
      <Route path="/admin-login">{() => <SoftLaunchRedirect to="/login" />}</Route>

      {/* Panel pages — have their own layout with sidebar */}
      <Route path="/admin" component={AdminPanel} />
      <Route path="/owner" component={OwnerPanel} />
      {/* Standalone team chat (owner/admin) — opened in its own tab */}
      <Route path="/team-chat" component={TeamChatPage} />

      {/* Home (public landing or Dashboard) + all in-app pages — one shared Layout */}
      <Route>
        <AppShell />
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
          <Toaster position="top-center" richColors dir="rtl" />
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
