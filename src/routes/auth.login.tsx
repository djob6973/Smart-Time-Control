import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Eye, EyeOff, AlertCircle, ArrowLeft, CheckCircle2, UserPlus, Lock, Mail } from "lucide-react";
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
  const { user, role, loading, roleLoading, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<"login" | "forgot" | "register">("login");

  useEffect(() => {
    if (loading || roleLoading) return;
    if (user && role) {
      const first = ORDERED_HOME_ROUTES.find(r => hasPermission(r.resource, "view"));
      navigate({ to: first?.to ?? "/", replace: true });
    } else if (user && !role) {
      navigate({ to: "/pending-approval", replace: true });
    }
  }, [user, role, loading, roleLoading, navigate, hasPermission]);

  if (view === "forgot")   return <ForgotPasswordView onBack={() => setView("login")} />;
  if (view === "register") return <RegisterView onBack={() => setView("login")} />;
  return <LoginView onForgot={() => setView("forgot")} onRegister={() => setView("register")} />;
}

// ── Org logo (usa el cargado en Configuración o el SVG por defecto) ────

function OrgLogo({ size = 40 }: { size?: number }) {
  const [hasLogo, setHasLogo] = useState<boolean | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload  = () => setHasLogo(true);
    img.onerror = () => setHasLogo(false);
    img.src = "/api/settings/favicon";
  }, []);

  if (hasLogo) {
    return (
      <img
        src="/api/settings/favicon"
        alt="Logo"
        style={{ width: size, height: size, objectFit: "contain", borderRadius: 8 }}
      />
    );
  }

  // ">>" SVG por defecto
  return (
    <svg width={size} height={size} viewBox="0 0 46 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M46.1925 30.005L46.1686 30.029L28.1995 12.047L34.9224 5.319L46.3073 16.712C49.8935 20.426 49.86 26.34 46.1973 30.005H46.1925Z" fill="#ED5650"/>
      <path d="M46.1736 43.513L34.9369 54.758L28.1997 48.016L46.1736 30.029C49.8937 33.757 49.8937 39.786 46.1736 43.508V43.513Z" fill="#ED5650"/>
      <path d="M21.9931 30.005L21.9692 30.029L4 12.047L10.7229 5.319L22.1078 16.712C25.694 20.426 25.6605 26.34 21.9978 30.005H21.9931Z" fill="#ED5650"/>
      <path d="M21.9739 43.513L10.7372 54.758L4 48.021L21.9739 30.034C25.694 33.761 25.694 39.79 21.9739 43.513Z" fill="#ED5650"/>
    </svg>
  );
}

// ── Right panel content (compartido por todas las vistas) ─────────────

