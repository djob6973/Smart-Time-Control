import * as React from "react";
import {
  Bell, Check, CheckCheck, Trash2, Info, CheckCircle, AlertTriangle,
  AlertCircle, ChevronDown, FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/use-notifications";
import { useAuth } from "@/lib/auth";
import { useWFM } from "@/lib/wfm/store";
import { runNotificationDiagnostic, type DiagStep } from "@/lib/notifications/diagnose.server";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale/es";
import { cn } from "@/lib/utils";

// ── Iconos de tipo ──────────────────────────────────────────────────────

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "success": return <CheckCircle  className="size-4 text-[#1F8A5B]" />;
    case "warning": return <AlertTriangle className="size-4 text-[#C98A00]" />;
    case "error":   return <AlertCircle   className="size-4 text-destructive" />;
    default:        return <Info          className="size-4 text-primary" />;
  }
}

function typeRing(type: string) {
  switch (type) {
    case "success": return "bg-[color-mix(in_srgb,#1F8A5B_12%,transparent)] border-[#1F8A5B]/20";
    case "warning": return "bg-[color-mix(in_srgb,#C98A00_12%,transparent)] border-[#C98A00]/20";
    case "error":   return "bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] border-destructive/20";
    default:        return "bg-primary/8 border-primary/20";
  }
}

// ── Diagnóstico (solo admin) ────────────────────────────────────────────

function DiagnosticPanel({ employees }: { employees: { id: string; fullName: string }[] }) {
  const [open,        setOpen]        = React.useState(false);
  const [empId,       setEmpId]       = React.useState("");
  const [loading,     setLoading]     = React.useState(false);
  const [steps,       setSteps]       = React.useState<DiagStep[] | null>(null);
  const [summary,     setSummary]     = React.useState<"ok" | "warn" | "error" | null>(null);

  async function run() {
    setLoading(true);
    setSteps(null);
    setSummary(null);
    try {
      const result = await runNotificationDiagnostic({ data: { employeeId: empId || undefined } });
      setSteps(result.steps);
      setSummary(result.summary);
    } catch (e: any) {
      setSteps([{ step: "Error inesperado", ok: false, detail: e.message }]);
      setSummary("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <FlaskConical className="size-3" />
          Diagnóstico del pipeline
        </span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          {/* Employee selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Empleado a probar (opcional)
            </label>
            <select
              className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-card focus:outline-none focus:ring-1 focus:ring-primary/40"
              value={empId}
              onChange={e => setEmpId(e.target.value)}
            >
              <option value="">— Sin filtrar (solo chequeo global) —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.fullName}</option>
              ))}
            </select>
          </div>

          <button
            onClick={run}
            disabled={loading}
            className="w-full text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 font-medium"
          >
            {loading ? "Ejecutando..." : "Ejecutar diagnóstico"}
          </button>

          {/* Results */}
          {steps && (
            <div className="space-y-1.5 pt-1">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg px-2.5 py-2 border text-xs",
                    s.ok
                      ? "bg-[color-mix(in_srgb,#1F8A5B_8%,transparent)] border-[#1F8A5B]/20 text-[#1F8A5B]"
                      : "bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] border-destructive/20 text-destructive",
                  )}
                >
                  <div className="font-medium flex items-center gap-1.5">
                    {s.ok ? <CheckCircle className="size-3 shrink-0" /> : <AlertCircle className="size-3 shrink-0" />}
                    {s.step}
                  </div>
                  <div className="mt-0.5 text-[10px] opacity-80 leading-snug">{s.detail}</div>
                </div>
              ))}
              <div className={cn(
                "text-center text-[10px] font-semibold py-1 rounded",
                summary === "ok"    && "text-[#1F8A5B]",
                summary === "error" && "text-destructive",
              )}>
                {summary === "ok" ? "✓ Pipeline operativo" : "✗ Se encontraron problemas"}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────

export function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    removeNotification,
  } = useNotifications();

  const { role } = useAuth();
  const { employees } = useWFM();
  const isAdmin = role === "admin";

  // Re-fetch cada vez que el dropdown se abre para mostrar notificaciones recientes.
  function handleOpenChange(open: boolean) {
    if (open) fetchNotifications();
  }

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 size-5 flex items-center justify-center p-0 text-[10px] font-bold"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        {/* Header */}
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2.5">
          <span className="font-semibold text-sm">Notificaciones</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-0.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllNotificationsAsRead}
            >
              <CheckCheck className="size-3 mr-1" />
              Marcar todas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />

        {/* List */}
        <DropdownMenuGroup>
          <ScrollArea className="h-72">
            {isLoading ? (
              <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                Cargando…
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-20 gap-1 text-muted-foreground">
                <Bell className="size-5 opacity-30" />
                <span className="text-xs">Sin notificaciones</span>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "p-3 rounded-xl border transition-colors",
                      n.read ? "bg-secondary/30 border-border" : "bg-card border-primary/15 shadow-sm",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={cn("shrink-0 p-1.5 rounded-full border", typeRing(n.type))}>
                        <TypeIcon type={n.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="text-xs font-semibold leading-tight">{n.title}</p>
                          {!n.read && (
                            <button
                              onClick={() => markNotificationAsRead(n.id)}
                              className="shrink-0 p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                              title="Marcar como leída"
                            >
                              <Check className="size-3" />
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                          {n.body}
                        </p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10px] text-muted-foreground/70">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                          </span>
                          <button
                            onClick={() => removeNotification(n.id)}
                            className="p-0.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DropdownMenuGroup>

        {/* Diagnóstico — solo para admin */}
        {isAdmin && (
          <DiagnosticPanel
            employees={employees
              .filter(e => e.status === "active")
              .map(e => ({ id: e.id, fullName: e.fullName }))}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
