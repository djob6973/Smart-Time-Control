import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, UserPlus } from "lucide-react";
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

// ── STC anagram SVG paths (reutilizado en varios lugares) ─────────────────
const STC_PATHS = (
  <>
    <path d="M82.1925 882.245L82.1686 882.269L64.1995 864.287L70.9224 857.559L82.3073 868.952C85.8935 872.666 85.86 878.58 82.1973 882.245H82.1925Z" />
    <path d="M82.1736 895.753L70.9369 906.998L64.1997 900.256L82.1736 882.269C85.8937 885.997 85.8937 892.026 82.1736 895.748V895.753Z" />
    <path d="M57.9931 882.245L57.9692 882.269L40 864.287L46.7229 857.559L58.1078 868.952C61.694 872.666 61.6605 878.58 57.9978 882.245H57.9931Z" />
    <path d="M57.9739 895.753L46.7372 906.998L40 900.261L57.9739 882.274C61.694 886.001 61.694 892.03 57.9739 895.753Z" />
  </>
);

// ── Org logo — caja charcoal con logo de org o ícono STC ─────────────────
function OrgLogoBox({ size = 46 }: { size?: number }) {
  const [hasLogo, setHasLogo] = useState<boolean | null>(null);
  const r = Math.round(size * 0.26); // border-radius ~12px para 46px

  useEffect(() => {
    const img = new Image();
    img.onload  = () => setHasLogo(true);
    img.onerror = () => setHasLogo(false);
    img.src = "/api/settings/favicon";
  }, []);

  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: r,
        background: "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {hasLogo ? (
        <img
          src="/api/settings/favicon"
          alt="Logo"
          style={{ width: size, height: size, objectFit: "cover" }}
        />
      ) : (
        <svg
          viewBox="0 0 53.89 58.76"
          width={Math.round(size * 0.48)}
          height={Math.round(size * 0.48)}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <g transform="translate(-36 -852.24)" fill="#ED5650">
            {STC_PATHS}
          </g>
        </svg>
      )}
    </div>
  );
}

// ── Right panel ───────────────────────────────────────────────────────────
function RightPanel() {
  const features = [
    "Cálculo automático de recargos y horas extra (HED · HEN · RN)",
    "Control de jornada con check-in y check-out en vivo",
    "Alertas operativas y reportes listos para nómina",
  ];

  return (
    <section
      className="hidden lg:flex lg:w-1/2 flex-col relative overflow-hidden"
      style={{ background: "#232323" }}
    >
      {/* Watermark anagram */}
      <svg
        viewBox="0 0 53.89 58.76"
        width="560" height="560"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{
          position: "absolute",
          right: -120,
          bottom: -90,
          color: "rgba(255,255,255,0.04)",
          pointerEvents: "none",
        }}
      >
        <g transform="translate(-36 -852.24)" fill="currentColor">
          {STC_PATHS}
        </g>
      </svg>

      <div
        className="relative z-10 flex flex-col h-full"
        style={{ padding: "48px 60px" }}
      >
        {/* Top label */}
        <p style={{
          fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
          fontSize: 11,
          letterSpacing: "0.16em",
          color: "#7A7A7A",
          textTransform: "uppercase",
        }}>
          SISTEMA // OPERACIONES
        </p>

        {/* Middle */}
        <div className="flex-1 flex flex-col justify-center" style={{ maxWidth: 460 }}>
          {/* Badge */}
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 12px",
            borderRadius: 999,
            background: "rgba(237,86,80,0.16)",
            border: "1px solid rgba(237,86,80,0.4)",
            color: "#F3918D",
            fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
            fontSize: 10.5,
            letterSpacing: "0.12em",
            width: "fit-content",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ED5650", flexShrink: 0 }} />
            CUMPLIMIENTO LABORAL
          </span>

          {/* H2 */}
          <h2 style={{
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontWeight: 500,
            fontSize: 36,
            lineHeight: 1.15,
            letterSpacing: "-0.015em",
            color: "#fff",
            margin: "24px 0 0",
          }}>
            Planifica turnos y controla la jornada de todo tu equipo en tiempo real.
          </h2>

          {/* Coral line */}
          <div style={{
            width: 56,
            height: 3,
            background: "#ED5650",
            borderRadius: 999,
            margin: "24px 0",
          }} />

          {/* Body */}
          <p style={{
            fontSize: 15,
            lineHeight: 1.5,
            color: "#ADADAE",
            maxWidth: 400,
            margin: 0,
          }}>
            Smart Time Control programa horarios, registra entradas y calcula recargos y horas extra — listo para tu nómina y la ley colombiana.
          </p>

          {/* Features */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 32 }}>
            {features.map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <svg
                  viewBox="0 0 53.89 58.76"
                  width="15" height="15"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ flexShrink: 0 }}
                >
                  <g transform="translate(-36 -852.24)" fill="#ED5650">
                    {STC_PATHS}
                  </g>
                </svg>
                <span style={{ fontSize: 14, color: "#ADADAE" }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <p style={{
          fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
          fontSize: 11,
          letterSpacing: "0.12em",
          color: "#7A7A7A",
          textTransform: "uppercase",
        }}>
          SMART TIME CONTROL · 2026
        </p>
      </div>
    </section>
  );
}