function RightPanel() {
  const features = [
    "Cálculo automático de recargos y horas extra (HED · HEN · RN)",
    "Control de jornada con check-in y check-out en vivo",
    "Alertas operativas y reportes listos para nómina",
  ];

  return (
    <div
      className="hidden lg:flex lg:w-1/2 flex-col relative overflow-hidden"
      style={{ background: "#161616" }}
    >
      {/* Watermark pattern */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='90' viewBox='0 0 46 50' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M46.1925 30.005L46.1686 30.029L28.1995 12.047L34.9224 5.319L46.3073 16.712C49.8935 20.426 49.86 26.34 46.1973 30.005H46.1925Z' fill='white'/%3E%3Cpath d='M46.1736 43.513L34.9369 54.758L28.1997 48.016L46.1736 30.029C49.8937 33.757 49.8937 39.786 46.1736 43.508V43.513Z' fill='white'/%3E%3Cpath d='M21.9931 30.005L21.9692 30.029L4 12.047L10.7229 5.319L22.1078 16.712C25.694 20.426 25.6605 26.34 21.9978 30.005H21.9931Z' fill='white'/%3E%3Cpath d='M21.9739 43.513L10.7372 54.758L4 48.021L21.9739 30.034C25.694 33.761 25.694 39.79 21.9739 43.513Z' fill='white'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "120px 135px",
        }}
      />

      <div className="relative z-10 flex flex-col h-full p-12">
        {/* Top label */}
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: "#4a4a4a" }}
        >
          Sistema // Operaciones
        </p>

        {/* Main content */}
        <div className="flex-1 flex flex-col justify-center max-w-md">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 w-fit mb-8"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <span className="size-1.5 rounded-full bg-[#ED5650]" />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "#a0a0a0" }}
            >
              Cumplimiento laboral
            </span>
          </div>

          {/* Heading */}
          <h2 className="text-[2.4rem] font-bold leading-[1.15] text-white mb-5">
            Planifica turnos y controla la jornada de todo tu equipo en tiempo real.
          </h2>

          {/* Red line */}
          <div className="w-10 h-0.5 bg-[#ED5650] mb-6" />

          {/* Body */}
          <p className="text-sm leading-relaxed mb-10" style={{ color: "#888" }}>
            Smart Time Control programa horarios, registra entradas y calcula recargos y horas extra — listo para tu nómina y la ley colombiana.
          </p>

          {/* Features */}
          <ul className="space-y-3.5">
            {features.map(f => (
              <li key={f} className="flex items-start gap-3">
                <svg width="18" height="18" viewBox="0 0 46 50" fill="none" className="shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg">
                  <path d="M46.1925 30.005L46.1686 30.029L28.1995 12.047L34.9224 5.319L46.3073 16.712C49.8935 20.426 49.86 26.34 46.1973 30.005H46.1925Z" fill="#ED5650"/>
                  <path d="M46.1736 43.513L34.9369 54.758L28.1997 48.016L46.1736 30.029C49.8937 33.757 49.8937 39.786 46.1736 43.508V43.513Z" fill="#ED5650"/>
                  <path d="M21.9931 30.005L21.9692 30.029L4 12.047L10.7229 5.319L22.1078 16.712C25.694 20.426 25.6605 26.34 21.9978 30.005H21.9931Z" fill="#ED5650"/>
                  <path d="M21.9739 43.513L10.7372 54.758L4 48.021L21.9739 30.034C25.694 33.761 25.694 39.79 21.9739 43.513Z" fill="#ED5650"/>
                </svg>
                <span className="text-sm" style={{ color: "#888" }}>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom */}
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "#333" }}
        >
          Smart Time Control · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

// ── Split layout wrapper ───────────────────────────────────────────────

function SplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-white">
      {/* Left panel — 50% */}
      <div className="flex flex-col w-full lg:w-1/2">
        {/* Logo header */}
        <div className="px-14 pt-10 flex items-center gap-3.5">
          <OrgLogo size={44} />
          <div>
            <p className="text-base font-bold tracking-tight text-gray-900 leading-none">Smart Time Control</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400 mt-1">Smarter Scheduling</p>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 flex items-center justify-center px-14 py-10">
          <div className="w-full max-w-md">
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="px-14 pb-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-300 flex items-center gap-1.5">
            <Lock className="size-3" />
            Smart Time Control · Control de Jornada Seguro
          </p>
        </div>
      </div>

      {/* Right panel — 50% */}
      <RightPanel />
    </div>
  );
}

// ── Login view ─────────────────────────────────────────────────────────

