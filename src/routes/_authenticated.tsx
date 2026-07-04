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
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ zIndex: 9999, background: "#1c1c1c", overflow: "hidden" }}
    >
      {/* Fondo: cuadrícula de logos con fade radial */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridTemplateRows: "repeat(5, 1fr)",
          gap: 0,
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 28%, black 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 28%, black 80%)",
          opacity: 0.18,
        }}
      >
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img
              src="/api/settings/favicon"
              alt=""
              style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 10 }}
            />
          </div>
        ))}
      </div>

      {/* Halo de luz central */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: 480, height: 480,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(237,86,80,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Contenido principal */}
      <div className="relative flex flex-col items-center gap-6 text-center">
        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute", inset: -12,
              borderRadius: 28,
              background: "rgba(237,86,80,0.12)",
              filter: "blur(16px)",
            }}
          />
          <img
            src="/api/settings/favicon"
            alt="Smart Time Control"
            style={{
              position: "relative",
              width: 72, height: 72,
              objectFit: "contain",
              borderRadius: 18,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
            Smart Time Control
          </h1>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13.5, lineHeight: 1.6, margin: 0, maxWidth: 260 }}>
            Planifica turnos y controla la jornada<br />de todo tu equipo en tiempo real.
          </p>
        </div>

        {/* Dots */}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "rgba(255,255,255,0.25)",
                animation: `stc-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                display: "block",
              }}
            />
          ))}
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