// ── Split layout ──────────────────────────────────────────────────────────
function SplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%", background: "#F1F1F1", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Form side */}
      <section
        className="flex flex-col w-full lg:w-1/2"
        style={{ background: "#F1F1F1", display: "grid", gridTemplateRows: "auto 1fr auto" }}
      >
        {/* Brand lockup */}
        <div className="px-5 sm:px-8 lg:px-14" style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 32 }}>
          <OrgLogoBox size={36} />
          <div>
            <div style={{
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontWeight: 600,
              fontSize: 16,
              color: "#333333",
              lineHeight: 1.1,
            }}>
              Smart Time Control
            </div>
            <div style={{
              fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "rgba(51,51,51,0.55)",
              marginTop: 4,
              textTransform: "uppercase",
            }}>
              SMARTER SCHEDULING
            </div>
          </div>
        </div>

        {/* Form area */}
        <div className="px-5 sm:px-8 lg:px-14" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 420 }}>
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-8 lg:px-14 pb-8 sm:pb-12" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#9E9E9E" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span style={{
            fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
            fontSize: 11,
            letterSpacing: "0.10em",
            color: "#9E9E9E",
            textTransform: "uppercase",
          }}>
            SMART TIME CONTROL · CONTROL DE JORNADA SEGURO
          </span>
        </div>
      </section>

      {/* Promo side */}
      <RightPanel />
    </div>
  );
}

// ── Shared input / label styles ───────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#575757",
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  border: "1px solid #D5D6D7",
  borderRadius: 8,
  background: "#fff",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 14,
  color: "#333333",
  outline: "none",
  transition: "border-color 120ms ease, box-shadow 120ms ease",
};