function LoginView({ onForgot, onRegister }: { onForgot: () => void; onRegister: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
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
    <SplitLayout>
      <div className="space-y-8">
        {/* Heading */}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Bienvenido de vuelta</h1>
          <p className="text-base text-gray-500 mt-2 leading-snug">
            Inicia sesión para gestionar turnos, jornadas y reportes de tu equipo.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.12em]">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="usuario@empresa.com" required autoComplete="email"
                className="w-full border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-base outline-none focus:ring-2 focus:ring-[#ED5650]/20 focus:border-[#ED5650]/60 transition-all bg-white text-gray-900 placeholder:text-gray-300"
              />
            </div>
          </div>

          {/* Contraseña */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.12em]">
                Contraseña
              </label>
              <button
                type="button" onClick={onForgot}
                className="text-sm text-[#ED5650] hover:underline font-medium"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
              <input
                type={showPass ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password"
                className="w-full border border-gray-200 rounded-xl pl-11 pr-12 py-3 text-base outline-none focus:ring-2 focus:ring-[#ED5650]/20 focus:border-[#ED5650]/60 transition-all bg-white text-gray-900"
              />
              <button
                type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPass ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>

          {/* Recordar equipo */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setRemember(v => !v)}
              className={`size-5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                remember ? "bg-[#ED5650] border-[#ED5650]" : "border-gray-300 bg-white"
              }`}
            >
              {remember && (
                <svg className="size-3 text-white" viewBox="0 0 12 10" fill="none">
                  <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="text-sm text-gray-600">Recordar este equipo durante 30 días</span>
          </label>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
              <AlertCircle className="size-4 text-[#ED5650] shrink-0 mt-0.5" />
              <p className="text-sm text-[#ED5650] leading-snug">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit" disabled={loading || !email || !password}
            className="w-full rounded-xl py-3.5 text-base font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ background: "#ED5650" }}
          >
            {loading ? "Iniciando sesión…" : "Iniciar sesión"}
          </button>
        </form>

        {/* Registro */}
        <div className="space-y-3.5">
          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-sm text-gray-400">¿Nuevo en el sistema?</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <button
            type="button" onClick={onRegister}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3.5 text-base font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <UserPlus className="size-5" /> Crear cuenta
          </button>
        </div>
      </div>
    </SplitLayout>
  );
}

// ── Forgot password view ───────────────────────────────────────────────

function ForgotPasswordView({ onBack }: { onBack: () => void }) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail]       = useState("");
  const [sent, setSent]         = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
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
    const result = await requestPasswordReset(email);
    setLoading(false);
    if (result.error) { setError(result.error); }
    else { setSent(true); setResetUrl(result.resetUrl ?? null); setCooldown(60); }
  }

  if (sent) {
    return (
      <SplitLayout>
        <div className="space-y-6">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="size-4" /> Volver
          </button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Enlace generado</h1>
            <p className="text-sm text-gray-500 mt-1">Recuperación para {email}</p>
          </div>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="size-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="size-7 text-emerald-500" />
            </div>
            {resetUrl ? (
              <div className="w-full space-y-2">
                <p className="text-sm text-center text-gray-500">Copia este enlace para restablecer tu contraseña:</p>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 break-all">
                  <a href={resetUrl} className="text-xs text-[#ED5650] hover:underline font-mono">{resetUrl}</a>
                </div>
                <p className="text-xs text-center text-gray-400">Válido por 1 hora.</p>
              </div>
            ) : (
              <p className="text-sm text-center text-gray-500 leading-relaxed">
                Si esa dirección está registrada, el administrador puede proporcionarte el enlace de recuperación.
              </p>
            )}
          </div>
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3">
              <AlertCircle className="size-4 text-[#ED5650] shrink-0 mt-0.5" />
              <p className="text-sm text-[#ED5650] leading-snug">{error}</p>
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
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {loading ? "Generando…" : cooldown > 0 ? `Nuevo enlace en ${cooldown}s` : "Generar nuevo enlace"}
          </button>
        </div>
      </SplitLayout>
    );
  }

  return (
    <SplitLayout>
      <div className="space-y-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="size-4" /> Volver
        </button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Recuperar contraseña</h1>
          <p className="text-sm text-gray-500 mt-1.5">Te generaremos un enlace de recuperación.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.12em]">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="usuario@empresa.com" required autoComplete="email"
                className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#ED5650]/20 focus:border-[#ED5650]/60 transition-all bg-white text-gray-900 placeholder:text-gray-300"
              />
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3">
              <AlertCircle className="size-4 text-[#ED5650] shrink-0 mt-0.5" />
              <p className="text-sm text-[#ED5650] leading-snug">{error}</p>
            </div>
          )}
          <button
            type="submit" disabled={loading || !email}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ background: "#ED5650" }}
          >
            {loading ? "Enviando…" : "Enviar enlace de recuperación"}
          </button>
        </form>
      </div>
    </SplitLayout>
  );
}

