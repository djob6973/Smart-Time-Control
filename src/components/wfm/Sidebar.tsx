import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, CalendarDays, Users, Building2,
  CalendarOff, FileText, Settings, Clock, CalendarCheck,
  Sun, Moon, ChevronRight, Languages, CircleUser,
} from "lucide-react";
import { useEffect, useRef, useState, Fragment } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useAppContext } from "@/lib/app-context";
import { useTheme } from "@/lib/theme";
import { useI18n, LANGUAGES } from "@/lib/i18n";
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
  section?: string;
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
  { to: "/settings",   label: "Configuración",      icon: Settings,        resource: "settings", section: "Administración" },
];

export function Sidebar() {
  const path     = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { profile, role, roleLoading, hasPermission, organization } = useAuth();
  const { sidebarOpen, closeSidebar } = useAppContext();
  const { isDark, toggle: toggleTheme } = useTheme();
  const { lang, setLang, t } = useI18n();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeSidebar();
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cierra el picker de idioma al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    if (langOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [langOpen]);

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
          "lg:relative lg:inset-y-auto lg:left-auto lg:z-auto lg:w-[240px] lg:shrink-0 lg:translate-x-0",
          "lg:rounded-card lg:shadow-card lg:border lg:border-border lg:h-[calc(100vh-2rem)] lg:sticky lg:top-4 lg:pt-5 lg:px-4 lg:pb-4",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo / marca */}
        <div className="px-5 py-5 lg:px-2 lg:pt-0 lg:pb-5 flex items-center gap-3 shrink-0">
          <div className="size-10 shrink-0">
            <img
              src={organization?.logo ?? "/logo.svg"}
              alt=""
              className="size-10 object-contain"
            />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[15px] font-semibold tracking-tight truncate font-display">
              Smart Time Control
            </div>
            <div className="text-[11px] text-muted-foreground">Smarter scheduling</div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 px-3 py-0 lg:px-0 overflow-y-auto flex flex-col gap-0.5">
          {visibleNav.map((it, index) => {
            const active = it.to === "/" ? path === "/" : path.startsWith(it.to);
            const Icon = it.icon;
            const showSection = it.section && (index === 0 || visibleNav[index - 1].section !== it.section);
            return (
              <Fragment key={it.to}>
                {showSection && (
                  <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {it.section}
                  </p>
                )}
                <Link
                  to={it.to}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-white"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  {it.label}
                </Link>
              </Fragment>
            );
          })}
        </nav>

        {/* Footer: acciones + usuario */}
        <div className="shrink-0 pt-3 mt-3">
          {/* Fila de acciones */}
          <div className="flex items-center justify-around px-2 pb-3">

            {/* Selector de idioma */}
            <div ref={langRef} style={{ position: "relative" }}>
              <button
                onClick={() => setLangOpen(v => !v)}
                title={t("language")}
                className="size-9 flex items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
                style={{ borderRadius: 999 }}
              >
                <Languages className="size-[18px]" />
              </button>

              {langOpen && (
                <div
                  className="absolute bottom-full mb-2 left-0 shadow-xl overflow-hidden"
                  style={{ borderRadius: 12 }}
                  style={{
                    minWidth: 172, zIndex: 200,
                    background: "#1f1f1f",
                    border: "1px solid rgba(255,255,255,0.08)",
                    padding: "6px",
                  }}
                >
                  {LANGUAGES.map(({ code, label }) => {
                    const countryCode = code === "es" ? "ES" : code === "en" ? "US" : "BR";
                    const selected = lang === code;
                    return (
                      <button
                        key={code}
                        onClick={() => { setLang(code); setLangOpen(false); }}
                        className="w-full flex items-center gap-2.5 transition-colors"
                        style={{
                          borderRadius: 8,
                          padding: "11px 10px",
                          background: selected ? "rgba(255,255,255,0.06)" : "transparent",
                        }}
                        onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected ? "rgba(255,255,255,0.06)" : "transparent"; }}
                      >
                        {/* Badge código */}
                        <span
                          style={{
                            width: 28, height: 20, borderRadius: 5,
                            background: "rgba(255,255,255,0.1)",
                            color: "rgba(255,255,255,0.6)",
                            fontSize: 10, fontWeight: 700,
                            letterSpacing: "0.04em",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {countryCode}
                        </span>
                        {/* Nombre */}
                        <span style={{
                          flex: 1, textAlign: "left",
                          fontSize: 13.5,
                          color: selected ? "#fff" : "rgba(255,255,255,0.55)",
                          fontWeight: selected ? 500 : 400,
                        }}>
                          {label}
                        </span>
                        {/* Check */}
                        {selected && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2.5 7L5.5 10L11.5 4" stroke="#ED5650" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tema */}
            <button
              onClick={toggleTheme}
              title={isDark ? t("light_mode") : t("dark_mode")}
              className="size-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
            >
              {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </button>

            {/* Mi cuenta */}
            <button
              onClick={() => navigate({ to: "/mi-cuenta" })}
              title={t("mi_cuenta")}
              className={cn(
                "size-9 rounded-lg flex items-center justify-center transition-colors",
                path === "/mi-cuenta"
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <CircleUser className="size-[18px]" />
            </button>

          </div>
          {/* Fila de usuario */}
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent/60 transition-colors cursor-default">
            <div className="size-10 shrink-0 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-xs font-medium">{profile?.nombre || profile?.email}</div>
              <div className="text-[11px] text-muted-foreground capitalize">{roleLabel}</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
          </div>
        </div>
      </aside>

    </>
  );
}
