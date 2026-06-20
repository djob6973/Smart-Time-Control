import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, LogOut, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/pending-approval")({
  head: () => ({ meta: [{ title: "Acceso pendiente · STC" }] }),
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  const { user, role, profile, loading, signOut, reloadRole } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!loading && user && role && profile?.activo) navigate({ to: "/" });
    if (!loading && !user) navigate({ to: "/auth/login" });
  }, [user, role, profile, loading, navigate]);

  const handleVerify = async () => {
    setChecking(true);
    await reloadRole();
    setChecking(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth/login" });
  };

  const isInactive = user && profile && !profile.activo;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm space-y-5">
          <div className="inline-flex size-12 rounded-full bg-amber-100 border border-amber-200 items-center justify-center mx-auto">
            {isInactive
              ? <AlertCircle className="size-6 text-amber-600" />
              : <Clock className="size-6 text-amber-600" />
            }
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">
              {isInactive ? "Cuenta desactivada" : "Sin acceso asignado"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isInactive
                ? "Tu cuenta ha sido desactivada. Contacta al administrador para recuperar el acceso."
                : "Actualmente no tienes un rol y área asignada. Por favor contacta al administrador."
              }
            </p>
          </div>
          {user?.email && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Registrado como </span>
              <span className="font-medium">{user.email}</span>
            </div>
          )}
          <div className="flex gap-3">
            {!isInactive && (
              <button onClick={handleVerify} disabled={checking}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-input bg-background text-sm font-medium rounded-md hover:bg-accent disabled:opacity-60">
                {checking && <Loader2 className="size-4 animate-spin" />}
                {checking ? "Verificando…" : "Verificar acceso"}
              </button>
            )}
            <button onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-accent">
              <LogOut className="size-4" />Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