// ── Register view ──────────────────────────────────────────────────────

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
  const allPass = checks.every(c => c.ok);
  const match   = password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allPass) { setError("La contraseña no cumple los requisitos."); return; }
    if (!match)   { setError("Las contraseñas no coinciden."); return; }
    setLoading(true);
    setError(null);
    const result = await signUp(email, password, nombre);
    setLoading(false);
    if (result.error) { setError(result.error); }
    else { setDone(true); }
  }

  if (done) {
    return (
      <SplitLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Cuenta creada</h1>
            <p className="text-sm text-gray-500 mt-1">Ya puedes iniciar sesión</p>
          </div>
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="size-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="size-7 text-emerald-500" />
            </div>
            <p className="text-sm text-center text-gray-500 leading-relaxed">
              Tu cuenta ha sido creada exitosamente. Inicia sesión con tu correo y contraseña.
            </p>
          </div>
          <button
            onClick={onBack}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ background: "#ED5650" }}
          >
            Ir al inicio de sesión
          </button>
        </div>
      </SplitLayout>
    );
  }

  return (
    <SplitLayout>
      <div className="space-y-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="size-4" /> Volver
        </button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Crear cuenta</h1>
          <p className="text-sm text-gray-500 mt-1.5">Completa los datos para registrarte.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.12em]">Nombre completo</label>
            <input
              type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Juan Pérez" required autoComplete="name"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#ED5650]/20 focus:border-[#ED5650]/60 transition-all bg-white text-gray-900 placeholder:text-gray-300"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.12em]">Correo electrónico</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="usuario@empresa.com" required autoComplete="email"
                className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#ED5650]/20 focus:border-[#ED5650]/60 transition-all bg-white text-gray-900 placeholder:text-gray-300"
              />
            </div>
          </div>

          {/* Contraseña */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.12em]">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
              <input
                type={showPass ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="new-password"
                className="w-full border border-gray-200 rounded-xl pl-10 pr-11 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#ED5650]/20 focus:border-[#ED5650]/60 transition-all bg-white text-gray-900"
              />
              <button
                type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {password && <PasswordStrength password={password} />}
          </div>

          {/* Confirmar */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.12em]">Confirmar contraseña</label>
            <input
              type={showPass ? "text" : "password"} value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••" required autoComplete="new-password"
              className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 transition-all bg-white text-gray-900 ${
                confirm && !match
                  ? "border-red-300 focus:ring-red-100 focus:border-red-400"
                  : "border-gray-200 focus:ring-[#ED5650]/20 focus:border-[#ED5650]/60"
              }`}
            />
            {confirm && !match && <p className="text-xs text-[#ED5650]">Las contraseñas no coinciden.</p>}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3">
              <AlertCircle className="size-4 text-[#ED5650] shrink-0 mt-0.5" />
              <p className="text-sm text-[#ED5650] leading-snug">{error}</p>
            </div>
          )}

          <button
            type="submit" disabled={loading || !nombre || !email || !password || !confirm}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ background: "#ED5650" }}
          >
            {loading ? "Creando cuenta…" : "Crear cuenta"}
          </button>
        </form>
      </div>
    </SplitLayout>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

export function getPasswordChecks(password: string) {
  return [
    { ok: password.length >= 8,         label: "Mínimo 8 caracteres" },
    { ok: /[A-Z]/.test(password),        label: "Al menos una mayúscula" },
    { ok: /[0-9]/.test(password),        label: "Al menos un número" },
    { ok: /[^A-Za-z0-9]/.test(password), label: "Al menos un símbolo" },
  ];
}

export function PasswordStrength({ password }: { password: string }) {
  const checks = getPasswordChecks(password);
  const score  = checks.filter(c => c.ok).length;
  const colors = ["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-emerald-400", "bg-emerald-500"];
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {checks.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score] : "bg-gray-200"}`} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {checks.map(c => (
          <li key={c.label} className={`flex items-center gap-1 text-xs ${c.ok ? "text-emerald-600" : "text-gray-400"}`}>
            <span>{c.ok ? "✓" : "○"}</span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
