import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, CalendarDays, Users, Building2,
  CalendarOff, FileText, Settings, LogOut, Clock, CalendarCheck,
} from "lucide-react";
import { useEffect } from "react";
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
  const { profile, role, roleLoading, signOut, hasPermission } = useAuth();
  const { sidebarOpen, closeSidebar } = useAppContext();

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
          <div className="size-10 shrink-0 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
            S
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

        {/* Footer: usuario + cerrar sesión */}
        <div className="p-3 border-t border-sidebar-border shrink-0">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-sidebar-accent/60 transition-colors">
            <div className="size-8 shrink-0 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
              {initials}
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-xs font-semibold truncate">{profile?.nombre || profile?.email}</div>
              <div className="text-[10px] text-muted-foreground capitalize">{roleLabel}</div>
            </div>
            <button
              onClick={signOut}
              title="Cerrar sesión"
              className="shrink-0 p-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
