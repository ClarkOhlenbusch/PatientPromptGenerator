import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import PatientPrompts from "@/pages/PatientPrompts";
import FAQ from "@/pages/FAQ";
import AuthPage from "@/pages/auth-page";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import PromptEditingSandbox from "@/pages/PromptEditingSandbox";
import AIPoweredTriage from "@/pages/AIPoweredTriage";
import AICompanionCalls from "@/pages/AICompanionCalls";
import MonthlyReports from "@/pages/MonthlyReports";
import SettingsPage from "@/pages/settings-page";
import CallHistory from "@/pages/CallHistory";

function Router() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <Switch>
            <ProtectedRoute path="/" component={Home} />
            <ProtectedRoute path="/patient-prompts/:id" component={PatientPrompts} />
            <ProtectedRoute path="/prompt-editing" component={PromptEditingSandbox} />
            <ProtectedRoute path="/triage" component={AIPoweredTriage} />
            <ProtectedRoute path="/companion-calls" component={AICompanionCalls} />
            <ProtectedRoute path="/call-history" component={CallHistory} />
            <ProtectedRoute path="/trend-reports" component={MonthlyReports} />
            <ProtectedRoute path="/settings" component={SettingsPage} />
            <Route path="/auth" component={AuthPage} />
            <Route path="/faq" component={FAQ} />
            <Route component={NotFound} />
          </Switch>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
