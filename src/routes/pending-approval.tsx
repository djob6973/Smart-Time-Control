import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/pending-approval")({
  head: () => ({ meta: [{ title: "Acceso pendiente · STC" }] }),
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  const { user, role, profile, loading, reloadRole } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!loading && user && role && profile?.activo) navigate({ to: "/" });
  }, [user, role, profile, loading, navigate]);

  const handleVerify = async () => {
    setChecking(true);
    await reloadRole();
    setChecking(false);
  };

  const isInactive = user && profile && !profile.activo;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#232323] px-4">
      {/* Logo */}
      <img
        src="/api/settings/favicon"
        alt="Logo"
        className="size-12 object-contain rounded-xl mb-2"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />

      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 space-y-5 text-center">
          <div className="inline-flex size-12 rounded-full bg-amber-500/10 border border-amber-500/20 items-center justify-center mx-auto">
            {isInactive
              ? <AlertCircle className="size-6 text-amber-400" />
              : <Clock className="size-6 text-amber-400" />
            }
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold text-white">
              {isInactive ? "Cuenta desactivada" : "Sin acceso asignado"}
            </h2>
            <p className="text-sm text-white/50 leading-relaxed">
              {isInactive
                ? "Tu cuenta ha sido desactivada. Contacta al administrador para recuperar el acceso."
                : "Aún no tienes un rol asignado. Contacta al administrador para que te habilite el acceso."
              }
            </p>
          </div>

          {user?.email && (
            <div className="rounded-xl bg-white/5 px-4 py-3 text-sm">
              <span className="text-white/40">Sesión activa como </span>
              <span className="font-medium text-white/80">{user.email}</span>
            </div>
          )}

          {!isInactive && (
            <button
              onClick={handleVerify}
              disabled={checking}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {checking && <Loader2 className="size-4 animate-spin" />}
              {checking ? "Verificando…" : "Verificar acceso"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
