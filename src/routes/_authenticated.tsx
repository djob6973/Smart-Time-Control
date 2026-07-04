import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/wfm/Sidebar";
import { useWFM } from "@/lib/wfm/store";
import { AppProvider } from "@/lib/app-context";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

// ── Splash de marca ────────────────────────────────────────────────────────────
// Se muestra mientras se resuelve la identidad del usuario.
function BrandSplash() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-8 bg-[#232323]"
      style={{ zIndex: 9999 }}
    >
      {/* Logo */}
      <div className="flex flex-col items-center gap-5">
        <img
          src="/api/settings/favicon"
          alt="Logo"
          className="size-16 object-contain rounded-xl"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <div className="text-center space-y-2">
          <h1 className="text-white text-2xl font-bold tracking-tight">
            Smart Time Control
          </h1>
          <p className="text-white/50 text-sm max-w-xs leading-relaxed text-center">
            Planifica turnos y controla la jornada de<br />
            todo tu equipo en tiempo real.
          </p>
        </div>
      </div>

      {/* Indicador de carga */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-white/30"
            style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── App loader (datos WFM) ─────────────────────────────────────────────────────
function AppLoader({ children }: { children: React.ReactNode }) {
  const { initFromDB, initialized, loading } = useWFM();

  useEffect(() => {
    if (!initialized) initFromDB();
  }, [initialized, initFromDB]);

  if (!initialized || loading) return <BrandSplash />;

  return <>{children}</>;
}

// ── Layout autenticado ─────────────────────────────────────────────────────────
function AuthenticatedLayout() {
  const { user, role, profile, loading, roleLoading, isPending } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => { setReady(false); }, [user?.id]);

  useEffect(() => {
    if (loading || roleLoading) return;
    // Sin usuario → acceso no concedido por el perímetro (solo ocurre en dev sin DEV_USER_EMAIL)
    if (!user) { navigate({ to: "/pending-approval", replace: true }); return; }
    if (isPending || (profile && !profile.activo)) {
      navigate({ to: "/pending-approval", replace: true });
      return;
    }
    if (role) setReady(true);
  }, [user, role, profile, loading, roleLoading, isPending, navigate]);

  if (loading || roleLoading || !ready) return <BrandSplash />;

  return (
    <AppLoader>
      <AppProvider>
        <div className="flex min-h-screen bg-background lg:p-4 lg:items-start lg:gap-4">
          <Sidebar />
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <Outlet />
          </main>
        </div>
      </AppProvider>
    </AppLoader>
  );
}