// ── Login view ─────────────────────────────────────────────────────────────
function LoginView({ onForgot, onRegister }: { onForgot: () => void; onRegister: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
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
      <div>
        {/* Heading */}
        <h1 style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: 600,
          fontSize: 28,
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          color: "#333333",
          margin: 0,
        }}>
          Bienvenido de vuelta
        </h1>
        <p style={{
          fontSize: 15,
          lineHeight: 1.5,
          color: "rgba(51,51,51,0.65)",
          margin: "16px 0 0",
          maxWidth: 340,
        }}>
          Inicia sesión para gestionar turnos, jornadas y reportes de tu equipo.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Email */}
          <div>
            <label style={labelStyle}>Correo electrónico</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9E9E9E", display: "flex" }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
              </span>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="usuario@empresa.com" required autoComplete="username"
                style={{ ...inputStyle, paddingLeft: 42, paddingRight: 14 }}
                onFocus={e => { e.currentTarget.style.borderColor = "#ED5650"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(237,86,80,0.15)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#D5D6D7"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
          </div>

          {/* Contraseña */}
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 9 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Contraseña</label>
              <button
                type="button" onClick={onForgot}
                style={{ fontSize: 12.5, fontWeight: 500, color: "#ED5650", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9E9E9E", display: "flex" }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="9" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              </span>
              <input
                type={showPass ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password"
                style={{ ...inputStyle, paddingLeft: 42, paddingRight: 46 }}
                onFocus={e => { e.currentTarget.style.borderColor = "#ED5650"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(237,86,80,0.15)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#D5D6D7"; e.currentTarget.style.boxShadow = "none"; }}
              />
              <button
                type="button" onClick={() => setShowPass(v => !v)}
                aria-label="Mostrar contraseña"
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  width: 32, height: 32, border: "none", background: "transparent",
                  color: "#9E9E9E", display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", borderRadius: 8,
                }}
              >
                {showPass ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61" /><path d="m2 2 20 20" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Recordar */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", marginTop: -2 }}>
            <span
              onClick={() => setRemember(v => !v)}
              style={{
                width: 20, height: 20, borderRadius: 6,
                background: remember ? "#ED5650" : "#fff",
                border: remember ? "1.5px solid #ED5650" : "1.5px solid #D5D6D7",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "background 120ms, border-color 120ms",
              }}
            >
              {remember && (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="round">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              )}
            </span>
            <span
              onClick={() => setRemember(v => !v)}
              style={{ fontSize: 13.5, color: "#575757" }}
            >
              Recordar este equipo durante 30 días
            </span>
          </label>

          {/* Error */}
          {error && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              borderRadius: 8, border: "1px solid #fecaca",
              background: "#fef2f2", padding: "12px 14px",
            }}>
              <AlertCircle style={{ width: 16, height: 16, color: "#ED5650", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 14, color: "#ED5650", lineHeight: 1.4, margin: 0 }}>{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit" disabled={loading || !email || !password}
            style={{
              width: "100%", height: 48, border: "none",
              borderRadius: 999, background: "#ED5650",
              color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif",
              fontWeight: 600, fontSize: 15, letterSpacing: "0.01em",
              cursor: loading || !email || !password ? "not-allowed" : "pointer",
              opacity: loading || !email || !password ? 0.5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "background 120ms ease",
            }}
          >
            {loading ? "Verificando…" : "Iniciar sesión"}
          </button>

          {/* Crear cuenta */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "4px 0" }}>
              <span style={{ flex: 1, height: 1, background: "#D5D6D7" }} />
              <span style={{ fontSize: 12.5, color: "#575757" }}>¿Nuevo en el sistema?</span>
              <span style={{ flex: 1, height: 1, background: "#D5D6D7" }} />
            </div>
            <button
              type="button" onClick={onRegister}
              style={{
                width: "100%", height: 48, marginTop: 4,
                border: "1.5px solid #333333", borderRadius: 999,
                background: "transparent", color: "#333333",
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontWeight: 500, fontSize: 14.5,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                transition: "background 120ms ease, color 120ms ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#333333"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#333333"; }}
            >
              <UserPlus style={{ width: 18, height: 18 }} />
              Crear cuenta
            </button>
          </div>
        </form>
      </div>
    </SplitLayout>
  );
}

// ── Forgot password view ───────────────────────────────────────────────────
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
          <h1 style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 600, fontSize: 28, color: "#333333", margin: 0, lineHeight: 1.2 }}>Recuperar contraseña</h1>
          <p style={{ fontSize: 15, color: "rgba(51,51,51,0.65)", marginTop: 8 }}>Te generaremos un enlace de recuperación.</p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={labelStyle}>Correo electrónico</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9E9E9E", display: "flex" }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
                </svg>
              </span>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="usuario@empresa.com" required autoComplete="email"
                style={{ ...inputStyle, paddingLeft: 42, paddingRight: 14 }}
                onFocus={e => { e.currentTarget.style.borderColor = "#ED5650"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(237,86,80,0.15)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#D5D6D7"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
          </div>
          {error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", padding: "12px 14px" }}>
              <AlertCircle style={{ width: 16, height: 16, color: "#ED5650", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 14, color: "#ED5650", lineHeight: 1.4, margin: 0 }}>{error}</p>
            </div>
          )}
          <button
            type="submit" disabled={loading || !email}
            style={{
              width: "100%", height: 48, border: "none", borderRadius: 999,
              background: "#ED5650", color: "#fff",
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontWeight: 600, fontSize: 15, cursor: loading || !email ? "not-allowed" : "pointer",
              opacity: loading || !email ? 0.5 : 1,
            }}
          >
            {loading ? "Enviando…" : "Enviar enlace de recuperación"}
          </button>
        </form>
      </div>
    </SplitLayout>
  );
}

