import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import {
  Clock, Users, Coffee, UtensilsCrossed, LogIn, LogOut,
  LayoutDashboard, History, FileText, Settings, BarChart2,
  Plus, Edit3, Trash2, Search, AlertTriangle, CheckCircle2,
  Download, RefreshCw, CalendarDays, ChevronRight, X,
} from "lucide-react";
import { Topbar } from "@/components/wfm/Topbar";
import { useWFM } from "@/lib/wfm/store";
import { parseAbsNote, computePartialAbsWorkHours } from "@/lib/wfm/calc";
import { useAuth } from "@/lib/auth";
import { useJornada } from "@/lib/jornada/store";
import { dispatchJornadaEvent } from "@/lib/notifications/dispatch";
import { dispatchSlackJornada } from "@/lib/slack";
import type {
  TipoMovimiento,
  JornadaCupo,
  JornadaConfiguracion,
  JornadaRegistro,
  JornadaModificacion,
} from "@/lib/jornada/types";
import {
  TIPO_MOVIMIENTO_LABELS,
  ESTADO_LABELS,
  ESTADO_COLORS,
  ESTADO_REGISTRO_LABELS,
  SIGUIENTES_MOVIMIENTOS,
} from "@/lib/jornada/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/jornada")({
  head: () => ({ meta: [{ title: "Control de Jornada · STC" }] }),
  component: JornadaPage,
});

type Tab = "dashboard" | "registro" | "historial" | "reportes" | "reporte_general" | "configuracion";

const TABS: { id: Tab; labelKey: TranslationKey; icon: any }[] = [
  { id: "dashboard",       labelKey: "jornada_tab_dashboard",       icon: LayoutDashboard },
  { id: "registro",        labelKey: "jornada_tab_registro",        icon: Clock },
  { id: "historial",       labelKey: "jornada_tab_historial",       icon: History },
  { id: "reportes",        labelKey: "jornada_tab_reportes",        icon: FileText },
  { id: "reporte_general", labelKey: "jornada_tab_reporte_general", icon: BarChart2 },
  { id: "configuracion",   labelKey: "jornada_tab_configuracion",   icon: Settings },
];

const TIPO_ICONS: Record<TipoMovimiento, any> = {
  entrada:          LogIn,
  salida_break1:    Coffee,
  regreso_break1:   Coffee,
  salida_break2:    Coffee,
  regreso_break2:   Coffee,
  salida_almuerzo:  UtensilsCrossed,
  regreso_almuerzo: UtensilsCrossed,
  salida:           LogOut,
};

const TIPO_COLORS: Record<TipoMovimiento, string> = {
  entrada:          "bg-primary hover:opacity-90 text-primary-foreground",
  salida_break1:    "border border-border bg-card hover:bg-secondary text-foreground",
  regreso_break1:   "bg-primary hover:opacity-90 text-primary-foreground",
  salida_break2:    "border border-border bg-card hover:bg-secondary text-foreground",
  regreso_break2:   "bg-primary hover:opacity-90 text-primary-foreground",
  salida_almuerzo:  "border border-border bg-card hover:bg-secondary text-foreground",
  regreso_almuerzo: "bg-primary hover:opacity-90 text-primary-foreground",
  salida:           "bg-foreground hover:opacity-90 text-background",
};

const TIPO_SHORT_LABELS: Record<TipoMovimiento, string> = {
  entrada:          "Entrada",
  salida_break1:    "Break 1",
  regreso_break1:   "Fin Break 1",
  salida_break2:    "Break 2",
  regreso_break2:   "Fin Break 2",
  salida_almuerzo:  "Almuerzo",
  regreso_almuerzo: "Fin almuerzo",
  salida:           "Salida",
};

function isWithinWindow(nowHHMM: string, inicio: string, fin: string) {
  const i = inicio.slice(0, 5);
  const f = fin.slice(0, 5);
  return nowHHMM >= i && nowHHMM <= f;
}

// ── Helpers ────────────────────────────────────────────────

function fmtTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function fmtMins(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function calcDayStats(regs: JornadaRegistro[]) {
  const sorted = [...regs].sort((a, b) => new Date(a.horaExacta).getTime() - new Date(b.horaExacta).getTime());
  const entrada  = sorted.find((r) => r.tipoMovimiento === "entrada");
  const salida   = sorted.find((r) => r.tipoMovimiento === "salida");
  let jornadaMin = 0, breakMin1 = 0, breakMin2 = 0, almuerzoMin = 0;
  if (entrada && salida) {
    jornadaMin = Math.floor((new Date(salida.horaExacta).getTime() - new Date(entrada.horaExacta).getTime()) / 60000);
  }
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].tipoMovimiento === "salida_break1") {
      const r = sorted.find((x, j) => j > i && x.tipoMovimiento === "regreso_break1");
      if (r) breakMin1 += Math.floor((new Date(r.horaExacta).getTime() - new Date(sorted[i].horaExacta).getTime()) / 60000);
    }
    if (sorted[i].tipoMovimiento === "salida_break2") {
      const r = sorted.find((x, j) => j > i && x.tipoMovimiento === "regreso_break2");
      if (r) breakMin2 += Math.floor((new Date(r.horaExacta).getTime() - new Date(sorted[i].horaExacta).getTime()) / 60000);
    }
    if (sorted[i].tipoMovimiento === "salida_almuerzo") {
      const r = sorted.find((x, j) => j > i && x.tipoMovimiento === "regreso_almuerzo");
      if (r) almuerzoMin += Math.floor((new Date(r.horaExacta).getTime() - new Date(sorted[i].horaExacta).getTime()) / 60000);
    }
  }
  const breakMin = breakMin1 + breakMin2;
  return { entrada, salida, jornadaMin, breakMin, breakMin1, breakMin2, almuerzoMin, efectivoMin: Math.max(0, jornadaMin - breakMin - almuerzoMin) };
}

function calcPunctuality(regs: JornadaRegistro[], config: JornadaConfiguracion | undefined) {
  const toleranciaMin = config?.toleranciaLlegadaMin ?? 15;
  const horaInicio    = (config?.horaInicioJornada ?? "08:00").slice(0, 5);
  const fechas = [...new Set(regs.filter((r) => r.tipoMovimiento === "entrada").map((r) => r.fecha))];
  let diasATiempo = 0, diasTarde = 0, totalRetrasoMin = 0;
  fechas.forEach((fecha) => {
    const entrada = regs.find((r) => r.fecha === fecha && r.tipoMovimiento === "entrada");
    if (!entrada) return;
    const limite   = new Date(`${fecha}T${horaInicio}:00`).getTime() + toleranciaMin * 60000;
    const entradaT = new Date(entrada.horaExacta).getTime();
    if (entradaT > limite) {
      diasTarde++;
      totalRetrasoMin += Math.floor((entradaT - new Date(`${fecha}T${horaInicio}:00`).getTime()) / 60000);
    } else {
      diasATiempo++;
    }
  });
  const total = diasATiempo + diasTarde;
  return {
    diasATiempo, diasTarde, total,
    pct: total > 0 ? Math.round((diasATiempo / total) * 100) : 100,
    avgRetrasoMin: diasTarde > 0 ? Math.round(totalRetrasoMin / diasTarde) : 0,
  };
}

// ── Shared components ──────────────────────────────────────

function KPI({ icon: Icon, label, value, hint, alert }: { icon: any; label: string; value: any; hint?: string; alert?: boolean }) {
  return (
    <div className={cn(
      "rounded-card p-4 shadow-card flex flex-col gap-2.5",
      alert
        ? "bg-foreground dark:bg-primary/10 dark:border dark:border-primary/25"
        : "border border-border bg-card",
    )}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("text-[11px] font-medium uppercase tracking-[0.04em]", alert ? "text-background/70 dark:text-primary/80" : "text-muted-foreground")}>{label}</span>
        <span className={cn("size-[34px] shrink-0 rounded-md grid place-items-center", alert ? "bg-white/12 text-background dark:bg-primary/15 dark:text-primary" : "bg-secondary text-foreground")}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div className={cn("font-display text-[2.25rem] leading-none tracking-tight tabular-nums", alert ? "text-background dark:text-foreground" : "")}>{value}</div>
      {hint && <div className={cn("text-[11px]", alert ? "text-background/70 dark:text-muted-foreground" : "text-muted-foreground")}>{hint}</div>}
    </div>
  );
}

