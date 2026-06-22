import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, CalendarDays, Users, Building2,
  CalendarOff, FileText, Settings, LogOut, Clock, CalendarCheck, KeyRound, Eye, EyeOff, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useAppContext } from "@/lib/app-context";
import type { Resource } from "@/lib/permissions";

const ROLE_LABELS: Record<string, string> = {
  admin:      "Administrador",
  supervisor: "Supervisor",
  lider:      "Líder",
  gestor:     "Gestor",
  consulta:   "Consulta",
};

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  resource?: Resource;
  onlyLinkedEmployee?: boolean;
};

const NAV: NavItem[] = [
  { to: "/",           label: "Dashboard",         icon: LayoutDashboard, resource: "dashboard" },
  { to: "/scheduler",  label: "Programación",       icon: CalendarDays,    resource: "scheduler" },
  { to: "/mi-horario", label: "Mi Horario",         icon: CalendarCheck,   resource: "mi_horario" },
  { to: "/jornada",    label: "Control de Jornada", icon: Clock,           resource: "jornada" },
  { to: "/employees",  label: "Trabajadores",       icon: Users,           resource: "employees" },
  { to: "/areas",      label: "Áreas",              icon: Building2,       resource: "areas" },
  { to: "/absences",   label: "Ausencias",          icon: CalendarOff,     resource: "absences" },
  { to: "/reports",    label: "Reportes",           icon: FileText,        resource: "reports" },
  { to: "/settings",   label: "Configuración",      icon: Settings,        resource: "settings" },
];

export function Sidebar() {
  const path    = useRouterState({ select: (s) => s.location.pathname });
  const { profile, role, roleLoading, signOut, hasPermission, updatePassword } = useAuth();
  const { sidebarOpen, closeSidebar } = useAppContext();

  const [passOpen,     setPassOpen]     = useState(false);
  const [currentPass,  setCurrentPass]  = useState("");
  const [newPass,      setNewPass]      = useState("");
  const [confirmPass,  setConfirmPass]  = useState("");
  const [showCurrent,  setShowCurrent]  = useState(false);
  const [showNew,      setShowNew]      = useState(false);
  const [showConf,     setShowConf]     = useState(false);
  const [passLoading,  setPassLoading]  = useState(false);
  const [passError,    setPassError]    = useState<string | null>(null);
  const [passDone,     setPassDone]     = useState(false);

  function resetPassModal() {
    setCurrentPass(""); setNewPass(""); setConfirmPass("");
    setShowCurrent(false); setShowNew(false); setShowConf(false);
    setPassError(null); setPassDone(false);
  }

  async function handleChangePassword() {
    if (!currentPass) {
      setPassError("Ingresa tu contraseña actual.");
      return;
    }
    if (!newPass || newPass.length < 8) {
      setPassError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPass !== confirmPass) {
      setPassError("Las contraseñas no coinciden.");
      return;
    }
    setPassLoading(true);
    setPassError(null);
    const err = await updatePassword(currentPass, newPass);
    setPassLoading(false);
    if (err) { setPassError(err); return; }
    setPassDone(true);
    setTimeout(() => { setPassOpen(false); resetPassModal(); }, 1800);
  }

  useEffect(() => {
    closeSidebar();
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLinkedEmployee = !!profile?.employeeId;

  const visibleNav = !role || roleLoading ? [] : NAV.filter(item => {
    if (item.onlyLinkedEmployee && !isLinkedEmployee) return false;
    if (item.to === "/jornada" && isLinkedEmployee) return true;
    return !item.resource || hasPermission(item.resource, "view");
  });

  const initials = profile?.nombre
    ? profile.nombre.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : profile?.email?.slice(0, 2).toUpperCase() ?? "??";

  const roleLabel = ROLE_LABELS[role ?? ""] ?? role ?? "";

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/50 lg:hidden transition-opacity duration-300",
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={closeSidebar}
        aria-hidden
      />

      {/* Sidebar panel */}
      <aside
        className={cn(
          "flex flex-col bg-sidebar text-sidebar-foreground",
          "fixed inset-y-0 left-0 z-40 w-64",
          "transition-transform duration-300 ease-in-out",
          // Desktop: in-flow, sticky, floating card
          "lg:relative lg:inset-y-auto lg:left-auto lg:z-auto lg:w-60 lg:shrink-0 lg:translate-x-0",
          "lg:rounded-card lg:shadow-card lg:my-4 lg:ml-4 lg:h-[calc(100vh-2rem)] lg:sticky lg:top-4",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo / marca */}
        <div className="px-5 py-5 flex items-center gap-3 border-b border-sidebar-border shrink-0">
          <div className="size-10 shrink-0">
            <img src="/logo.svg" alt="" className="size-10 object-contain" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate font-display">
              Smart Time Control
            </div>
            <div className="text-[11px] text-muted-foreground">Smarter scheduling</div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((it) => {
            const active = it.to === "/" ? path === "/" : path.startsWith(it.to);
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px]",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {it.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer: usuario + acciones */}
        <div className="p-3 border-t border-sidebar-border shrink-0">
          <div className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-sidebar-accent/60 transition-colors">
            <div className="size-8 shrink-0 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
              {initials}
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-xs font-semibold truncate">{profile?.nombre || profile?.email}</div>
              <div className="text-[10px] text-muted-foreground capitalize">{roleLabel}</div>
            </div>
            <div className="flex items-center shrink-0">
              <button
                onClick={() => { resetPassModal(); setPassOpen(true); }}
                title="Cambiar contraseña"
                className="p-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <KeyRound className="size-3.5" />
              </button>
              <button
                onClick={signOut}
                title="Cerrar sesión"
                className="p-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Modal: cambiar contraseña */}
      {passOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPassOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Cambiar contraseña</h2>
              <button onClick={() => setPassOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                <X className="size-4" />
              </button>
            </div>

            {passDone ? (
              <div className="py-6 text-center space-y-2">
                <div className="text-3xl">✓</div>
                <p className="text-sm font-medium text-[#1F8A5B]">Contraseña actualizada</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contraseña actual</label>
                  <div className="relative">
                    <input
                      type={showCurrent ? "text" : "password"}
                      value={currentPass}
                      onChange={e => setCurrentPass(e.target.value)}
                      placeholder="Tu contraseña actual"
                      className="w-full rounded-pill border border-border bg-card px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nueva contraseña</label>
                  <div className="relative">
                    <input
                      type={showNew ? "text" : "password"}
                      value={newPass}
                      onChange={e => setNewPass(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full rounded-pill border border-border bg-card px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Confirmar contraseña</label>
                  <div className="relative">
                    <input
                      type={showConf ? "text" : "password"}
                      value={confirmPass}
                      onChange={e => setConfirmPass(e.target.value)}
                      placeholder="Repite la contraseña"
                      onKeyDown={e => e.key === "Enter" && handleChangePassword()}
                      className="w-full rounded-pill border border-border bg-card px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button type="button" onClick={() => setShowConf(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showConf ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {passError && (
                  <p className="text-xs text-destructive">{passError}</p>
                )}

                <button
                  onClick={handleChangePassword}
                  disabled={passLoading}
                  className="w-full rounded-pill bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {passLoading ? "Guardando…" : "Actualizar contraseña"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
