import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { selfAssignGestorRole } from "@/lib/api/user-profile";

export const Route = createFileRoute("/pending-approval")({
  head: () => ({ meta: [{ title: "Acceso pendiente · STC" }] }),
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  const { user, role, profile, loading, reloadRole } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking]     = useState(false);
  const [assigning, setAssigning]   = useState(false);
  const [assigned, setAssigned]     = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && role && profile?.activo) navigate({ to: "/" });
  }, [user, role, profile, loading, navigate]);

  const isInactive = user && profile && !profile.activo;

  const handleVerify = async () => {
    setChecking(true);
    await reloadRole();
    setChecking(false);
  };

  const handleSelfAssign = async () => {
    if (!user?.id) return;
    setAssigning(true);
    setError(null);
    try {
      await selfAssignGestorRole({ data: { userId: user.id } });
      setAssigned(true);
      // Recarga el rol — si todo salió bien, la app redirige sola
      await reloadRole();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo asignar el rol. Intenta de nuevo.");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 gap-8"
      style={{ background: "#232323" }}
    >
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <img
          src="/api/settings/favicon"
          alt="Smart Time Control"
          className="size-12 object-contain rounded-xl"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
          Smart Time Control
        </span>
      </div>

      {/* Card principal */}
      <div
        className="w-full flex flex-col gap-0 overflow-hidden"
        style={{
          maxWidth: 400,
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        {/* Sección: pendiente de aprobación */}
        <div className="flex flex-col gap-4 p-7" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-start gap-3">
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: "rgba(251,191,36,0.12)",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
            >
              {isInactive
                ? <AlertCircle size={17} style={{ color: "#FBBF24" }} />
                : <Loader2 size={17} style={{ color: "#FBBF24" }} className={!isInactive ? "animate-spin" : ""} />
              }
            </div>
            <div className="flex flex-col gap-1">
              <p style={{ color: "#fff", fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
                {isInactive ? "Cuenta desactivada" : "Cuenta pendiente de aprobación"}
              </p>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, lineHeight: 1.6 }}>
                {isInactive
                  ? "Tu cuenta ha sido desactivada. Contacta al administrador para recuperar el acceso."
                  : "Un administrador revisará tu acceso y te asignará un rol en breve."
                }
              </p>
            </div>
          </div>

          {user?.email && (
            <div
              style={{
                borderRadius: 10, background: "rgba(255,255,255,0.05)",
                padding: "10px 14px", fontSize: 12.5,
                color: "rgba(255,255,255,0.35)",
              }}
            >
              Sesión activa como{" "}
              <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>{user.email}</span>
            </div>
          )}

          {/* Verificar acceso */}
          <button
            onClick={handleVerify}
            disabled={checking}
            className="flex items-center justify-center gap-2"
            style={{
              height: 38, borderRadius: 10, fontSize: 13, fontWeight: 500,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.6)",
              cursor: checking ? "not-allowed" : "pointer",
              opacity: checking ? 0.6 : 1,
              transition: "background 150ms",
            }}
          >
            {checking
              ? <><Loader2 size={14} className="animate-spin" /> Verificando…</>
              : <><RefreshCw size={14} /> Verificar acceso</>
            }
          </button>
        </div>

        {/* Sección: auto-asignación Gestor */}
        {!isInactive && (
          <div className="flex flex-col gap-4 p-7">
            <div className="flex flex-col gap-1.5">
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13.5, fontWeight: 500 }}>
                ¿No quieres esperar?
              </p>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, lineHeight: 1.6 }}>
                Si deseas puedes continuar ahora mismo con el rol{" "}
                <span
                  style={{
                    color: "rgba(255,255,255,0.7)", fontWeight: 600,
                    background: "rgba(255,255,255,0.07)",
                    padding: "1px 7px", borderRadius: 6, fontSize: 12.5,
                  }}
                >
                  Gestor
                </span>
                . Un administrador podrá ajustar tu rol más adelante.
              </p>
            </div>

            {error && (
              <div
                style={{
                  borderRadius: 10, background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  padding: "10px 14px", fontSize: 12.5,
                  color: "rgba(239,68,68,0.85)",
                }}
              >
                {error}
              </div>
            )}

            {assigned ? (
              <div
                className="flex items-center gap-2"
                style={{
                  height: 44, borderRadius: 12, fontSize: 14, fontWeight: 500,
                  background: "rgba(34,197,94,0.1)",
                  border: "1px solid rgba(34,197,94,0.2)",
                  color: "rgba(34,197,94,0.9)",
                  paddingInline: 16,
                }}
              >
                <CheckCircle2 size={16} />
                Rol asignado — redirigiendo…
              </div>
            ) : (
              <button
                onClick={handleSelfAssign}
                disabled={assigning}
                className="flex items-center justify-between"
                style={{
                  height: 44, borderRadius: 12, fontSize: 14, fontWeight: 500,
                  background: assigning ? "rgba(237,86,80,0.15)" : "#ED5650",
                  color: "#fff",
                  paddingInline: 16,
                  cursor: assigning ? "not-allowed" : "pointer",
                  opacity: assigning ? 0.7 : 1,
                  transition: "opacity 150ms, background 150ms",
                  border: "none",
                }}
              >
                <span>{assigning ? "Asignando rol…" : "Continuar como Gestor"}</span>
                {assigning
                  ? <Loader2 size={16} className="animate-spin" />
                  : <ArrowRight size={16} />
                }
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
