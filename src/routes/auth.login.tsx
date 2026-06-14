import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Eye, EyeOff, AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Resource } from "@/lib/permissions";
import { UserPlus } from "lucide-react";

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
  const [view, setView] = useState<"login" | "forgot" | "register">("login");

  useEffect(() => {
    if (!loading && user && role) {
      const first = ORDERED_HOME_ROUTES.find(r => hasPermission(r.resource, "view"));
      navigate({ to: first?.to ?? "/", replace: true });
    }
  }, [user, role, loading, navigate, hasPermission]);

  if (view === "forgot")    return <ForgotPasswordView onBack={() => setView("login")} />;
  if (view === "register")  return <RegisterView onBack={() => setView("login")} />;
  return <LoginView onForgot={() => setView("forgot")} onRegister={() => setView("register")} />;
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

function LoginView({ onForgot, onRegister }: { onForgot: () => void; onRegister: () => void }) {
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

        {/* Registro */}
        <div className="relative flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">¿Nuevo en el sistema?</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        <button
          type="button" onClick={onRegister}
          className="w-full flex items-center justify-center gap-2 rounded-pill border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
        >
          <UserPlus className="size-4" /> Crear cuenta
        </button>
      </form>
    </AuthCard>
  );
}

// ── Forgot password view ────────────────────────────────────────────────

function ForgotPasswordView({ onBack }: { onBack: () => void }) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail]         = useState("");
  const [sent, setSent]           = useState(false);
  const [resetUrl, setResetUrl]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [cooldown, setCooldown]   = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await requestPasswordReset(email);
    setLoading(false);
    if (result.error) { setError(result.error); }
    else { setSent(true); setResetUrl(result.resetUrl ?? null); setCooldown(60); }
  }

  if (sent) {
    return (
      <AuthCard title="Enlace generado" subtitle={`Recuperación para ${email}`}>
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="size-14 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="size-7 text-success" />
            </div>
            {resetUrl ? (
              <div className="w-full space-y-2">
                <p className="text-sm text-center text-muted-foreground">
                  Copia este enlace para restablecer tu contraseña:
                </p>
                <div className="rounded-lg border border-border bg-muted px-3 py-2 break-all">
                  <a href={resetUrl} className="text-xs text-primary hover:underline font-mono">{resetUrl}</a>
                </div>
                <p className="text-xs text-center text-muted-foreground">Válido por 1 hora.</p>
              </div>
            ) : (
              <p className="text-sm text-center text-muted-foreground leading-relaxed">
                Si esa dirección está registrada, el administrador puede proporcionarte el enlace de recuperación.
              </p>
            )}
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
              requestPasswordReset(email).then(result => {
                setLoading(false);
                if (result.error) setError(result.error);
                else { setResetUrl(result.resetUrl ?? null); setCooldown(60); }
              });
            }}
            disabled={cooldown > 0 || loading}
            className="w-full rounded-pill border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {loading ? "Generando…" : cooldown > 0 ? `Nuevo enlace en ${cooldown}s` : "Generar nuevo enlace"}
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

// ── Register view ────────────────────────────────────────────────────────

function RegisterView({ onBack }: { onBack: () => void }) {
  const { signUp } = useAuth();
  const [nombre,   setNombre]   = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  const checks  = getPasswordChecks(password);
  const allPass = checks.every((c) => c.ok);
  const match   = password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allPass)  { setError("La contraseña no cumple los requisitos."); return; }
    if (!match)    { setError("Las contraseñas no coinciden."); return; }
    setLoading(true);
    setError(null);
    const result = await signUp(email, password, nombre);
    setLoading(false);
    if (result.error) { setError(result.error); }
    else { setDone(true); }
  }

  if (done) {
    return (
      <AuthCard title="Cuenta creada" subtitle="Ya puedes iniciar sesión">
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="size-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="size-7 text-emerald-500" />
            </div>
            <p className="text-sm text-center text-muted-foreground leading-relaxed">
              Tu cuenta ha sido creada exitosamente. Inicia sesión con tu correo y contraseña.
            </p>
          </div>
          <button
            onClick={onBack}
            className="w-full rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Ir al inicio de sesión
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Crear cuenta" subtitle="Completa los datos para registrarte">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nombre */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
            Nombre completo
          </label>
          <input
            type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Juan Pérez" required autoComplete="name"
            className="w-full border border-border rounded-pill px-4 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>

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
          <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
            Contraseña
          </label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="new-password"
              className="w-full border border-border rounded-pill px-4 py-2.5 pr-11 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            <button
              type="button" onClick={() => setShowPass(v => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {password && <PasswordStrength password={password} />}
        </div>

        {/* Confirmar contraseña */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
            Confirmar contraseña
          </label>
          <input
            type={showPass ? "text" : "password"} value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••" required autoComplete="new-password"
            className={`w-full border rounded-pill px-4 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20 transition-all ${
              confirm && !match ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
            }`}
          />
          {confirm && !match && (
            <p className="text-xs text-destructive">Las contraseñas no coinciden.</p>
          )}
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
          type="submit" disabled={loading || !nombre || !email || !password || !confirm}
          className="w-full rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? "Creando cuenta…" : "Crear cuenta"}
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
