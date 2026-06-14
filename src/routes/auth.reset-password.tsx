import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { resetPassword, useAuth } from "@/lib/auth";
import { getPasswordChecks, PasswordStrength } from "./auth.login";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Nueva contraseña · STC" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState(false);

  // Read reset token from URL search params
  const token =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("token") ?? ""
      : "";

  const score    = getPasswordChecks(password).filter((c) => c.ok).length;
  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;
  const canSubmit = password.length >= 8 && password === confirm && !saving && score >= 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (!token) {
      setError("Enlace de recuperación inválido. Solicita uno nuevo.");
      return;
    }
    setSaving(true);
    setError(null);
    const err = await resetPassword(token, password);
    if (err) { setError(err); setSaving(false); }
    else { setDone(true); setSaving(false); setTimeout(() => navigate({ to: "/auth/login" }), 2000); }
  }

  if (!token && !done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex size-14 rounded-2xl bg-primary items-center justify-center text-2xl font-bold text-primary-foreground shadow-lg mb-4">W</div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Enlace inválido</h1>
          <p className="text-sm text-muted-foreground mb-6">Este enlace de recuperación no es válido o ha expirado.</p>
          <button
            onClick={() => navigate({ to: "/auth/login" })}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex size-14 rounded-2xl bg-primary items-center justify-center text-2xl font-bold text-primary-foreground shadow-lg mb-4">W</div>
          <h1 className="text-2xl font-bold tracking-tight">
            {done ? "Contraseña actualizada" : "Nueva contraseña"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {done ? "Tu nueva contraseña ha sido guardada" : "Establece tu nueva contraseña de acceso"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-7 shadow-soft">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="size-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="size-7 text-emerald-600" />
              </div>
              <p className="text-sm text-center text-muted-foreground">Redirigiendo al inicio de sesión…</p>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mt-2" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <input type={showPass ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres" required autoComplete="new-password"
                    className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-sm bg-card outline-none focus:ring-2 transition-all ${tooShort ? "border-destructive focus:ring-destructive/20" : "border-input focus:ring-primary/20 focus:border-primary"}`}
                  />
                  <button type="button" onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {tooShort && <p className="mt-1 text-xs text-destructive">Mínimo 8 caracteres.</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Confirmar contraseña
                </label>
                <div className="relative">
                  <input type={showConf ? "text" : "password"} value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repite la contraseña" required autoComplete="new-password"
                    className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-sm bg-card outline-none focus:ring-2 transition-all ${mismatch ? "border-destructive focus:ring-destructive/20" : "border-input focus:ring-primary/20 focus:border-primary"}`}
                  />
                  <button type="button" onClick={() => setShowConf((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showConf ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {mismatch && <p className="mt-1 text-xs text-destructive">Las contraseñas no coinciden.</p>}
              </div>
              {password.length > 0 && <PasswordStrength password={password} />}
              {error && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                    <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive leading-snug">{error}</p>
                  </div>
                </div>
              )}
              <button type="submit" disabled={!canSubmit}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saving ? "Guardando…" : "Establecer contraseña"}
              </button>
              <button type="button" onClick={signOut} className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors">
                Cancelar y cerrar sesión
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
