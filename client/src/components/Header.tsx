import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, User, Loader2, Menu, X, Settings } from "lucide-react";

export default function Header() {
  const { user, logoutMutation, isLoading } = useAuth();
  const [location, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleLogin = () => {
    navigate("/auth");
  };

  // Don't show the header on auth page
  if (location === "/auth") {
    return null;
  }

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <Link href="/">
          <div className="flex items-center cursor-pointer">
            <div className="flex items-center">
              <img 
                src="/assets/cali-logo.png" 
                alt="Cali Logo" 
                className="h-10 w-auto mr-2"
              />
              <div className="flex items-baseline">
                <span className="text-[#F5A443] font-bold text-2xl">calico</span>
                <span className="text-[#3498DB] font-medium italic text-2xl">care</span>
              </div>
            </div>
            <h1 className="ml-4 text-xl font-bold text-gray-800 border-l-2 border-gray-300 pl-4">Caretaker Prompt Generator</h1>
          </div>
        </Link>

        <div className="hidden md:flex items-center space-x-4">
          {user && (
            <nav className="flex items-center space-x-6 mr-4">
              <Link href="/">
                <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                  Upload Data
                </span>
              </Link>
              <Link href="/prompt-editing">
                <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/prompt-editing" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                  Prompt Editing
                </span>
              </Link>
              <Link href="/triage">
                <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/triage" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                  AI Triage
                </span>
              </Link>
              <Link href="/companion-calls">
                <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/companion-calls" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                  AI Companion
                </span>
              </Link>
              <Link href="/call-history">
                <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/call-history" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                  Call History
                </span>
              </Link>
              <Link href="/monthly-reports">
                <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/monthly-reports" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                  Trend Reports
                </span>
              </Link>
              <Link href="/settings">
                <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/settings" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                  Settings
                </span>
              </Link>
            </nav>
          )}

          <Link href="/faq">
            <span className="text-gray-600 hover:text-primary text-sm font-medium transition-colors cursor-pointer">Help</span>
          </Link>

          {isLoading ? (
            <Button disabled variant="outline" size="sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </Button>
          ) : user ? (
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-gray-700 border rounded-full bg-gray-50 px-3 py-1 flex items-center">
                <User className="mr-1 h-3 w-3" />
                {user.username}
              </div>
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                disabled={logoutMutation.isPending}
              >
                {logoutMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="mr-2 h-4 w-4" />
                )}
                Logout
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleLogin}
              variant="outline"
              size="sm"
            >
              Login
            </Button>
          )}
        </div>

        <div className="md:hidden relative">
          {user && mobileMenuOpen && (
            <div className="absolute top-10 right-0 bg-white shadow-lg rounded-md p-4 min-w-[200px] z-10 border">
              <nav className="flex flex-col space-y-3">
                <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                  <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                    Upload Data
                  </span>
                </Link>
                <Link href="/prompt-editing" onClick={() => setMobileMenuOpen(false)}>
                  <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/prompt-editing" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                    Prompt Editing
                  </span>
                </Link>
                <Link href="/triage" onClick={() => setMobileMenuOpen(false)}>
                  <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/triage" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                    AI Triage
                  </span>
                </Link>
                <Link href="/companion-calls" onClick={() => setMobileMenuOpen(false)}>
                  <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/companion-calls" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                    AI Companion
                  </span>
                </Link>
                <Link href="/call-history" onClick={() => setMobileMenuOpen(false)}>
                  <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/call-history" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                    Call History
                  </span>
                </Link>
                <Link href="/monthly-reports" onClick={() => setMobileMenuOpen(false)}>
                  <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/monthly-reports" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                    Trend Reports
                  </span>
                </Link>
                <Link href="/settings" onClick={() => setMobileMenuOpen(false)}>
                  <span className={`text-sm font-medium transition-colors cursor-pointer ${location === "/settings" ? "text-primary" : "text-gray-600 hover:text-primary"}`}>
                    <Settings className="inline h-3 w-3 mr-1" />
                    Settings
                  </span>
                </Link>
                <Link href="/faq" onClick={() => setMobileMenuOpen(false)}>
                  <span className="text-gray-600 hover:text-primary text-sm font-medium transition-colors cursor-pointer">Help</span>
                </Link>
                <hr className="my-2" />
                <Button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  variant="outline"
                  size="sm"
                  disabled={logoutMutation.isPending}
                  className="w-full"
                >
                  {logoutMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-2 h-4 w-4" />
                  )}
                  Logout
                </Button>
              </nav>
            </div>
          )}
          <button
            className="text-gray-600 hover:text-gray-900"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}