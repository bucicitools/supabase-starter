import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Home, LogOut, Settings, Shield } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { LogoMark } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { tenant, profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/home" || pathname === "/admin";

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="brand-gradient sticky top-0 z-30 safe-top text-primary-foreground shadow-brand">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          {isHome ? (
            <LogoMark className="h-10 w-10 shrink-0" />
          ) : (
            <button
              onClick={() => window.history.back()}
              aria-label="Kembali"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 hover:bg-white/25"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold leading-tight">{title}</p>
            <p className="truncate text-xs text-primary-foreground/80">
              {subtitle ?? tenant?.business_name ?? profile?.full_name ?? "BUCICI"}
            </p>
          </div>
          {actions}
          {!isHome && (
            <Link
              to={role === "super_admin" ? "/admin" : "/home"}
              aria-label="Beranda"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 hover:bg-white/25"
            >
              <Home className="h-5 w-5" />
            </Link>
          )}
          {isHome && (
            <>
              {role === "super_admin" && (
                <Link
                  to="/admin"
                  aria-label="Panel admin"
                  className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 hover:bg-white/25"
                >
                  <Shield className="h-5 w-5" />
                </Link>
              )}
              <Link
                to="/pengaturan"
                aria-label="Pengaturan"
                className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 hover:bg-white/25"
              >
                <Settings className="h-5 w-5" />
              </Link>
              <Button
                onClick={handleSignOut}
                variant="ghost"
                size="icon"
                aria-label="Keluar"
                className="h-10 w-10 rounded-xl bg-white/15 text-primary-foreground hover:bg-white/25 hover:text-primary-foreground"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 safe-bottom">{children}</main>
    </div>
  );
}