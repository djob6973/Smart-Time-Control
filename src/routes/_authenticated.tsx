import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/wfm/Sidebar";
import { useWFM } from "@/lib/wfm/store";
import { AppProvider } from "@/lib/app-context";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AppLoader({ children }: { children: React.ReactNode }) {
  const { initFromDB, initialized, loading } = useWFM();

  useEffect(() => {
    if (!initialized) initFromDB();
  }, [initialized, initFromDB]);

  if (!initialized || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm">Cargando datos…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AuthenticatedLayout() {
  const { user, role, profile, loading, roleLoading, isPending } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  // Reset ready whenever the user identity changes (logout → re-login without full page reload)
  useEffect(() => {
    setReady(false);
  }, [user?.id]);

  useEffect(() => {
    if (loading || roleLoading) return;
    if (!user) { navigate({ to: "/auth/login", replace: true }); return; }
    if (isPending || (profile && !profile.activo)) {
      navigate({ to: "/pending-approval", replace: true });
      return;
    }
    if (role) setReady(true);
  }, [user, role, profile, loading, roleLoading, isPending, navigate]);

  if (loading || roleLoading || !ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Cargando tu cuenta…</p>
      </div>
    );
  }

  return (
    <AppLoader>
      <AppProvider>
        <div className="flex min-h-screen bg-background">
          <Sidebar />
          {/* Main content — da espacio derecho al sidebar flotante */}
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden lg:ml-0">
            <Outlet />
          </main>
        </div>
      </AppProvider>
    </AppLoader>
  );
}
