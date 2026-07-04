import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Clock, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { selfAssignGestorRole } from "@/lib/api/user-profile";

export const Route = createFileRoute("/pending-approval")({
  head: () => ({ meta: [{ title: "Acceso pendiente · STC" }] }),
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  const { user, role, profile, loading, reloadRole } = useAuth();
  const navigate = useNavigate();
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned]   = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && role && profile?.activo) navigate({ to: "/" });
  }, [user, role, profile, loading, navigate]);

  const handleSelfAssign = async () => {
    if (!user?.id) return;
    setAssigning(true);
    setError(null);
    try {
      await selfAssignGestorRole({ data: { userId: user.id } });
      setAssigned(true);
      await reloadRole();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo asignar el rol. Intenta de nuevo.");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 gap-6"
      style={{ background: "#1a1a1a" }}
    >
      {/* Branding */}
      <div className="flex flex-col items-center gap-2">
        <img
          src="/api/settings/favicon"
          alt="Smart Time Control"
          className="size-14 object-contain rounded-2xl"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <p style={{ color: "#fff", fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Smart Time Control
        </p>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>
          Sistema de Turnos
        </p>
      </div>

      {/* Card */}
      <div
        className="w-full flex flex-col items-center gap-5 p-8"
        style={{
          maxWidth: 420,
          borderRadius: 18,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Icono */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "rgba(237,86,80,0.12)",
            border: "1px solid rgba(237,86,80,0.25)",
          }}
        >
          <Clock size={20} style={{ color: "#ED5650" }} />
        </div>

        {/* Título y descripción */}
        <div className="flex flex-col items-center gap-3 text-center">
          <p style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}>
            Cuenta pendiente de aprobación
          </p>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13.5, lineHeight: 1.7 }}>
            Un administrador revisará tu acceso y te asignará un rol en breve.
          </p>
          {!assigned && (
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13.5, lineHeight: 1.7 }}>
              Si deseas puedes continuar con el rol{" "}
              <strong style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>Gestor</strong>
              , por favor haz clic en continuar.
            </p>
          )}
          {user?.email && (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12.5 }}>
              Sesión iniciada como{" "}
              <span style={{ color: "rgba(255,255,255,0.55)" }}>{user.email}</span>
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              width: "100%", borderRadius: 10,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              padding: "10px 14px", fontSize: 13,
              color: "rgba(239,68,68,0.85)",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* Botón */}
        {assigned ? (
          <div
            className="flex items-center justify-center gap-2 w-full"
            style={{
              height: 46, borderRadius: 12, fontSize: 14, fontWeight: 500,
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.2)",
              color: "rgba(34,197,94,0.9)",
            }}
          >
            <CheckCircle2 size={16} />
            Rol asignado — redirigiendo…
          </div>
        ) : (
          <button
            onClick={handleSelfAssign}
            disabled={assigning}
            className="flex items-center justify-center gap-2 w-full"
            style={{
              height: 46, borderRadius: 12, fontSize: 14, fontWeight: 500,
              background: assigning ? "rgba(237,86,80,0.4)" : "#ED5650",
              color: "#fff",
              border: "none",
              cursor: assigning ? "not-allowed" : "pointer",
              transition: "opacity 150ms",
            }}
          >
            {assigning && <Loader2 size={15} className="animate-spin" />}
            {assigning ? "Asignando rol…" : "Continuar como Gestor"}
          </button>
        )}
      </div>

      {/* Footer */}
      <p style={{ color: "rgba(255,255,255,0.18)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>
        Smart Time Control · Planifica turnos y controla la jornada
      </p>
    </div>
  );
}
