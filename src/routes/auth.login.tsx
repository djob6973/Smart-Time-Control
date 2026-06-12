import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Eye, EyeOff, AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Resource } from "@/lib/permissions";

const ORDERED_HOME_ROUTES: { to: string; resource: Resource }[] = [
  { to: "/",           resource: "dashboard" },
  { to: "/mi-horario", resource: "mi_horario" },
  { to: "/jornada",    resource: "jornada" },
  { to: "/scheduler",  resource: "scheduler" },
  { to: "/employees",  resource: "employees" },
  { to: "/areas",      resource: "areas" },
  { to: "/absences",   resource: "absences" },
  { to: "/reports",    resource: "reports" },
  { to: "/settings",   resource: "settings" },
];

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Iniciar sesión · STC" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user, role, loading, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<"login" | "forgot">("login");

  useEffect(() => {
    if (!loading && user && role) {
      const first = ORDERED_HOME_ROUTES.find(r => hasPermission(r.resource, "view"));
      navigate({ to: first?.to ?? "/", replace: true });
    }
  }, [user, role, loading, navigate, hasPermission]);

  if (view === "forgot") {
    return <ForgotPasswordView onBack={() => setView("login")} />;
  }
  return <LoginView onForgot={() => setView("forgot")} />;
}

// ── Shared card ────────────────────────────────────────────────────────

function AuthCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="text-center mb-8">
          <div className="inline-flex size-14 rounded-card bg-primary items-center justify-center text-2xl font-bold text-primary-foreground shadow-card mb-4 font-display">
            S
          </div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>

        {/* Card */}
        <div className="rounded-card bg-card shadow-card p-8">
          {children}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Smart Time Control · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

// ── Login view ──────────────────────────────────────────────────────────

function LoginView({ onForgot }: { onForgot: () => void }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(
        result.error.includes("Invalid login")
          ? "Correo o contraseña incorrectos."
          : result.error,
      );
    }
  }

  return (
    <AuthCard title="Smart Time Control" subtitle="Smarter scheduling">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
            Correo electrónico
          </label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@empresa.com" required autoComplete="email"
            className="w-full border border-border rounded-pill px-4 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>

        {/* Contraseña */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
              Contraseña
            </label>
            <button
              type="button" onClick={onForgot}
              className="text-xs text-primary hover:underline font-medium"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="current-password"
              className="w-full border border-border rounded-pill px-4 py-2.5 pr-11 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            <button
              type="button" onClick={() => setShowPass(v => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3">
            <AlertCircle className="size-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-primary leading-snug">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit" disabled={loading || !email || !password}
          className="w-full rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? "Iniciando sesión…" : "Iniciar sesión"}
        </button>
      </form>
    </AuthCard>
  );
}

// ── Forgot password view ────────────────────────────────────────────────

function ForgotPasswordView({ onBack }: { onBack: () => void }) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail]       = useState("");
  const [sent, setSent]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await requestPasswordReset(email);
    setLoading(false);
    if (err) { setError(err); } else { setSent(true); setCooldown(60); }
  }

  if (sent) {
    return (
      <AuthCard title="Revisa tu correo" subtitle={`Enviamos un enlace a ${email}`}>
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="size-14 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="size-7 text-success" />
            </div>
            <p className="text-sm text-center text-muted-foreground leading-relaxed">
              Si esa dirección está registrada, recibirás un email con el enlace. Revisa también la carpeta de spam.
            </p>
          </div>
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3">
              <AlertCircle className="size-4 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-primary leading-snug">{error}</p>
            </div>
          )}
          <button
            onClick={() => {
              setLoading(true);
              requestPasswordReset(email).then(err => {
                setLoading(false);
                if (err) setError(err); else setCooldown(60);
              });
            }}
            disabled={cooldown > 0 || loading}
            className="w-full rounded-pill border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {loading ? "Enviando…" : cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar correo"}
          </button>
          <button
            onClick={onBack}
            className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" /> Volver al inicio de sesión
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Recuperar contraseña" subtitle="Te enviaremos un enlace a tu correo">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
            Correo electrónico
          </label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@empresa.com" required autoComplete="email"
            className="w-full border border-border rounded-pill px-4 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3">
            <AlertCircle className="size-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-primary leading-snug">{error}</p>
          </div>
        )}
        <button
          type="submit" disabled={loading || !email}
          className="w-full rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? "Enviando…" : "Enviar enlace de recuperación"}
        </button>
        <button
          type="button" onClick={onBack}
          className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" /> Volver al inicio de sesión
        </button>
      </form>
    </AuthCard>
  );
}

export function getPasswordChecks(password: string) {
  return [
    { ok: password.length >= 8,          label: "Mínimo 8 caracteres" },
    { ok: /[A-Z]/.test(password),         label: "Al menos una mayúscula" },
    { ok: /[0-9]/.test(password),         label: "Al menos un número" },
    { ok: /[^A-Za-z0-9]/.test(password),  label: "Al menos un símbolo" },
  ];
}

export function PasswordStrength({ password }: { password: string }) {
  const checks = getPasswordChecks(password);
  const score  = checks.filter((c) => c.ok).length;
  const colors = ["bg-destructive", "bg-orange-400", "bg-yellow-400", "bg-emerald-400", "bg-emerald-500"];
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {checks.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score] : "bg-muted"}`} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-1 text-xs ${c.ok ? "text-emerald-600" : "text-muted-foreground"}`}>
            <span>{c.ok ? "✓" : "○"}</span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