// ── Register view ──────────────────────────────────────────────────────────
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
            <h1 style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 600, fontSize: 28, color: "#333333", margin: 0 }}>Cuenta creada</h1>
            <p style={{ fontSize: 15, color: "rgba(51,51,51,0.65)", marginTop: 8 }}>Ya puedes iniciar sesión</p>
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
            style={{
              width: "100%", height: 48, border: "none", borderRadius: 999,
              background: "#ED5650", color: "#fff",
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontWeight: 600, fontSize: 15, cursor: "pointer",
            }}
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
          <h1 style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 600, fontSize: 28, color: "#333333", margin: 0 }}>Crear cuenta</h1>
          <p style={{ fontSize: 15, color: "rgba(51,51,51,0.65)", marginTop: 8 }}>Completa los datos para registrarte.</p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Nombre */}
          <div>
            <label style={labelStyle}>Nombre completo</label>
            <input
              type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Juan Pérez" required autoComplete="name"
              style={{ ...inputStyle, paddingLeft: 14, paddingRight: 14 }}
              onFocus={e => { e.currentTarget.style.borderColor = "#ED5650"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(237,86,80,0.15)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#D5D6D7"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          {/* Email */}
          <div>
            <label style={labelStyle}>Correo electrónico</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9E9E9E", display: "flex" }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
                </svg>
              </span>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="usuario@empresa.com" required autoComplete="email"
                style={{ ...inputStyle, paddingLeft: 42, paddingRight: 14 }}
                onFocus={e => { e.currentTarget.style.borderColor = "#ED5650"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(237,86,80,0.15)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#D5D6D7"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
          </div>

          {/* Contraseña */}
          <div>
            <label style={labelStyle}>Contraseña</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9E9E9E", display: "flex" }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              </span>
              <input
                type={showPass ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="new-password"
                style={{ ...inputStyle, paddingLeft: 42, paddingRight: 46 }}
                onFocus={e => { e.currentTarget.style.borderColor = "#ED5650"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(237,86,80,0.15)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#D5D6D7"; e.currentTarget.style.boxShadow = "none"; }}
              />
              <button
                type="button" onClick={() => setShowPass(v => !v)}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 32, height: 32, border: "none", background: "transparent", color: "#9E9E9E", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: 8 }}
              >
                {showPass ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61" /><path d="m2 2 20 20" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {password && <PasswordStrength password={password} />}
          </div>

          {/* Confirmar */}
          <div>
            <label style={labelStyle}>Confirmar contraseña</label>
            <input
              type={showPass ? "text" : "password"} value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••" required autoComplete="new-password"
              style={{
                ...inputStyle,
                paddingLeft: 14, paddingRight: 14,
                borderColor: confirm && !match ? "#f87171" : "#D5D6D7",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = confirm && !match ? "#f87171" : "#ED5650"; e.currentTarget.style.boxShadow = `0 0 0 3px ${confirm && !match ? "rgba(248,113,113,0.15)" : "rgba(237,86,80,0.15)"}`; }}
              onBlur={e => { e.currentTarget.style.borderColor = confirm && !match ? "#f87171" : "#D5D6D7"; e.currentTarget.style.boxShadow = "none"; }}
            />
            {confirm && !match && <p style={{ fontSize: 12, color: "#ED5650", marginTop: 4 }}>Las contraseñas no coinciden.</p>}
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", padding: "12px 14px" }}>
              <AlertCircle style={{ width: 16, height: 16, color: "#ED5650", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 14, color: "#ED5650", lineHeight: 1.4, margin: 0 }}>{error}</p>
            </div>
          )}

          <button
            type="submit" disabled={loading || !nombre || !email || !password || !confirm}
            style={{
              width: "100%", height: 48, border: "none", borderRadius: 999,
              background: "#ED5650", color: "#fff",
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontWeight: 600, fontSize: 15,
              cursor: loading || !nombre || !email || !password || !confirm ? "not-allowed" : "pointer",
              opacity: loading || !nombre || !email || !password || !confirm ? 0.5 : 1,
            }}
          >
            {loading ? "Creando cuenta…" : "Crear cuenta"}
          </button>
        </form>
      </div>
    </SplitLayout>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
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
    <div className="space-y-1.5 mt-2">
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