function CupoBar({ label, enUso, max }: { label: string; enUso: number; max: number }) {
  const { t } = useI18n();
  const pct   = Math.min(100, Math.round((enUso / max) * 100));
  const color = pct >= 100 ? "var(--color-primary)" : pct >= 75 ? "#C98A00" : "#1F8A5B";
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{enUso} {t("jornada_cupos_in")} {label.toLowerCase()}</span>
        <span className="text-muted-foreground">{enUso}/{max}</span>
      </div>
      <div className="h-3 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <p className="text-xs text-muted-foreground">{Math.max(0, max - enUso)} {t("jornada_cupos_available")}</p>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// ── Main page ──────────────────────────────────────────────

function JornadaPage() {
  const { hasPermission, profile } = useAuth();
  const { t } = useI18n();
  const isLinkedEmployee = !!profile?.employeeId;

  const visibleTabs = TABS.filter((tab) => {
    if (tab.id === "registro" && isLinkedEmployee) return true;
    if (tab.id === "reportes") {
      return (
        hasPermission("jornada_reportes" as any, "view") ||
        (isLinkedEmployee && hasPermission("mi_jornada_reportes" as any, "view"))
      );
    }
    return hasPermission(`jornada_${tab.id}` as any, "view");
  });
  const defaultTab = (visibleTabs[0]?.id ?? "registro") as Tab;
  const [tab, setTab] = useState<Tab>(defaultTab);
  const activeTab = visibleTabs.some((vt) => vt.id === tab) ? tab : defaultTab;
  const { initialized, initFromDB, loading, fechaActiva } = useJornada();

  useEffect(() => {
    if (!initialized) initFromDB();
  }, [initialized, initFromDB]);

  return (
    <>
      <Topbar title={t("jornada_title")} subtitle={`Fecha activa: ${fechaActiva}`} />

      <div className="border-b border-border/60 px-4 md:px-6">
        <nav className="flex gap-1 overflow-x-auto">
          {visibleTabs.map((vt) => {
            const Icon = vt.icon;
            const isActive = activeTab === vt.id;
            return (
              <button
                key={vt.id}
                onClick={() => setTab(vt.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                <Icon className="size-4" />
                {t(vt.labelKey)}
              </button>
            );
          })}
        </nav>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {t("jornada_loading_data")}
        </div>
      )}

      {!loading && (
        <div className="flex-1 overflow-auto">
          {activeTab === "dashboard"     && <TabDashboard />}
          {activeTab === "registro"      && <TabRegistro autoEmployeeId={profile?.employeeId ?? null} />}
          {activeTab === "historial"     && <TabHistorial />}
          {activeTab === "reportes"        && <TabReportes autoEmployeeId={profile?.employeeId ?? null} />}
          {activeTab === "reporte_general" && <TabReporteGeneral />}
          {activeTab === "configuracion"   && <TabConfiguracion />}
        </div>
      )}
    </>
  );
}

// ── TAB: Dashboard ─────────────────────────────────────────

function TabDashboard() {
  const { t } = useI18n();
  const { employees, areas, shifts } = useWFM();
  const { profile } = useAuth();
  const { registros, fechaActiva, getEstadoEmpleado, getCuposDisponibles, setFechaActiva, reloadRegistros, getShiftProgramado, configuracion, horarios, horariosEmpleado } = useJornada();
  const ownArea = profile?.areaId ?? null;
  const activeEmployees = employees.filter((e) =>
    (!ownArea || e.areaId === ownArea) &&
    (e.status === "active" || (e.status === "inactive" && !!e.inactiveDate && e.inactiveDate >= fechaActiva))
  );

  const [filterEmpleado, setFilterEmpleado] = useState("");
  const [filterArea, setFilterArea]         = useState("");
  const [filterEstado, setFilterEstado]     = useState("");

  const estados = useMemo(
    () => activeEmployees.map((e) => {
      const shift = getShiftProgramado(e.id, fechaActiva, shifts);
      const absNote = shift?.code === "ABS" ? parseAbsNote(shift.note) : null;
      const isPartialAbs = absNote != null && (shift?.note?.split(":").length ?? 0) >= 4;
      const workHours = (() => {
        if (!isPartialAbs || !absNote || !shift) return null;
        // shift.start/end preserve the original work hours when applied over an existing shift
        if (shift.start > 0 || shift.end > 0) return { start: shift.start, end: shift.end };
        if (absNote.workStart != null) return { start: absNote.workStart, end: absNote.workEnd! };
        const dow   = new Date(`${fechaActiva}T12:00:00`).getDay();
        const avail = e.availability[dow];
        if (!avail) return null;
        const area  = areas.find((a) => a.id === e.areaId);
        return computePartialAbsWorkHours(avail, area?.startHour ?? 0, area?.endHour ?? 24, absNote.absStart, absNote.absEnd);
      })();
      const shiftStart = shift && shift.code !== "OFF" && shift.code !== "ABS"
        ? shift.start
        : (workHours?.start ?? null);
      return {
        emp: e,
        shift,
        workHours,
        isPartialAbs,
        absNote,
        est: getEstadoEmpleado(e.id, fechaActiva, shiftStart),
      };
    }),
    [activeEmployees, registros, fechaActiva, shifts],
  );

  // Determina si un empleado tiene turno laborable hoy (no OFF, no ABS).
  // Si no tiene turno WFM, verifica si tiene un horario del módulo de Jornada asignado.
  const diaSemana = useMemo(() => new Date(`${fechaActiva}T12:00:00`).getDay(), [fechaActiva]);

  const tieneHorarioJornada = useCallback(
    (empId: string) => {
      const asig = horariosEmpleado.find(
        (x) => x.employeeId === empId && x.activo &&
          x.fechaInicio <= fechaActiva && (!x.fechaFin || x.fechaFin >= fechaActiva),
      );
      if (!asig) return false;
      return horarios.some((h) => h.id === asig.horarioId && h.activo && h.diasAplicables.includes(diaSemana));
    },
    [horariosEmpleado, horarios, fechaActiva, diaSemana],
  );

  const esEsperadoHoy = useCallback(
    (x: { shift: ReturnType<typeof getShiftProgramado>; emp: { id: string } }) => {
      if (x.shift?.code === "OFF" || x.shift?.code === "ABS") return false;
      if (x.shift) return true; // tiene turno de trabajo
      return tieneHorarioJornada(x.emp.id); // sin turno WFM: revisar horario de jornada
    },
    [tieneHorarioJornada],
  );

  const filteredEstados = useMemo(() =>
    estados.filter(({ emp, est }) => {
      if (filterEmpleado && !emp.fullName.toLowerCase().includes(filterEmpleado.toLowerCase())) return false;
      if (filterArea && emp.areaId !== filterArea) return false;
      if (filterEstado && est.estado !== filterEstado) return false;
      return true;
    }),
    [estados, filterEmpleado, filterArea, filterEstado],
  );

  const counts = useMemo(() => ({
    enJornada:  filteredEstados.filter((x) => x.est.estado === "en_jornada").length,
    enBreak:    filteredEstados.filter((x) => x.est.estado === "en_break1" || x.est.estado === "en_break2").length,
    enAlmuerzo: filteredEstados.filter((x) => x.est.estado === "en_almuerzo").length,
    fuera:      filteredEstados.filter((x) => x.est.estado === "fuera_jornada").length,
    tardios:    filteredEstados.filter((x) => x.est.esTarde && esEsperadoHoy(x)).length,
    pendientes: filteredEstados.filter((x) => ["pendiente_ingreso", "tarde", "ausente"].includes(x.est.estado) && esEsperadoHoy(x)).length,
  }), [filteredEstados, esEsperadoHoy]);

  const breakCupo = getCuposDisponibles(undefined, "break",    fechaActiva);
  const almCupo   = getCuposDisponibles(undefined, "almuerzo", fechaActiva);

  const conEntrada = filteredEstados.filter((x) =>
    registros.some((r) => r.employeeId === x.emp.id && r.fecha === fechaActiva && r.tipoMovimiento === "entrada"),
  );
  // Solo tardíos que SÍ tienen registro de entrada (llegaron tarde).
  // Los que nunca llegaron (esTarde + sin entrada) no cuentan en la puntualidad de quienes asistieron.
  const tardiosConEntrada = conEntrada.filter((x) => x.est.esTarde).length;
  const pctPuntual = conEntrada.length > 0
    ? Math.round(((conEntrada.length - tardiosConEntrada) / conEntrada.length) * 100)
    : 0;

  return (
    <div className="px-4 md:px-6 py-4 md:py-6 max-w-[1280px] mx-auto space-y-6">
      {/* Date + refresh + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={fechaActiva}
          onChange={(e) => setFechaActiva(e.target.value)}
          className="text-sm rounded-pill border border-border bg-card px-3 py-2"
        />
        <button
          onClick={() => reloadRegistros(fechaActiva)}
          className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary"
        >
          <RefreshCw className="size-4" /> {t("jornada_update")}
        </button>

        <div className="h-5 w-px bg-border hidden sm:block" />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={t("jornada_search")}
            value={filterEmpleado}
            onChange={(e) => setFilterEmpleado(e.target.value)}
            className="text-sm rounded-pill border border-border bg-card pl-8 pr-3 py-2 w-64"
          />
        </div>

        {!ownArea && (
          <select
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
            className="text-sm rounded-pill border border-border bg-card px-3 py-2"
          >
            <option value="">{t("jornada_all_areas")}</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}

        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className="text-sm rounded-pill border border-border bg-card px-3 py-2"
        >
          <option value="">{t("jornada_filter_all")}</option>
          {(Object.entries(ESTADO_LABELS) as [string, string][]).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {(filterEmpleado || filterArea || filterEstado) && (
          <button
            onClick={() => { setFilterEmpleado(""); setFilterArea(""); setFilterEstado(""); }}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-pill border border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <X className="size-3" /> {t("jornada_clear_filter")}
          </button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPI icon={Users}           label={t("jornada_kpi_en_jornada")} value={counts.enJornada}  hint={t("jornada_hint_marcando")} />
        <KPI icon={Coffee}          label={t("jornada_kpi_en_break")}   value={counts.enBreak}    hint={t("jornada_hint_en_pausa")} />
        <KPI icon={UtensilsCrossed} label={t("jornada_kpi_en_almuerzo")} value={counts.enAlmuerzo} hint={t("jornada_hint_fuera_almorzar")} />
        <KPI icon={LogOut}          label={t("jornada_kpi_fuera")}      value={counts.fuera}      hint={t("jornada_hint_finalizada")} />
        <KPI icon={AlertTriangle}   label={t("jornada_kpi_tardios")}    value={counts.tardios}    hint={t("jornada_hint_tarde")} alert />
        <KPI icon={Clock}           label={t("jornada_kpi_pendientes")} value={counts.pendientes} hint={t("jornada_hint_sin_ingresar")} />
      </div>

      {/* Cupos */}
      {(breakCupo.max > 0 || almCupo.max > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {breakCupo.max > 0 && (
            <div className="rounded-card bg-card p-5 shadow-card">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
                <Coffee className="size-4 text-primary" /> {t("jornada_cupos_break")}
              </h3>
              <CupoBar label={t("jornada_kpi_en_break")} enUso={breakCupo.enUso} max={breakCupo.max} />
            </div>
          )}
          {almCupo.max > 0 && (
            <div className="rounded-card bg-card p-5 shadow-card">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
                <UtensilsCrossed className="size-4 text-primary" /> {t("jornada_cupos_almuerzo")}
              </h3>
              <CupoBar label={t("jornada_kpi_en_almuerzo")} enUso={almCupo.enUso} max={almCupo.max} />
            </div>
          )}
        </div>
      )}

      {/* Real-time status table */}
      <div className="rounded-card bg-card shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">{t("jornada_realtime_status")}</h3>
          <span className="text-xs text-muted-foreground">
            {filteredEstados.length !== activeEmployees.length
              ? `${filteredEstados.length} ${t("jornada_of_employees")} ${activeEmployees.length}`
              : `${activeEmployees.length} ${t("jornada_active_employees")}`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                {[t("jornada_col_worker"),t("jornada_col_area"),t("jornada_col_horario"),t("jornada_col_status"),t("jornada_col_ultimo_mov"),t("jornada_col_entry"),t("jornada_col_break1"),t("jornada_col_break2"),t("jornada_col_almuerzo"),t("jornada_col_en_jornada")].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEstados.map(({ emp, est, shift, workHours, isPartialAbs, absNote }) => (
                <tr key={emp.id} className="border-t border-border/60 hover:bg-secondary/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 shrink-0 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
                        {emp.fullName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <span className="font-medium whitespace-nowrap">{emp.fullName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{areas.find((a) => a.id === emp.areaId)?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {shift ? (
                      shift.code === "OFF" ? <span className="text-xs text-muted-foreground">Descanso</span> :
                      shift.code === "ABS" && isPartialAbs && workHours ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-primary">
                            {String(workHours.start).padStart(2,"0")}:00 – {String(workHours.end).padStart(2,"0")}:00
                          </span>
                          <span className="text-[10px] text-amber-600">
                            Aus. {String(absNote!.absStart).padStart(2,"0")}:00–{String(absNote!.absEnd).padStart(2,"0")}:00
                          </span>
                        </div>
                      ) :
                      shift.code === "ABS" ? <span className="text-xs text-muted-foreground">Ausencia</span> : (
                        <span className="text-xs font-medium text-primary">
                          {String(shift.start).padStart(2,"0")}:00 – {String(shift.end).padStart(2,"0")}:00
                        </span>
                      )
                    ) : <span className="text-xs text-muted-foreground">Sin programar</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={cn("inline-flex items-center rounded-pill px-3 py-1 text-[11px] font-medium", ESTADO_COLORS[est.estado])}>
                        {ESTADO_LABELS[est.estado]}
                      </span>
                      {est.esTarde && est.estado !== "tarde" && esEsperadoHoy({ shift, emp }) && (
                        <span className="inline-flex items-center rounded-pill px-3 py-1 text-[11px] font-medium bg-primary/12 text-primary">
                          Tarde +{fmtMins(est.minutosRetraso)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {est.ultimoMovimiento ? TIPO_MOVIMIENTO_LABELS[est.ultimoMovimiento] : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{fmtTime(est.horaUltimoMovimiento)}</td>
                  <td className="px-4 py-3">
                    {est.tiempoEnBreak1Min ? (
                      <span className={cn("inline-flex items-center gap-1 text-xs", est.break1Excedido && "text-primary font-medium")}>
                        {fmtMins(est.tiempoEnBreak1Min)}
                        {est.break1Excedido && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">!</span>}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {est.tiempoEnBreak2Min ? (
                      <span className={cn("inline-flex items-center gap-1 text-xs", est.break2Excedido && "text-primary font-medium")}>
                        {fmtMins(est.tiempoEnBreak2Min)}
                        {est.break2Excedido && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">!</span>}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {est.tiempoEnAlmuerzoMin ? (
                      <span className={cn("inline-flex items-center gap-1 text-xs", est.almuerzoExcedido && "text-primary font-medium")}>
                        {fmtMins(est.tiempoEnAlmuerzoMin)}
                        {est.almuerzoExcedido && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">!</span>}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {est.minutosEnJornada ? (
                      <span className={cn("text-xs", est.jornadaExcedida && "text-[#C98A00] font-medium")}>
                        {fmtMins(est.minutosEnJornada)}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {filteredEstados.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-muted-foreground">
                    {estados.length === 0 ? t("jornada_no_active") : t("jornada_no_filter_results")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Punctuality summary */}
      <div className="rounded-card bg-card p-5 shadow-card">
        <h3 className="font-display font-medium text-[1.125rem] mb-4">{t("jornada_col_puntualidad")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-secondary rounded-xl p-3 text-center">
            <div className="font-display text-[2rem] font-medium tabular-nums leading-none">{conEntrada.length}</div>
            <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("jornada_col_con_registro")}</div>
          </div>
          <div className="bg-secondary rounded-xl p-3 text-center">
            <div className="font-display text-[2rem] font-medium tabular-nums leading-none text-[#1F8A5B]">{conEntrada.length - tardiosConEntrada}</div>
            <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("jornada_col_a_tiempo")}</div>
          </div>
          <div className="bg-secondary rounded-xl p-3 text-center">
            <div className="font-display text-[2rem] font-medium tabular-nums leading-none text-primary">{tardiosConEntrada}</div>
            <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("jornada_tardios_label")}</div>
          </div>
          <div className="bg-secondary rounded-xl p-3 text-center">
            <div className="font-display text-[2rem] font-medium tabular-nums leading-none">
              {pctPuntual}<span className="text-lg font-normal text-muted-foreground">%</span>
            </div>
            <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("jornada_col_puntualidad")}</div>
          </div>
        </div>
        <div className="mt-4 h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pctPuntual}%`,
              backgroundColor: pctPuntual >= 90 ? "#1F8A5B" : pctPuntual >= 75 ? "#C98A00" : "var(--color-primary)",
            }}
          />
        </div>
        {counts.tardios > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empleados con retraso</div>
            {estados.filter((x) => x.est.esTarde && esEsperadoHoy(x)).map(({ emp, est }) => (
              <div key={emp.id} className="flex items-center gap-3 text-sm">
                <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                  {emp.fullName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <span className="flex-1 truncate">{emp.fullName}</span>
                <span className="text-xs text-primary font-medium">+{fmtMins(est.minutosRetraso)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TAB: Registro ──────────────────────────────────────────

function TabRegistro({ autoEmployeeId }: { autoEmployeeId: string | null }) {
  const { t } = useI18n();
  const { employees, areas, shifts } = useWFM();
  const { user, profile } = useAuth();
  const { registros, fechaActiva, getEstadoEmpleado, registrarMovimiento, reloadRegistros, getShiftProgramado, horarios, horariosEmpleado, configuracion } = useJornada();
  const jornadaCfg = configuracion.find((c) => !c.areaId) ?? configuracion[0];
  const maxAlmuerzos = jornadaCfg?.maxAlmuerzosPorJornada ?? 1;
  const break1HoraInicio = jornadaCfg?.break1HoraInicio ?? "09:00";
  const break1HoraFin    = jornadaCfg?.break1HoraFin    ?? "11:00";
  const break2HoraInicio = jornadaCfg?.break2HoraInicio ?? "14:00";
  const break2HoraFin    = jornadaCfg?.break2HoraFin    ?? "16:00";
  const ownArea = profile?.areaId ?? null;

  const isSelfMode = !!autoEmployeeId;
  const nowLocal = new Date();
  const hoy = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, "0")}-${String(nowLocal.getDate()).padStart(2, "0")}`;
  const hoyDia = new Date(`${hoy}T12:00:00`).getDay();
  const nowHHMM = `${String(nowLocal.getHours()).padStart(2, "0")}:${String(nowLocal.getMinutes()).padStart(2, "0")}`;
  const activeEmployees = employees.filter((e) =>
    e.status === "active" || (e.status === "inactive" && !!e.inactiveDate && e.inactiveDate >= hoy)
  );

  // ── Admin state ──────────────────────────────────────────
  const [search,        setSearch]        = useState("");
  const [areaFilter,    setAreaFilter]    = useState(ownArea ?? "all");
  const [pendingAction, setPendingAction] = useState<{ empId: string; tipo: TipoMovimiento } | null>(null);
  const [busy,          setBusy]          = useState(false);
  const [lastMsg,       setLastMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  // ── Self state ───────────────────────────────────────────
  const [obs,      setObs]      = useState("");
  const [msg,      setMsg]      = useState<{ ok: boolean; text: string } | null>(null);
  const [selfBusy, setSelfBusy] = useState(false);

  const filtered = isSelfMode
    ? activeEmployees.filter((e) => e.id === autoEmployeeId)
    : activeEmployees.filter((e) => {
        const matchQ = !search || e.fullName.toLowerCase().includes(search.toLowerCase()) || e.documentId.includes(search);
        const matchA = areaFilter === "all" || e.areaId === areaFilter;
        return matchQ && matchA;
      });

  // Self mode derived values
  const selfEmp      = isSelfMode ? employees.find((e) => e.id === autoEmployeeId) : null;
  const selfShift    = isSelfMode ? getShiftProgramado(autoEmployeeId!, hoy, shifts) : null;
  const selfAbsNote  = selfShift?.code === "ABS" ? parseAbsNote(selfShift.note) : null;
  // Partial absence: note has explicit absStart/absEnd (4 or 6-part format), not just the 2-part full-day
  const selfIsPartialAbs = selfAbsNote != null && (selfShift?.note?.split(":").length ?? 0) >= 4;
  // Derive work hours: use shift.start/end when preserved from original shift, else fallback
  const selfWorkHours = (() => {
    if (!selfIsPartialAbs || !selfAbsNote || !selfShift) return null;
    if (selfShift.start > 0 || selfShift.end > 0) return { start: selfShift.start, end: selfShift.end };
    if (selfAbsNote.workStart != null) return { start: selfAbsNote.workStart, end: selfAbsNote.workEnd! };
    const avail = selfEmp?.availability[hoyDia];
    if (!avail) return null;
    const area = areas.find((a) => a.id === selfEmp?.areaId);
    return computePartialAbsWorkHours(avail, area?.startHour ?? 0, area?.endHour ?? 24, selfAbsNote.absStart, selfAbsNote.absEnd);
  })();
  const selfShiftStart = selfShift && selfShift.code !== "OFF" && selfShift.code !== "ABS"
    ? selfShift.start
    : (selfWorkHours?.start ?? null);
  const selfEst   = isSelfMode
    ? getEstadoEmpleado(autoEmployeeId!, hoy, selfShiftStart)
    : null;
  const selfRegs  = isSelfMode
    ? [...registros.filter((r) => r.employeeId === autoEmployeeId && r.fecha === hoy)]
        .sort((a, b) => new Date(a.horaExacta).getTime() - new Date(b.horaExacta).getTime())
    : [];
  // Verificar si el empleado tiene un horario de jornada activo para hoy (sin turno WFM)
  const selfHasJornadaHorario = useMemo(() => {
    if (!autoEmployeeId) return false;
    const asig = horariosEmpleado.find(
      (x) => x.employeeId === autoEmployeeId && x.activo &&
        x.fechaInicio <= hoy && (!x.fechaFin || x.fechaFin >= hoy),
    );
    if (!asig) return false;
    return horarios.some((h) => h.id === asig.horarioId && h.activo && h.diasAplicables.includes(hoyDia));
  }, [autoEmployeeId, horariosEmpleado, horarios, hoy, hoyDia]);

  const selfCanRegister = (!!selfShift && selfShift.code !== "OFF" && (selfShift.code !== "ABS" || (selfIsPartialAbs && selfWorkHours != null))) || selfHasJornadaHorario;

  const selfBreak1Usado = selfRegs.some((r) => r.tipoMovimiento === "salida_break1");
  const selfBreak2Usado = selfRegs.some((r) => r.tipoMovimiento === "salida_break2");
  const selfAlmuerzos   = selfRegs.filter((r) => r.tipoMovimiento === "salida_almuerzo").length;
  const selfSiguientes = selfEst
    ? (SIGUIENTES_MOVIMIENTOS[selfEst.estado] ?? []).filter((tipo) => {
        if (tipo === "salida_break1")   return !selfBreak1Usado && isWithinWindow(nowHHMM, break1HoraInicio, break1HoraFin);
        if (tipo === "salida_break2")   return !selfBreak2Usado && isWithinWindow(nowHHMM, break2HoraInicio, break2HoraFin);
        if (tipo === "salida_almuerzo") return selfAlmuerzos < maxAlmuerzos;
        return true;
      })
    : [];

  function fmtHora() {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  }

  async function handleAdminRegistrar(empId: string, tipo: TipoMovimiento, obsText: string) {
    if (!user) return;
    setBusy(true);
    const emp    = employees.find((e) => e.id === empId);
    const areaId = emp?.areaId;
    const area   = areas.find((a) => a.id === areaId);
    const result = await registrarMovimiento(empId, tipo, areaId, user.id, obsText || undefined, area?.workingDays);
    setLastMsg({ ok: result.ok, text: result.ok ? "Movimiento registrado." : result.error ?? "Error." });
    if (result.ok) {
      await reloadRegistros(hoy);
      const empName  = emp?.fullName ?? empId;
      const empArea  = areas.find((a) => a.id === areaId)?.name;
      const hora     = fmtHora();
      dispatchJornadaEvent({ data: { tipo, employeeName: empName, hora, areaName: empArea, areaId: areaId ?? null } })
        .catch((e) => console.error("[notif:jornada]", e?.message ?? e));
      dispatchSlackJornada({ data: { tipo, employeeName: empName, hora, areaName: empArea } })
        .catch((e) => console.error("[slack:jornada]", e?.message ?? e));
    }
    setBusy(false);
    setPendingAction(null);
    setTimeout(() => setLastMsg(null), 3000);
  }

  async function handleSelfRegistrar(tipo: TipoMovimiento) {
    if (!autoEmployeeId || !user) return;
    setSelfBusy(true);
    setMsg(null);
    const emp    = employees.find((e) => e.id === autoEmployeeId);
    const areaId = emp?.areaId;
    const area   = areas.find((a) => a.id === areaId);
    const result = await registrarMovimiento(autoEmployeeId, tipo, areaId, user.id, obs || undefined, area?.workingDays);
    setMsg({ ok: result.ok, text: result.ok ? "Movimiento registrado exitosamente." : result.error ?? "Error." });
    if (result.ok) {
      setObs("");
      await reloadRegistros(hoy);
      const selfName = emp?.fullName ?? autoEmployeeId;
      const selfArea = areas.find((a) => a.id === areaId)?.name;
      const selfHora = fmtHora();
      dispatchJornadaEvent({ data: { tipo, employeeName: selfName, hora: selfHora, areaName: selfArea, areaId: areaId ?? null } })
        .catch((e) => console.error("[notif:jornada]", e?.message ?? e));
      dispatchSlackJornada({ data: { tipo, employeeName: selfName, hora: selfHora, areaName: selfArea } })
        .catch((e) => console.error("[slack:jornada]", e?.message ?? e));
    }
    setSelfBusy(false);
  }

  // ── No linked employee ────────────────────────────────────
  if (!autoEmployeeId) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="max-w-sm w-full">
          <div className="rounded-card bg-card p-8 text-center shadow-card space-y-4">
            <div
              className="size-14 rounded-full flex items-center justify-center mx-auto"
              style={{ background: "color-mix(in srgb,var(--color-primary) 10%,transparent)" }}
            >
              <Users className="size-7" style={{ color: "var(--color-primary)" }} />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Sin empleado vinculado</h2>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Tu cuenta de usuario no está vinculada a ningún registro de empleado.
              </p>
            </div>
            <div className="rounded-xl bg-secondary/50 border border-border p-4 text-left space-y-2">
              <p className="text-xs font-semibold">Cómo vincularla:</p>
              <ol className="text-xs text-muted-foreground space-y-1.5">
                {[
                  "Un administrador debe ir a Configuración → Usuarios",
                  "Editar tu usuario y seleccionar tu número de identificación",
                  "Guardar cambios y recargar la página",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className="size-4 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        background: "color-mix(in srgb,var(--color-primary) 20%,transparent)",
                        color: "var(--color-primary)",
                      }}
                    >
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Self mode ─────────────────────────────────────────────
  if (isSelfMode && selfEmp && selfEst) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        {selfShift && selfShift.code !== "OFF" && (selfShift.code !== "ABS" || (selfIsPartialAbs && selfWorkHours != null)) ? (
          <div className="space-y-2">
            <div className="rounded-card border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays className="size-4 text-primary" />
                <h4 className="font-medium text-sm text-primary">Horario programado</h4>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Entrada</div><div className="font-semibold">{String(selfWorkHours ? selfWorkHours.start : selfShift.start).padStart(2,"0")}:00</div></div>
                <div><div className="text-xs text-muted-foreground">Salida</div><div className="font-semibold">{String(selfWorkHours ? selfWorkHours.end : selfShift.end).padStart(2,"0")}:00</div></div>
                <div><div className="text-xs text-muted-foreground">Break</div><div className="font-semibold">{selfWorkHours ? "—" : `${selfShift.breakMinutes} min`}</div></div>
              </div>
            </div>
            {selfIsPartialAbs && selfAbsNote && (
              <div className="rounded-card border border-amber-200 bg-amber-50 p-3 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                <span className="text-sm text-amber-800">
                  Ausencia parcial: {String(selfAbsNote.absStart).padStart(2,"0")}:00 – {String(selfAbsNote.absEnd).padStart(2,"0")}:00
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-card border border-amber-200 bg-amber-50 p-4 flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600 shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              {!selfShift ? "Sin programación para hoy" : selfShift.code === "OFF" ? "Día de descanso" : "Ausencia programada"}
            </span>
          </div>
        )}

        <div className="rounded-card bg-card p-5 shadow-card">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
                {selfEmp.fullName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div>
                <h3 className="font-semibold">{selfEmp.fullName}</h3>
                <p className="text-sm text-muted-foreground">{selfEmp.position}</p>
              </div>
            </div>
            <span className={cn("px-3 py-1 rounded-pill text-sm font-medium", ESTADO_COLORS[selfEst.estado])}>
              {ESTADO_LABELS[selfEst.estado]}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-secondary p-3">
              <div className="text-xs text-muted-foreground mb-1">{t("mi_horario_break1_accum")}</div>
              <div className={cn("font-semibold flex items-center justify-center gap-1", selfEst.break1Excedido && "text-primary")}>
                {selfEst.tiempoEnBreak1Min ? fmtMins(selfEst.tiempoEnBreak1Min) : "—"}
                {selfEst.break1Excedido && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">!</span>}
              </div>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <div className="text-xs text-muted-foreground mb-1">{t("mi_horario_break2_accum")}</div>
              <div className={cn("font-semibold flex items-center justify-center gap-1", selfEst.break2Excedido && "text-primary")}>
                {selfEst.tiempoEnBreak2Min ? fmtMins(selfEst.tiempoEnBreak2Min) : "—"}
                {selfEst.break2Excedido && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">!</span>}
              </div>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <div className="text-xs text-muted-foreground mb-1">{t("mi_horario_lunch_accum")}</div>
              <div className={cn("font-semibold flex items-center justify-center gap-1", selfEst.almuerzoExcedido && "text-primary")}>
                {selfEst.tiempoEnAlmuerzoMin ? fmtMins(selfEst.tiempoEnAlmuerzoMin) : "—"}
                {selfEst.almuerzoExcedido && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">!</span>}
              </div>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <div className="text-xs text-muted-foreground mb-1">{t("jornada_col_en_jornada")}</div>
              <div className="font-semibold">{selfEst.minutosEnJornada ? fmtMins(selfEst.minutosEnJornada) : "—"}</div>
            </div>
          </div>
        </div>

        <div className="rounded-card bg-card p-5 shadow-card space-y-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Registrar movimiento</h4>
          {!selfCanRegister ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              No se permiten registros: sin turno activo para hoy.
            </p>
          ) : selfSiguientes.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No hay movimientos disponibles.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selfSiguientes.map((tipo) => {
                const Icon = TIPO_ICONS[tipo];
                return (
                  <button
                    key={tipo}
                    onClick={() => handleSelfRegistrar(tipo)}
                    disabled={selfBusy}
                    className={cn("flex items-center justify-center gap-2 py-3 px-4 rounded-pill text-sm font-medium transition-all disabled:opacity-50", TIPO_COLORS[tipo])}
                  >
                    <Icon className="size-4" />
                    {TIPO_MOVIMIENTO_LABELS[tipo]}
                  </button>
                );
              })}
            </div>
          )}
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observaciones opcionales..."
            rows={2}
            className="w-full text-sm border border-input rounded-xl px-3 py-2 bg-background outline-none resize-none"
          />
          {msg && (
            <div className={cn("flex items-center gap-2 text-sm rounded-xl px-4 py-3", msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
              {msg.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
              {msg.text}
            </div>
          )}
        </div>

        <div className="rounded-card bg-card p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-sm">Actividad de hoy</h4>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-pill"
              style={{ background: "var(--color-secondary)", color: "var(--color-foreground)" }}
            >
              {selfRegs.length}
            </span>
          </div>
          {selfRegs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Clock className="size-8 opacity-25" />
              <p className="text-sm">Sin registros aún</p>
            </div>
          ) : (
            <div className="relative">
              <div
                className="absolute top-2 bottom-2 w-px"
                style={{ left: 19, background: "var(--color-border)" }}
              />
              <div className="space-y-2.5">
                {selfRegs.map((r) => {
                  const isEntrada  = r.tipoMovimiento === "entrada";
                  const isSalida   = r.tipoMovimiento === "salida";
                  const isAlmuerzo = r.tipoMovimiento.includes("almuerzo");
                  const Icon = isEntrada ? LogIn : isSalida ? LogOut : isAlmuerzo ? UtensilsCrossed : Coffee;
                  const dotBg = isEntrada
                    ? "color-mix(in srgb,#1F8A5B 14%,transparent)"
                    : isSalida
                    ? "color-mix(in srgb,var(--color-primary) 12%,transparent)"
                    : isAlmuerzo
                    ? "var(--color-secondary)"
                    : "color-mix(in srgb,#C98A00 16%,transparent)";
                  const dotColor = isEntrada ? "#1F8A5B"
                    : isSalida ? "var(--color-primary)"
                    : isAlmuerzo ? "var(--color-foreground)"
                    : "#9a6b00";
                  return (
                    <div key={r.id} className="flex items-center gap-3 pl-1">
                      <div
                        className="size-9 rounded-full flex items-center justify-center shrink-0 z-10"
                        style={{ background: dotBg, color: dotColor }}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div
                        className="flex-1 flex items-center justify-between rounded-xl px-3 py-2"
                        style={{ background: "var(--color-secondary)" }}
                      >
                        <span className="text-sm font-medium">{TIPO_MOVIMIENTO_LABELS[r.tipoMovimiento]}</span>
                        <div className="flex items-center gap-2">
                          {r.esModificacion && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-pill"
                              style={{ background: "color-mix(in srgb,#C98A00 16%,transparent)", color: "#9a6b00" }}
                            >
                              Modificado
                            </span>
                          )}
                          <span className="font-mono text-sm tabular-nums">{fmtTime(r.horaExacta)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Admin mode: card grid ──────────────────────────────────
  return (
    <div className="px-4 md:px-6 py-4 md:py-6 max-w-[1280px] mx-auto space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-pill border border-border bg-card px-3.5 py-2 w-full sm:w-72 focus-within:border-primary/40 transition-shadow">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar empleado..."
            className="bg-transparent text-sm outline-none flex-1"
          />
        </div>
        {ownArea ? (
          <span className="text-sm rounded-pill border border-border bg-card px-3.5 py-2 text-muted-foreground">
            {areas.find((a) => a.id === ownArea)?.name ?? "Mi área"}
          </span>
        ) : (
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="text-sm rounded-pill border border-border bg-card px-3.5 py-2 outline-none"
          >
            <option value="all">{t("jornada_all_areas")}</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} empleado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {lastMsg && (
        <div className={cn("flex items-center gap-2 text-sm rounded-xl px-4 py-3 border",
          lastMsg.ok
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-red-50 border-red-200 text-red-700"
        )}>
          {lastMsg.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
          {lastMsg.text}
        </div>
      )}

      {/* Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:"1rem" }}>
        {filtered.map((emp) => {
          const shift      = getShiftProgramado(emp.id, hoy, shifts);
          const est        = getEstadoEmpleado(emp.id, hoy, shift && shift.code !== "OFF" && shift.code !== "ABS" ? shift.start : null);
          const regsHoy    = registros.filter((r) => r.employeeId === emp.id && r.fecha === hoy);
          const break1Usado     = regsHoy.some((r) => r.tipoMovimiento === "salida_break1");
          const break2Usado     = regsHoy.some((r) => r.tipoMovimiento === "salida_break2");
          const almuerzosUsados = regsHoy.filter((r) => r.tipoMovimiento === "salida_almuerzo").length;
          const siguientes      = (SIGUIENTES_MOVIMIENTOS[est.estado] ?? []).filter((tipo) => {
            if (tipo === "salida_break1")   return !break1Usado && isWithinWindow(nowHHMM, break1HoraInicio, break1HoraFin);
            if (tipo === "salida_break2")   return !break2Usado && isWithinWindow(nowHHMM, break2HoraInicio, break2HoraFin);
            if (tipo === "salida_almuerzo") return almuerzosUsados < maxAlmuerzos;
            return true;
          });
          const initials    = emp.fullName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
          const areaName    = areas.find((a) => a.id === emp.areaId)?.name ?? "—";
          const hasShift    = shift && shift.code !== "OFF" && shift.code !== "ABS";
          const entradaReg  = regsHoy.find((r) => r.tipoMovimiento === "entrada");

          return (
            <div
              key={emp.id}
              className="rounded-card bg-card shadow-card p-4 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{emp.fullName}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{emp.position} · {areaName}</div>
                </div>
                <span className={cn("text-[10px] px-2.5 py-1 rounded-pill font-medium shrink-0 leading-none", ESTADO_COLORS[est.estado])}>
                  {ESTADO_LABELS[est.estado]}
                </span>
              </div>

              {/* Shift badge */}
              <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-1.5 text-xs">
                <Clock className="size-3 text-muted-foreground shrink-0" />
                {hasShift ? (
                  <span className="font-medium">
                    {String(shift.start).padStart(2,"0")}:00 – {String(shift.end).padStart(2,"0")}:00
                    <span className="ml-1.5 text-muted-foreground font-normal">{shift.code}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {!shift ? "Sin programar" : shift.code === "OFF" ? "Descanso" : "Ausencia"}
                  </span>
                )}
                {est.esTarde && hasShift && (
                  <span className="ml-auto text-primary font-medium">+{fmtMins(est.minutosRetraso)}</span>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="text-center bg-secondary/40 rounded-lg py-1.5 px-1">
                  <div className="text-[10px] text-muted-foreground">Entrada</div>
                  <div className="text-xs font-semibold tabular-nums">{entradaReg ? fmtTime(entradaReg.horaExacta) : "—"}</div>
                </div>
                <div className="text-center bg-secondary/40 rounded-lg py-1.5 px-1">
                  <div className="text-[10px] text-muted-foreground">Break 1</div>
                  <div className={cn("text-xs font-semibold", est.break1Excedido && "text-primary")}>
                    {est.tiempoEnBreak1Min ? fmtMins(est.tiempoEnBreak1Min) : "—"}
                  </div>
                </div>
                <div className="text-center bg-secondary/40 rounded-lg py-1.5 px-1">
                  <div className="text-[10px] text-muted-foreground">Break 2</div>
                  <div className={cn("text-xs font-semibold", est.break2Excedido && "text-primary")}>
                    {est.tiempoEnBreak2Min ? fmtMins(est.tiempoEnBreak2Min) : "—"}
                  </div>
                </div>
                <div className="text-center bg-secondary/40 rounded-lg py-1.5 px-1">
                  <div className="text-[10px] text-muted-foreground">Jornada</div>
                  <div className="text-xs font-semibold">{est.minutosEnJornada ? fmtMins(est.minutosEnJornada) : "—"}</div>
                </div>
              </div>

              {/* Actions */}
              {!hasShift ? (
                <div className="text-[11px] text-muted-foreground text-center py-1 italic">Sin turno activo</div>
              ) : siguientes.length === 0 ? (
                <div className="text-[11px] text-muted-foreground text-center py-1 italic">Sin acciones disponibles</div>
              ) : siguientes.length === 3 ? (
                /* 3 actions: Break + Almuerzo in top row, Salida full-width below */
                <div className="flex flex-col gap-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    {siguientes.slice(0, 2).map((tipo) => {
                      const Icon = TIPO_ICONS[tipo];
                      return (
                        <button
                          key={tipo}
                          onClick={() => setPendingAction({ empId: emp.id, tipo })}
                          disabled={busy}
                          className={cn("flex items-center justify-center gap-1.5 py-2 px-3 rounded-pill text-xs font-medium transition-all disabled:opacity-50", TIPO_COLORS[tipo])}
                        >
                          <Icon className="size-3.5 shrink-0" />
                          {TIPO_SHORT_LABELS[tipo]}
                        </button>
                      );
                    })}
                  </div>
                  {(() => {
                    const tipo = siguientes[2];
                    const Icon = TIPO_ICONS[tipo];
                    return (
                      <button
                        onClick={() => setPendingAction({ empId: emp.id, tipo })}
                        disabled={busy}
                        className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-pill text-xs font-semibold transition-all disabled:opacity-50", TIPO_COLORS[tipo])}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        {TIPO_MOVIMIENTO_LABELS[tipo]}
                      </button>
                    );
                  })()}
                </div>
              ) : (
                <div className={cn("grid gap-1.5", siguientes.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                  {siguientes.map((tipo) => {
                    const Icon = TIPO_ICONS[tipo];
                    return (
                      <button
                        key={tipo}
                        onClick={() => setPendingAction({ empId: emp.id, tipo })}
                        disabled={busy}
                        className={cn("flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-pill text-xs font-medium transition-all disabled:opacity-50", TIPO_COLORS[tipo])}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        {TIPO_MOVIMIENTO_LABELS[tipo]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
            Sin empleados para los filtros seleccionados
          </div>
        )}
      </div>

      {pendingAction && (
        <RegistrarModal
          employeeName={employees.find((e) => e.id === pendingAction.empId)?.fullName ?? ""}
          tipo={pendingAction.tipo}
          busy={busy}
          onConfirm={(obsText) => handleAdminRegistrar(pendingAction.empId, pendingAction.tipo, obsText)}
          onClose={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}

function RegistrarModal({
  employeeName, tipo, busy, onConfirm, onClose,
}: {
  employeeName: string;
  tipo: TipoMovimiento;
  busy: boolean;
  onConfirm: (obs: string) => void;
  onClose: () => void;
}) {
  const [obs, setObs] = useState("");
  const Icon = TIPO_ICONS[tipo];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-card shadow-card max-w-sm w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold">{TIPO_MOVIMIENTO_LABELS[tipo]}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{employeeName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="size-4" /></button>
        </div>
        <ModalField label="Observaciones (opcional)">
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observaciones opcionales..."
            rows={2}
            autoFocus
            className="w-full text-sm border border-input rounded-xl px-3 py-2 bg-background outline-none resize-none"
          />
        </ModalField>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(obs)}
            disabled={busy}
            className={cn("inline-flex items-center gap-2 text-sm px-4 py-2 rounded-pill font-medium disabled:opacity-50", TIPO_COLORS[tipo])}
          >
            {busy && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            <Icon className="size-3.5" />
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TAB: Historial ─────────────────────────────────────────

function TabHistorial() {
  const { t } = useI18n();
  const { employees, areas } = useWFM();
  const { user, profile } = useAuth();
  const { registros, modificaciones, editarRegistro, eliminarRegistro, agregarRegistroManual, fechaActiva, setFechaActiva, reloadRegistros } = useJornada();
  const ownArea = profile?.areaId ?? null;
  const [empFilter,  setEmpFilter]  = useState("all");
  const [areaFilter, setAreaFilter] = useState(ownArea ?? "all");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [editingReg, setEditingReg] = useState<JornadaRegistro | null>(null);
  const [showAddManual,  setShowAddManual]  = useState(false);
  const [deleteConfirm,  setDeleteConfirm]  = useState<{ reg: JornadaRegistro; motivo: string } | null>(null);
  const [detailReg, setDetailReg] = useState<JornadaRegistro | null>(null);

  const list = useMemo(() => {
    return registros
      .filter((r) => r.fecha === fechaActiva)
      .filter((r) => empFilter  === "all" || r.employeeId === empFilter)
      .filter((r) => {
        if (areaFilter === "all") return true;
        return employees.find((e) => e.id === r.employeeId)?.areaId === areaFilter;
      })
      .filter((r) => tipoFilter === "all" || r.tipoMovimiento === tipoFilter)
      .sort((a, b) => new Date(a.horaExacta).getTime() - new Date(b.horaExacta).getTime());
  }, [registros, fechaActiva, empFilter, areaFilter, tipoFilter, employees]);

  return (
    <div className="px-4 md:px-6 py-4 md:py-6 max-w-[1280px] mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={fechaActiva}
          onChange={(e) => setFechaActiva(e.target.value)}
          className="text-sm rounded-pill border border-border bg-card px-3 py-2"
        />
        <select value={empFilter}  onChange={(e) => setEmpFilter(e.target.value)}  className="text-sm rounded-pill border border-border bg-card px-3 py-2">
          <option value="all">Todos los empleados</option>
          {(ownArea ? employees.filter((e) => e.areaId === ownArea) : employees).map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
        </select>
        {ownArea ? (
          <span className="text-sm rounded-pill border border-border bg-card px-3 py-2 text-muted-foreground">
            {areas.find((a) => a.id === ownArea)?.name ?? "Mi área"}
          </span>
        ) : (
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className="text-sm rounded-pill border border-border bg-card px-3 py-2">
            <option value="all">{t("jornada_all_areas")}</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)} className="text-sm rounded-pill border border-border bg-card px-3 py-2">
          <option value="all">{t("jornada_all_movements")}</option>
          {(Object.entries(TIPO_MOVIMIENTO_LABELS) as [TipoMovimiento, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button onClick={() => reloadRegistros(fechaActiva)} className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary">
          <RefreshCw className="size-4" /> {t("jornada_update")}
        </button>
        <button onClick={() => setShowAddManual(true)} className="ml-auto inline-flex items-center gap-2 rounded-pill bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="size-4" /> {t("jornada_add_manual")}
        </button>
      </div>

      <div className="rounded-card bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                {[t("jornada_col_worker"),t("jornada_col_area"),t("jornada_col_movement"),t("jornada_col_time"),t("jornada_col_status"),t("jornada_col_notes"),t("jornada_col_modification"),""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const emp  = employees.find((e) => e.id === r.employeeId);
                const area = areas.find((a) => a.id === (emp?.areaId ?? r.areaId));
                const lastMod = modificaciones
                  .filter((m) => m.registroId === r.id)
                  .sort((a, b) => new Date(b.fechaModificacion).getTime() - new Date(a.fechaModificacion).getTime())[0];
                return (
                  <tr key={r.id} className="border-t border-border/60 hover:bg-secondary/60 transition-colors">
                    <td className="px-4 py-3 font-medium">{emp?.fullName ?? r.employeeId}</td>
                    <td className="px-4 py-3 text-muted-foreground">{area?.name ?? "—"}</td>
                    <td className="px-4 py-3">{TIPO_MOVIMIENTO_LABELS[r.tipoMovimiento]}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">{fmtTime(r.horaExacta)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center rounded-pill px-3 py-1 text-[11px] font-medium",
                        r.estado === "valido"     ? "bg-[color-mix(in_srgb,#1F8A5B_14%,transparent)] text-[#1F8A5B]" :
                        r.estado === "modificado" ? "bg-[color-mix(in_srgb,#C98A00_16%,transparent)] text-[#9a6b00]" :
                        r.estado === "irregular"  ? "bg-primary/12 text-primary" :
                        "bg-secondary text-muted-foreground"
                      )}>
                        {ESTADO_REGISTRO_LABELS[r.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{r.observaciones ?? "—"}</td>
                    <td className="px-4 py-3 max-w-[220px]">
                      {lastMod ? (
                        <div className="space-y-0.5">
                          <p className="text-xs text-foreground leading-snug line-clamp-2" title={lastMod.motivo}>{lastMod.motivo}</p>
                          <p className="text-[11px] text-muted-foreground">{lastMod.nombreUsuario ?? lastMod.usuarioId.slice(0, 8)}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setDetailReg(r)}
                          className="text-[12px] px-2.5 py-1 rounded-pill hover:bg-secondary text-muted-foreground transition-colors"
                        >
                          Ver detalle
                        </button>
                        <button onClick={() => setEditingReg(r)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Edit3 className="size-4" /></button>
                        <button onClick={() => setDeleteConfirm({ reg: r, motivo: "" })} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Sin registros para los filtros seleccionados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingReg && user && (
        <EditarRegistroModal
          registro={editingReg}
          onClose={() => setEditingReg(null)}
          onSave={async (nuevaHora, motivo) => {
            const nombre = profile?.nombre || profile?.fullName || user.email;
            await editarRegistro(editingReg, nuevaHora, motivo, user.id, nombre);
            setEditingReg(null);
          }}
        />
      )}

      {deleteConfirm && user && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-card shadow-card max-w-md w-full p-6 space-y-4">
            <h3 className="font-semibold">Eliminar registro</h3>
            <p className="text-sm text-muted-foreground">Esta acción quedará auditada. Indica el motivo de eliminación.</p>
            <textarea
              placeholder="Motivo obligatorio..."
              rows={3}
              value={deleteConfirm.motivo}
              onChange={(e) => setDeleteConfirm({ ...deleteConfirm, motivo: e.target.value })}
              className="w-full text-sm border border-input rounded-xl px-3 py-2 bg-background outline-none resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary">Cancelar</button>
              <button
                disabled={!deleteConfirm.motivo.trim()}
                onClick={async () => {
                  const nombre = profile?.nombre || profile?.fullName || user.email;
                  await eliminarRegistro(deleteConfirm.reg.id, deleteConfirm.motivo, user.id, nombre);
                  setDeleteConfirm(null);
                }}
                className="text-sm px-4 py-2 rounded-pill bg-destructive text-white hover:opacity-90 disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddManual && user && (
        <AgregarManualModal
          employees={employees}
          areas={areas}
          fecha={fechaActiva}
          onClose={() => setShowAddManual(false)}
          onSave={async (r: Omit<JornadaRegistro, "id" | "createdAt">, motivo: string) => {
            const nombre = profile?.nombre || profile?.fullName || user.email;
            await agregarRegistroManual(r, motivo, user.id, nombre);
            setShowAddManual(false);
          }}
        />
      )}

      {detailReg && (
        <DetalleRegistroModal
          registro={detailReg}
          empName={employees.find((e) => e.id === detailReg.employeeId)?.fullName ?? detailReg.employeeId}
          areaName={areas.find((a) => a.id === (employees.find((e) => e.id === detailReg.employeeId)?.areaId ?? detailReg.areaId))?.name}
          modificaciones={modificaciones
            .filter((m) => m.registroId === detailReg.id)
            .sort((a, b) => new Date(b.fechaModificacion).getTime() - new Date(a.fechaModificacion).getTime())}
          onClose={() => setDetailReg(null)}
        />
      )}
    </div>
  );
}

function DetalleRegistroModal({ registro, empName, areaName, modificaciones, onClose }: {
  registro: JornadaRegistro;
  empName: string;
  areaName?: string;
  modificaciones: JornadaModificacion[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-card rounded-card shadow-card max-w-[440px] w-full my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{empName}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{TIPO_MOVIMIENTO_LABELS[registro.tipoMovimiento]}</div>
          </div>
          <button onClick={onClose} className="size-7 rounded-full flex items-center justify-center hover:bg-secondary text-muted-foreground">×</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "68vh" }}>
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span className="text-muted-foreground text-xs">Área</span>
              <span className="font-medium text-xs">{areaName ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span className="text-muted-foreground text-xs">Fecha</span>
              <span className="font-medium text-xs">{registro.fecha}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span className="text-muted-foreground text-xs">Hora</span>
              <span className="font-medium text-xs">{fmtTime(registro.horaExacta)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span className="text-muted-foreground text-xs">Estado</span>
              <span className="font-medium text-xs">{ESTADO_REGISTRO_LABELS[registro.estado]}</span>
            </div>
          </div>

          {registro.observaciones && (
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Observaciones</div>
              <div className="rounded-lg bg-secondary/60 px-3 py-2.5 text-sm text-foreground leading-relaxed">
                {registro.observaciones}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Historial de modificaciones</div>
            {modificaciones.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin modificaciones registradas.</p>
            ) : (
              <div className="space-y-2">
                {modificaciones.map((m) => (
                  <div key={m.id} className="rounded-lg border border-border px-3 py-2.5 text-sm space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{m.nombreUsuario ?? m.usuarioId.slice(0, 8)}</span>
                      <span>{fmtTime(m.fechaModificacion)} · {new Date(m.fechaModificacion).toLocaleDateString()}</span>
                    </div>
                    <p className="text-foreground leading-relaxed">{m.motivo}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary transition-colors">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function EditarRegistroModal({ registro, onClose, onSave }: { registro: JornadaRegistro; onClose: () => void; onSave: (hora: string, motivo: string) => Promise<void> }) {
  const currentTime = new Date(registro.horaExacta).toTimeString().slice(0, 5);
  const [hora,  setHora]  = useState(currentTime);
  const [motivo, setMotivo] = useState("");
  const [busy,  setBusy]  = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-card shadow-card max-w-md w-full p-6 space-y-4 overflow-y-auto max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">Editar hora de registro</h3>
        <p className="text-sm text-muted-foreground">
          Modificando: <strong>{TIPO_MOVIMIENTO_LABELS[registro.tipoMovimiento]}</strong> del {registro.fecha}
        </p>
        <ModalField label="Nueva hora">
          <input type="time" className="input" value={hora} onChange={(e) => setHora(e.target.value)} />
        </ModalField>
        <ModalField label="Motivo de modificación (obligatorio)">
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="w-full text-sm border border-input rounded-xl px-3 py-2 bg-background outline-none resize-none" />
        </ModalField>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary">Cancelar</button>
          <button
            disabled={!motivo.trim() || busy}
            onClick={async () => {
              setBusy(true);
              await onSave(new Date(`${registro.fecha}T${hora}:00`).toISOString(), motivo);
              setBusy(false);
            }}
            className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
        <style>{`.input{width:100%;border:1px solid var(--color-input);border-radius:999px;padding:.5rem .75rem;font-size:.875rem;background:var(--color-card)}`}</style>
      </div>
    </div>
  );
}

function AgregarManualModal({ employees, areas, fecha, onClose, onSave }: any) {
  const [form, setForm] = useState({
    employeeId:     employees[0]?.id ?? "",
    tipoMovimiento: "entrada" as TipoMovimiento,
    hora:           "08:00",
    observaciones:  "",
    motivo:         "",
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-card shadow-card max-w-md w-full p-6 space-y-4 overflow-y-auto max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">Agregar registro manual</h3>
        <ModalField label="Empleado">
          <select className="input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
            {employees.map((e: any) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </select>
        </ModalField>
        <ModalField label="Tipo de movimiento">
          <select className="input" value={form.tipoMovimiento} onChange={(e) => setForm({ ...form, tipoMovimiento: e.target.value as TipoMovimiento })}>
            {(Object.entries(TIPO_MOVIMIENTO_LABELS) as [TipoMovimiento, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </ModalField>
        <ModalField label="Hora">
          <input type="time" className="input" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
        </ModalField>
        <ModalField label="Observaciones">
          <input className="input" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
        </ModalField>
        <ModalField label="Motivo (obligatorio)">
          <textarea value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} rows={2} className="w-full text-sm border border-input rounded-xl px-3 py-2 bg-background outline-none resize-none" />
        </ModalField>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary">Cancelar</button>
          <button
            disabled={!form.motivo.trim()}
            onClick={() => {
              const emp = employees.find((e: any) => e.id === form.employeeId);
              onSave({
                employeeId:     form.employeeId,
                fecha,
                horaExacta:     new Date(`${fecha}T${form.hora}:00`).toISOString(),
                tipoMovimiento: form.tipoMovimiento,
                areaId:         emp?.areaId,
                observaciones:  form.observaciones || undefined,
                estado:         "modificado" as const,
                esModificacion: true,
              }, form.motivo);
            }}
            className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
        <style>{`.input{width:100%;border:1px solid var(--color-input);border-radius:999px;padding:.5rem .75rem;font-size:.875rem;background:var(--color-card)}`}</style>
      </div>
    </div>
  );
}

// ── TAB: Reportes ──────────────────────────────────────────

function TabReportes({ autoEmployeeId }: { autoEmployeeId: string | null }) {
  const { t } = useI18n();
  const { employees } = useWFM();
  const { profile } = useAuth();
  const { registros, loadRango } = useJornada();

  const [desde, setDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => { loadRango(desde, hasta); }, [desde, hasta]);

  const selfEmployee = useMemo(
    () => (autoEmployeeId ? employees.find((e) => e.id === autoEmployeeId) ?? null : null),
    [autoEmployeeId, employees],
  );
  const selfDays = useMemo(() => {
    if (!autoEmployeeId) return [];
    const regs = registros.filter((r) => r.employeeId === autoEmployeeId && r.fecha >= desde && r.fecha <= hasta);
    return [...new Set(regs.map((r) => r.fecha))].sort().map((fecha) => ({
      fecha, ...calcDayStats(regs.filter((r) => r.fecha === fecha)),
    }));
  }, [autoEmployeeId, registros, desde, hasta]);
  const selfTotals = useMemo(() =>
    selfDays.reduce((acc, d) => ({
      dias:          acc.dias          + (d.entrada ? 1 : 0),
      diasCompletos: acc.diasCompletos + (d.salida  ? 1 : 0),
      jornadaMin:    acc.jornadaMin    + d.jornadaMin,
      breakMin:      acc.breakMin      + d.breakMin,
      breakMin1:     acc.breakMin1     + d.breakMin1,
      breakMin2:     acc.breakMin2     + d.breakMin2,
      almuerzoMin:   acc.almuerzoMin   + d.almuerzoMin,
      efectivoMin:   acc.efectivoMin   + d.efectivoMin,
    }), { dias: 0, diasCompletos: 0, jornadaMin: 0, breakMin: 0, breakMin1: 0, breakMin2: 0, almuerzoMin: 0, efectivoMin: 0 }),
    [selfDays],
  );

  function exportSelfCSV() {
    const rows = selfDays.map((d) =>
      `${fmtFecha(d.fecha)},${fmtTime(d.entrada?.horaExacta)},${fmtTime(d.salida?.horaExacta)},${fmtMins(d.breakMin1)},${fmtMins(d.breakMin2)},${fmtMins(d.almuerzoMin)},${fmtMins(d.jornadaMin)},${fmtMins(d.efectivoMin)}`
    );
    const csv = "Fecha,Entrada,Salida,Break 1,Break 2,Almuerzo,Jornada,Efectivo\n" + rows.join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `mi_jornada_${desde}_${hasta}.csv`;
    a.click();
  }

  if (!autoEmployeeId) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="max-w-sm w-full">
          <div className="rounded-card bg-card p-8 text-center shadow-card space-y-4">
            <div
              className="size-14 rounded-full flex items-center justify-center mx-auto"
              style={{ background: "color-mix(in srgb,var(--color-primary) 10%,transparent)" }}
            >
              <Users className="size-7" style={{ color: "var(--color-primary)" }} />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Sin empleado vinculado</h2>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Tu cuenta de usuario no está vinculada a ningún registro de empleado.
              </p>
            </div>
            <div className="rounded-xl bg-secondary/50 border border-border p-4 text-left space-y-2">
              <p className="text-xs font-semibold">Cómo vincularla:</p>
              <ol className="text-xs text-muted-foreground space-y-1.5">
                {[
                  "Un administrador debe ir a Configuración → Usuarios",
                  "Editar tu usuario y seleccionar tu número de identificación",
                  "Guardar cambios y recargar la página",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className="size-4 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        background: "color-mix(in srgb,var(--color-primary) 20%,transparent)",
                        color: "var(--color-primary)",
                      }}
                    >
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const avgEfectivo = selfTotals.diasCompletos > 0 ? Math.round(selfTotals.efectivoMin / selfTotals.diasCompletos) : 0;
  return (
    <div className="px-4 md:px-6 py-4 md:py-6 max-w-[1280px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Mi Reporte de Jornada</h2>
          {selfEmployee && <p className="text-sm text-muted-foreground mt-0.5">{selfEmployee.fullName}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-pill border border-border bg-card px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-pill border border-border bg-card px-3 py-2 text-sm" />
          </label>
          <button onClick={exportSelfCSV} className="inline-flex items-center gap-2 rounded-pill border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
            <Download className="size-4" /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI icon={CalendarDays}  label="Días trabajados"  value={selfTotals.dias} />
        <KPI icon={Clock}         label="Tiempo en jornada" value={fmtMins(selfTotals.jornadaMin)} />
        <KPI icon={Coffee}        label="Tiempo efectivo"   value={fmtMins(selfTotals.efectivoMin)} />
        <KPI icon={CheckCircle2}  label="Promedio diario"   value={fmtMins(avgEfectivo)} hint="tiempo efectivo / día" />
      </div>

      <div className="rounded-card bg-card shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/40">
          <h3 className="font-semibold text-sm">Detalle por día</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-left">
            <tr>
              {[t("jornada_historial_col_date"),t("jornada_historial_col_entry"),t("jornada_historial_col_exit"),t("jornada_col_break1"),t("jornada_col_break2"),t("jornada_col_almuerzo"),t("jornada_historial_col_time"),t("jornada_historial_col_effective"),t("jornada_col_status")].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selfDays.map((d) => {
              const completo = !!d.entrada && !!d.salida;
              return (
                <tr key={d.fecha} className="border-t border-border/60 hover:bg-secondary/60 transition-colors">
                  <td className="px-4 py-3 font-medium">{fmtFecha(d.fecha)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmtTime(d.entrada?.horaExacta)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmtTime(d.salida?.horaExacta)}</td>
                  <td className="px-4 py-3">{d.breakMin1  > 0 ? fmtMins(d.breakMin1) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3">{d.breakMin2  > 0 ? fmtMins(d.breakMin2) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3">{d.almuerzoMin > 0 ? fmtMins(d.almuerzoMin) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3">{fmtMins(d.jornadaMin)}</td>
                  <td className="px-4 py-3 font-medium text-[#1F8A5B]">{fmtMins(d.efectivoMin)}</td>
                  <td className="px-4 py-3">
                    {completo
                      ? <span className="inline-flex items-center gap-1 rounded-pill bg-[color-mix(in_srgb,#1F8A5B_12%,transparent)] text-[#1F8A5B] px-2.5 py-0.5 text-[11px] font-medium"><CheckCircle2 className="size-3" />Completo</span>
                      : <span className="inline-flex items-center gap-1 rounded-pill bg-[color-mix(in_srgb,#C98A00_12%,transparent)] text-[#9a6b00] px-2.5 py-0.5 text-[11px] font-medium"><AlertTriangle className="size-3" />Incompleto</span>}
                  </td>
                </tr>
              );
            })}
            {selfDays.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">Sin registros en el período</td></tr>
            )}
          </tbody>
        </table>
        {selfDays.length > 0 && (
          <div className="px-4 py-3 bg-secondary/20 border-t border-border flex flex-wrap gap-6 text-xs text-muted-foreground">
            <span>Total jornada: <strong className="text-foreground">{fmtMins(selfTotals.jornadaMin)}</strong></span>
            <span>Total Break 1: <strong className="text-foreground">{fmtMins(selfTotals.breakMin1)}</strong></span>
            <span>Total Break 2: <strong className="text-foreground">{fmtMins(selfTotals.breakMin2)}</strong></span>
            <span>Total almuerzo: <strong className="text-foreground">{fmtMins(selfTotals.almuerzoMin)}</strong></span>
            <span>Total efectivo: <strong className="text-[#1F8A5B]">{fmtMins(selfTotals.efectivoMin)}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TAB: Reporte de jornada ─────────────────────────────────

function TabReporteGeneral() {
  const { t } = useI18n();
  const { employees, areas, shifts } = useWFM();
  const { profile } = useAuth();
  const { registros, configuracion, loadRango, horarios, horariosEmpleado, getShiftProgramado } = useJornada();
  const config = configuracion.find((c) => !c.areaId) ?? configuracion[0];
  const ownArea = profile?.areaId ?? null;

  // Minutos programados (turno WFM u horario de jornada) para un empleado en una fecha,
  // usados para calcular el tiempo "adicional" (efectivo por encima de lo programado).
  function getProgramadoMin(emp: (typeof employees)[number], fecha: string): number {
    const shift = getShiftProgramado(emp.id, fecha, shifts);
    if (shift) {
      if (shift.code === "OFF") return 0;
      if (shift.code === "ABS") {
        const absNote = parseAbsNote(shift.note);
        const isPartialAbs = absNote != null && (shift.note?.split(":").length ?? 0) >= 4;
        if (!isPartialAbs || !absNote) return 0; // ausencia completa: sin tiempo programado
        let workHours: { start: number; end: number } | null = null;
        if (shift.start > 0 || shift.end > 0) {
          workHours = { start: shift.start, end: shift.end };
        } else if (absNote.workStart != null) {
          workHours = { start: absNote.workStart, end: absNote.workEnd! };
        } else {
          const dow = new Date(`${fecha}T12:00:00`).getDay();
          const avail = emp.availability[dow];
          const area = areas.find((a) => a.id === emp.areaId);
          workHours = avail ? computePartialAbsWorkHours(avail, area?.startHour ?? 0, area?.endHour ?? 24, absNote.absStart, absNote.absEnd) : null;
        }
        return workHours ? Math.max(0, (workHours.end - workHours.start) * 60) : 0;
      }
      return Math.max(0, (shift.end - shift.start) * 60 - (shift.breakMinutes ?? 0));
    }
    // Sin turno WFM: revisar horario de jornada asignado
    const dow = new Date(`${fecha}T12:00:00`).getDay();
    const asig = horariosEmpleado.find(
      (x) => x.employeeId === emp.id && x.activo && x.fechaInicio <= fecha && (!x.fechaFin || x.fechaFin >= fecha),
    );
    const horario = asig ? horarios.find((h) => h.id === asig.horarioId && h.activo && h.diasAplicables.includes(dow)) : undefined;
    if (!horario?.horaEntrada || !horario?.horaSalida) return 0;
    const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + m; };
    let mins = toMin(horario.horaSalida) - toMin(horario.horaEntrada);
    if (horario.breakInicio && horario.breakFin) mins -= (toMin(horario.breakFin) - toMin(horario.breakInicio));
    return Math.max(0, mins);
  }

  const [desde, setDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => { loadRango(desde, hasta); }, [desde, hasta]);

  const [areaFilter, setAreaFilter] = useState(ownArea ?? "all");
  const [openReport, setOpenReport] = useState<"trabajador" | "puntualidad" | null>(null);

  // General report mode
  const effectiveArea = ownArea ?? (areaFilter !== "all" ? areaFilter : null);
  const empList = employees.filter((e) =>
    (!effectiveArea || e.areaId === effectiveArea) &&
    (e.status === "active" || (e.status === "inactive" && !!e.inactiveDate && e.inactiveDate >= desde))
  );

  const stats = empList.map((emp) => {
    const regs   = registros.filter((r) => r.employeeId === emp.id && r.fecha >= desde && r.fecha <= hasta);
    const fechas = [...new Set(regs.map((r) => r.fecha))];
    let totalJornadaMin = 0, totalBreak1Min = 0, totalBreak2Min = 0, totalAlmuerzoMin = 0, totalEfectivoMin = 0, totalAdicionalMin = 0, diasTrabajados = 0;
    fechas.forEach((fecha) => {
      const s = calcDayStats(regs.filter((r) => r.fecha === fecha));
      if (s.entrada) diasTrabajados++;
      totalJornadaMin  += s.jornadaMin;
      totalBreak1Min   += s.breakMin1;
      totalBreak2Min   += s.breakMin2;
      totalAlmuerzoMin += s.almuerzoMin;
      totalEfectivoMin += s.efectivoMin;
      const programadoMin = getProgramadoMin(emp, fecha);
      totalAdicionalMin += Math.max(0, s.efectivoMin - programadoMin);
    });
    const punct = calcPunctuality(regs, config);
    return { emp, diasTrabajados, totalJornadaMin, totalBreak1Min, totalBreak2Min, totalAlmuerzoMin, totalEfectivoMin, totalAdicionalMin, punct };
  });

  function exportCSV() {
    const rows = stats.map((s) => {
      const area = areas.find((a) => a.id === s.emp.areaId)?.name ?? "";
      return `"${s.emp.fullName}","${area}",${s.diasTrabajados},${fmtMins(s.totalJornadaMin)},${fmtMins(s.totalBreak1Min)},${fmtMins(s.totalBreak2Min)},${fmtMins(s.totalAlmuerzoMin)},${fmtMins(s.totalEfectivoMin)},${fmtMins(s.totalAdicionalMin)}`;
    });
    const csv = "Empleado,Área,Días trabajados,Horas jornada,Break 1,Break 2,Almuerzo,Efectivo,Adicional\n" + rows.join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `jornada_${desde}_${hasta}.csv`;
    a.click();
  }

  return (
    <div className="px-4 md:px-6 py-4 md:py-6 max-w-[1280px] mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Reporte de jornada</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Tiempo y puntualidad por empleado</p>
      </div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-pill border border-border bg-card px-3 py-2 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-pill border border-border bg-card px-3 py-2 text-sm" />
        </label>
        {ownArea ? (
          <span className="text-sm rounded-pill border border-border bg-card px-3 py-2 text-muted-foreground">
            {areas.find((a) => a.id === ownArea)?.name ?? "Mi área"}
          </span>
        ) : (
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className="text-sm rounded-pill border border-border bg-card px-3 py-2">
            <option value="all">{t("jornada_all_areas")}</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <button onClick={exportCSV} className="ml-auto inline-flex items-center gap-2 rounded-pill border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
          <Download className="size-4" /> {t("reports_download")}
        </button>
      </div>

      {/* Análisis de jornada laboral */}
      <div className="rounded-card bg-card shadow-card overflow-hidden">
        <button
          onClick={() => setOpenReport(openReport === "trabajador" ? null : "trabajador")}
          className="w-full flex items-center justify-between gap-4 px-5 py-3 border-b border-border bg-secondary/40 hover:bg-secondary/60 transition-colors text-left"
        >
          <div>
            <h3 className="font-semibold text-sm">Análisis de jornada laboral</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Días trabajados, breaks, almuerzo, tiempo efectivo y adicional por cada trabajador.</p>
          </div>
          <ChevronRight className={cn("size-4 text-muted-foreground transition-transform shrink-0", openReport === "trabajador" && "rotate-90")} />
        </button>
        <div className={cn("grid transition-[grid-template-rows] duration-300 ease-in-out", openReport === "trabajador" ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                {[t("jornada_col_worker"),t("jornada_col_area"),t("jornada_historial_col_days"),t("jornada_historial_col_time"),t("jornada_col_break1"),t("jornada_col_break2"),t("jornada_col_almuerzo"),t("jornada_historial_col_effective"),t("jornada_col_adicional")].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map(({ emp, diasTrabajados, totalJornadaMin, totalBreak1Min, totalBreak2Min, totalAlmuerzoMin, totalEfectivoMin, totalAdicionalMin }) => (
                <tr key={emp.id} className="border-t border-border/60 hover:bg-secondary/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                        {emp.fullName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <span className="font-medium">{emp.fullName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{areas.find((a) => a.id === emp.areaId)?.name ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{diasTrabajados}</td>
                  <td className="px-4 py-3">{fmtMins(totalJornadaMin)}</td>
                  <td className="px-4 py-3">{fmtMins(totalBreak1Min)}</td>
                  <td className="px-4 py-3">{fmtMins(totalBreak2Min)}</td>
                  <td className="px-4 py-3">{fmtMins(totalAlmuerzoMin)}</td>
                  <td className="px-4 py-3 font-medium text-[#1F8A5B]">{fmtMins(totalEfectivoMin)}</td>
                  <td className="px-4 py-3">
                    {totalAdicionalMin > 0
                      ? <span className="font-medium text-[#C98A00]">{fmtMins(totalAdicionalMin)}</span>
                      : <span className="text-muted-foreground">0</span>}
                  </td>
                </tr>
              ))}
              {stats.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">Sin datos para el período seleccionado</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
        </div>
      </div>

      {/* Análisis de puntualidad */}
      <div className="rounded-card bg-card shadow-card overflow-hidden">
        <button
          onClick={() => setOpenReport(openReport === "puntualidad" ? null : "puntualidad")}
          className="w-full flex items-center justify-between gap-4 px-5 py-3 border-b border-border bg-secondary/40 hover:bg-secondary/60 transition-colors text-left"
        >
          <div>
            <h3 className="font-semibold text-sm">Análisis de puntualidad</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Cumplimiento de horario: llegadas a tiempo, tardanzas y retraso promedio por cada trabajador.</p>
          </div>
          <ChevronRight className={cn("size-4 text-muted-foreground transition-transform shrink-0", openReport === "puntualidad" && "rotate-90")} />
        </button>
        <div className={cn("grid transition-[grid-template-rows] duration-300 ease-in-out", openReport === "puntualidad" ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                {[t("jornada_col_worker"),t("jornada_col_area"),t("jornada_col_con_registro"),t("jornada_col_a_tiempo"),t("jornada_col_tardios"),t("jornada_col_puntualidad"),t("jornada_col_retraso_prom")].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map(({ emp, punct }) => {
                const pctColor = punct.pct >= 90 ? "text-[#1F8A5B]" : punct.pct >= 75 ? "text-[#9a6b00]" : "text-primary";
                return (
                  <tr key={emp.id} className="border-t border-border/60 hover:bg-secondary/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                          {emp.fullName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <span className="font-medium">{emp.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{areas.find((a) => a.id === emp.areaId)?.name ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{punct.total}</td>
                    <td className="px-4 py-3 tabular-nums text-[#1F8A5B] font-medium">{punct.diasATiempo}</td>
                    <td className="px-4 py-3 tabular-nums text-primary">{punct.diasTarde}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${punct.pct}%`, backgroundColor: punct.pct >= 90 ? "#1F8A5B" : punct.pct >= 75 ? "#C98A00" : "var(--color-primary)" }} />
                        </div>
                        <span className={cn("tabular-nums font-medium text-xs", pctColor)}>{punct.pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{punct.avgRetrasoMin > 0 ? fmtMins(punct.avgRetrasoMin) : "—"}</td>
                  </tr>
                );
              })}
              {stats.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Sin datos para el período seleccionado</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}

// ── TAB: Configuración ─────────────────────────────────────

function TabConfiguracion() {
  const { t } = useI18n();
  const { areas } = useWFM();
  const { profile } = useAuth();
  const { configuracion, upsertConfiguracion, cupos, upsertCupo, removeCupo } = useJornada();
  const ownArea = profile?.areaId ?? null;

  // Admin: selector de área (null = global); área restringida: fijo en ownArea
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const effectiveAreaId = ownArea ?? selectedAreaId; // null = global

  const [cfg,       setCfg]       = useState<JornadaConfiguracion | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [savingMsg, setSavingMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cupoEditing, setCupoEditing] = useState<string | null>(null);

  // Recarga cfg cuando cambia el área seleccionada o llegan datos del store
  useEffect(() => {
    const existing = effectiveAreaId
      ? configuracion.find((c) => c.areaId === effectiveAreaId)
      : configuracion.find((c) => !c.areaId);
    if (existing) {
      setCfg({ ...existing });
    } else {
      const global = configuracion.find((c) => !c.areaId);
      setCfg({
        id: crypto.randomUUID(),
        areaId: effectiveAreaId ?? undefined,
        toleranciaLlegadaMin:      global?.toleranciaLlegadaMin      ?? 15,
        tiempoMaxBreakMin:         global?.tiempoMaxBreakMin          ?? 15,
        tiempoMaxAlmuerzoMin:      global?.tiempoMaxAlmuerzoMin       ?? 60,
        break1HoraInicio:          global?.break1HoraInicio           ?? "09:00",
        break1HoraFin:             global?.break1HoraFin              ?? "11:00",
        break2HoraInicio:          global?.break2HoraInicio           ?? "14:00",
        break2HoraFin:             global?.break2HoraFin              ?? "16:00",
        maxAlmuerzosPorJornada:    global?.maxAlmuerzosPorJornada     ?? 1,
        diasLaborales:             global?.diasLaborales              ?? [1, 2, 3, 4, 5],
        horaInicioJornada:         global?.horaInicioJornada          ?? "08:00",
        horaFinJornada:            global?.horaFinJornada             ?? "18:00",
        requiereAprobacionEdicion: global?.requiereAprobacionEdicion  ?? true,
      });
    }
  }, [configuracion, ownArea, selectedAreaId]);

  // Cupos visibles según área del usuario
  const visibleCupos = ownArea ? cupos.filter((c) => !c.areaId || c.areaId === ownArea) : cupos;

  const hasOwnConfig = !!effectiveAreaId && !!configuracion.find((c) => c.areaId === effectiveAreaId);

  if (!cfg) return null;

  const areaLabel = effectiveAreaId
    ? (areas.find((a) => a.id === effectiveAreaId)?.name ?? effectiveAreaId)
    : "Global (sin área)";

  return (
    <div className="px-4 md:px-6 py-4 md:py-6 max-w-[1280px] mx-auto space-y-6">
      {/* General config */}
      <div className="rounded-card bg-card p-5 shadow-card">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">Configuración general</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ownArea
                ? `Valores para ${areas.find((a) => a.id === ownArea)?.name ?? "mi área"}`
                : effectiveAreaId
                  ? `Valores específicos para ${areaLabel}`
                  : "Valores por defecto para todo el sistema"}
            </p>
          </div>
          {!ownArea && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Área:</span>
              <select
                className="text-sm rounded-pill border border-border bg-card px-3 py-1.5 outline-none"
                value={selectedAreaId ?? ""}
                onChange={(e) => { setSelectedAreaId(e.target.value || null); setSavingMsg(null); }}
              >
                <option value="">Global (sin área)</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {effectiveAreaId && !hasOwnConfig && (
                <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                  Sin config propia — valores heredados del global
                </span>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <CfgField label="Tolerancia de llegada (min)">
            <input type="number" min={0} max={120} className="cfg-input" value={cfg.toleranciaLlegadaMin} onChange={(e) => setCfg({ ...cfg, toleranciaLlegadaMin: Number(e.target.value) })} />
          </CfgField>
          <CfgField label="Tiempo máx. break (min)">
            <input type="number" min={1} max={60} className="cfg-input" value={cfg.tiempoMaxBreakMin} onChange={(e) => setCfg({ ...cfg, tiempoMaxBreakMin: Number(e.target.value) })} />
          </CfgField>
          <CfgField label="Tiempo máx. almuerzo (min)">
            <input type="number" min={1} max={180} className="cfg-input" value={cfg.tiempoMaxAlmuerzoMin} onChange={(e) => setCfg({ ...cfg, tiempoMaxAlmuerzoMin: Number(e.target.value) })} />
          </CfgField>
          <CfgField label="Break 1 — hora inicio">
            <input type="time" className="cfg-input" value={cfg.break1HoraInicio} onChange={(e) => setCfg({ ...cfg, break1HoraInicio: e.target.value })} />
          </CfgField>
          <CfgField label="Break 1 — hora fin">
            <input type="time" className="cfg-input" value={cfg.break1HoraFin} onChange={(e) => setCfg({ ...cfg, break1HoraFin: e.target.value })} />
          </CfgField>
          <CfgField label="Break 2 — hora inicio">
            <input type="time" className="cfg-input" value={cfg.break2HoraInicio} onChange={(e) => setCfg({ ...cfg, break2HoraInicio: e.target.value })} />
          </CfgField>
          <CfgField label="Break 2 — hora fin">
            <input type="time" className="cfg-input" value={cfg.break2HoraFin} onChange={(e) => setCfg({ ...cfg, break2HoraFin: e.target.value })} />
          </CfgField>
          <CfgField label="Máx. almuerzos por jornada">
            <input type="number" min={0} max={5} className="cfg-input" value={cfg.maxAlmuerzosPorJornada ?? 1} onChange={(e) => setCfg({ ...cfg, maxAlmuerzosPorJornada: Number(e.target.value) })} />
          </CfgField>
          <CfgField label="Hora inicio jornada">
            <input type="time" className="cfg-input" value={cfg.horaInicioJornada} onChange={(e) => setCfg({ ...cfg, horaInicioJornada: e.target.value })} />
          </CfgField>
          <CfgField label="Hora fin jornada">
            <input type="time" className="cfg-input" value={cfg.horaFinJornada} onChange={(e) => setCfg({ ...cfg, horaFinJornada: e.target.value })} />
          </CfgField>
          <CfgField label="Requiere aprobación para ediciones">
            <select className="cfg-input" value={cfg.requiereAprobacionEdicion ? "1" : "0"} onChange={(e) => setCfg({ ...cfg, requiereAprobacionEdicion: e.target.value === "1" })}>
              <option value="1">Sí</option>
              <option value="0">No</option>
            </select>
          </CfgField>
        </div>
        <div className="mt-5 flex items-center justify-end gap-4">
          {savingMsg && (
            <span className={savingMsg.ok ? "text-sm text-[#1F8A5B]" : "text-sm text-destructive"}>
              {savingMsg.text}
            </span>
          )}
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setSavingMsg(null);
              try {
                await upsertConfiguracion({ ...cfg, areaId: effectiveAreaId ?? undefined });
                setSavingMsg({ ok: true, text: `Configuración guardada para ${areaLabel}.` });
              } catch {
                setSavingMsg({ ok: false, text: "Error al guardar." });
              } finally {
                setSaving(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-pill bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Guardar configuración
          </button>
        </div>
        <style>{`.cfg-input{width:100%;border:1px solid var(--color-input);border-radius:999px;padding:.5rem .75rem;font-size:.875rem;background:var(--color-card);outline:none}.cfg-input:focus{border-color:color-mix(in srgb,var(--color-primary) 40%,transparent)}`}</style>
      </div>

      {/* Cupos */}
      <div className="rounded-card bg-card shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">{t("jornada_cupos_config")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t("jornada_cupos_limit_hint")}</p>
          </div>
          <button
            onClick={() => setCupoEditing("new")}
            className="inline-flex items-center gap-2 rounded-pill bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Nuevo cupo
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                {["Tipo","Área","Máx. simultáneos","Cargo","Horario",""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleCupos.map((c) => (
                <tr key={c.id} className="border-t border-border/60 hover:bg-secondary/60 transition-colors">
                  <td className="px-4 py-3 capitalize font-medium">{c.tipo}</td>
                  <td className="px-4 py-3">{areas.find((a) => a.id === c.areaId)?.name ?? "Global"}</td>
                  <td className="px-4 py-3">{c.maxSimultaneos} personas</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.cargo ?? "Todos"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.horaInicio && c.horaFin ? `${c.horaInicio} – ${c.horaFin}` : "Todo el día"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => setCupoEditing(c.id)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Edit3 className="size-4" /></button>
                      <button onClick={() => removeCupo(c.id)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleCupos.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">{t("jornada_cupos_none")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {cupoEditing && (
        <CupoModal
          cupo={cupoEditing === "new" ? null : visibleCupos.find((c) => c.id === cupoEditing)!}
          areas={areas}
          ownArea={ownArea}
          onClose={() => setCupoEditing(null)}
          onSave={async (c: JornadaCupo) => { await upsertCupo(c); setCupoEditing(null); }}
        />
      )}
    </div>
  );
}

function CfgField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function CupoModal({ cupo, areas, ownArea, onClose, onSave }: any) {
  const newId = useMemo(() => crypto.randomUUID(), []);
  const [form, setForm] = useState<JornadaCupo>(cupo ?? { id: newId, tipo: "break", maxSimultaneos: 3, activo: true, areaId: ownArea ?? undefined });
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-card shadow-card max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">{cupo ? "Editar cupo" : "Nuevo cupo"}</h3>
        <ModalField label="Tipo">
          <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as any })}>
            <option value="break">Break</option>
            <option value="almuerzo">Almuerzo</option>
          </select>
        </ModalField>
        <ModalField label="Área (vacío = global)">
          {ownArea ? (
            <div className="input text-muted-foreground">{areas.find((a: any) => a.id === ownArea)?.name ?? "Mi área"}</div>
          ) : (
            <select className="input" value={form.areaId ?? ""} onChange={(e) => setForm({ ...form, areaId: e.target.value || undefined })}>
              <option value="">Global</option>
              {areas.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </ModalField>
        <ModalField label="Máximo simultáneos">
          <input type="number" min={1} className="input" value={form.maxSimultaneos} onChange={(e) => setForm({ ...form, maxSimultaneos: Number(e.target.value) })} />
        </ModalField>
        <ModalField label="Cargo (opcional)">
          <input className="input" value={form.cargo ?? ""} onChange={(e) => setForm({ ...form, cargo: e.target.value || undefined })} placeholder="Ej: Supervisor" />
        </ModalField>
        <div className="grid grid-cols-2 gap-4">
          <ModalField label="Hora inicio (opcional)">
            <input type="time" className="input" value={form.horaInicio ?? ""} onChange={(e) => setForm({ ...form, horaInicio: e.target.value || undefined })} />
          </ModalField>
          <ModalField label="Hora fin (opcional)">
            <input type="time" className="input" value={form.horaFin ?? ""} onChange={(e) => setForm({ ...form, horaFin: e.target.value || undefined })} />
          </ModalField>
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary disabled:opacity-50">Cancelar</button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSave(form);
              } catch {
                setError("Error al guardar el cupo.");
                setBusy(false);
              }
            }}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Guardar
          </button>
        </div>
        <style>{`.input{width:100%;border:1px solid var(--color-input);border-radius:999px;padding:.5rem .75rem;font-size:.875rem;background:var(--color-card);outline:none}.input:focus{border-color:color-mix(in srgb,var(--color-primary) 40%,transparent)}`}</style>
      </div>
    </div>
  );
}
