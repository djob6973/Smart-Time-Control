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
function BrandSplash() {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#222222", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* Fondo: cuadrícula de logos que se desvanece de izquierda a derecha */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gridTemplateRows: "repeat(6, 1fr)",
          maskImage: "linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 35%, transparent 65%)",
          WebkitMaskImage: "linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 35%, transparent 65%)",
        }}
      >
        {Array.from({ length: 36 }).map((_, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <img
              src="/api/settings/favicon"
              alt=""
              style={{ width: 52, height: 52, objectFit: "contain", borderRadius: 12, opacity: 0.9 }}
            />
          </div>
        ))}
      </div>

      {/* Contenido central */}
      <div
        style={{
          position: "relative",
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 28, textAlign: "center",
        }}
      >
        {/* Logo + nombre en horizontal */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img
            src="/api/settings/favicon"
            alt="Smart Time Control"
            style={{ width: 42, height: 42, objectFit: "contain", borderRadius: 10 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <div style={{ textAlign: "left" }}>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
              Smart Time Control
            </div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 3 }}>
              Sistema de Turnos
            </div>
          </div>
        </div>

        {/* Tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0, maxWidth: 380 }}>
          <p style={{
            color: "#fff", fontSize: 28, fontWeight: 700,
            lineHeight: 1.3, margin: 0, letterSpacing: "-0.02em",
          }}>
            Planifica turnos y controla<br />
            la jornada de todo tu equipo<br />
            en tiempo real.
          </p>
          {/* Línea roja */}
          <div style={{ width: 60, height: 3, background: "#ED5650", borderRadius: 2, margin: "20px auto 0" }} />
        </div>
      </div>

      <style>{`
        @keyframes stc-pulse {
          0%, 100% { opacity: 0.25; transform: scale(0.75); }
          50%       { opacity: 1;    transform: scale(1); }
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
