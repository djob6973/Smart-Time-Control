import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Topbar } from "@/components/wfm/Topbar";
import { useWFM } from "@/lib/wfm/store";
import { useJornada } from "@/lib/jornada/store";
import { shiftBreakdown, sumBreakdowns, fmtHours } from "@/lib/wfm/calc";
import { startOfWeek, weekDays, toISO } from "@/lib/wfm/date";
import { fetchApprovals } from "@/lib/wfm/db";
import {
  Users, TrendingUp, CalendarOff, AlertTriangle,
  Clock, Timer, UserCheck, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { Resource } from "@/lib/permissions";

type Period = "dia" | "semana" | "mes";
type AlertLevel = "critical" | "warning" | "ok";

const PRIMARY = "#ED5650";
const COLORS = {
  STD:  "#ADADAE",
  HED:  "#ED5650",
  HEN:  "#B13833",
  RN:   "#62EFFF",
  RDF:  "#888888",
  HEDF: "#DDCB05",
};

const FALLBACK_ROUTES: { to: string; resource: Resource }[] = [
  { to: "/mi-horario", resource: "mi_horario" },
  { to: "/jornada",    resource: "jornada" },
  { to: "/scheduler",  resource: "scheduler" },
  { to: "/employees",  resource: "employees" },
  { to: "/areas",      resource: "areas" },
  { to: "/absences",   resource: "absences" },
  { to: "/reports",    resource: "reports" },
  { to: "/settings",   resource: "settings" },
];

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard · STC" }] }),
  component: Dashboard,
});

// ── Tooltip del gráfico ─────────────────────────────────────────

function HoursTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const rows = [
    { code: "STD",  label: "Estándar",    val: d.STD,  color: COLORS.STD  },
    { code: "RN",   label: "Rec. noct.",  val: d.RN,   color: COLORS.RN   },
    { code: "RDF",  label: "Rec. dom.",   val: d.RDF,  color: COLORS.RDF  },
    { code: "HED",  label: "Extra diur.", val: d.HED,  color: COLORS.HED  },
    { code: "HEN",  label: "Extra noct.", val: d.HEN,  color: COLORS.HEN  },
    { code: "HEDF", label: "Extra dom.",  val: d.HEDF, color: COLORS.HEDF },
  ].filter(r => r.val > 0);

  return (
    <div
      className="rounded-card shadow-card p-3.5 text-sm min-w-[196px]"
      style={{ background: "#1f1f1f", color: "#fff" }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-wider mb-2"
        style={{ color: "rgba(255,255,255,0.6)" }}
      >{label}</p>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.code} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm shrink-0" style={{ background: r.color }} />
              <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.9)" }}>{r.code}</span>
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.65)" }}>{r.label}</span>
            </span>
            <span className="font-semibold tabular-nums" style={{ color: "#fff" }}>{r.val}h</span>
          </div>
        ))}
        {rows.length > 1 && (
          <div
            className="border-t pt-1.5 mt-0.5 flex items-center justify-between font-bold"
            style={{ borderColor: "rgba(255,255,255,0.2)" }}
          >
            <span className="text-[11px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.6)" }}>Total</span>
            <span className="tabular-nums" style={{ color: PRIMARY }}>{d.total}h</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────

function Dashboard() {
  const { hasPermission, profile } = useAuth();
  const ownArea = profile?.areaId ?? null;
  const navigate = useNavigate();
  const { employees, shifts, areas, absences } = useWFM();
  const { registros, configuracion } = useJornada();

  const [period, setPeriod]             = useState<Period>("semana");
  const [dateOffset, setDateOffset]     = useState(0);
  const [selectedArea, setSelectedArea] = useState<string>(ownArea ?? "all");
  const [approvals, setApprovals]       = useState<Record<string, string>>({});

  const today    = toISO(new Date());
  const ws       = useMemo(() => startOfWeek(new Date()), [today]);
  const days     = useMemo(() => weekDays(ws), [ws]);
  const weekISOs = useMemo(() => days.map(toISO), [days]);

  // Reset navigation offset when period changes
  useEffect(() => { setDateOffset(0); }, [period]);

  const dateRange = useMemo((): [string, string] => {
    const now = new Date();
    if (period === "dia") {
      const d = new Date(now);
      d.setDate(d.getDate() + dateOffset);
      const iso = toISO(d);
      return [iso, iso];
    }
    if (period === "semana") {
      const wsCur = startOfWeek(now);
      wsCur.setDate(wsCur.getDate() + dateOffset * 7);
      const dys = weekDays(wsCur);
      return [toISO(dys[0]), toISO(dys[dys.length - 1])];
    }
    const d = new Date(now.getFullYear(), now.getMonth() + dateOffset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + dateOffset + 1, 0);
    return [toISO(d), toISO(last)];
  }, [period, dateOffset]);

  const dateLabelText = useMemo(() => {
    const now = new Date();
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    if (period === "dia") {
      const d = new Date(now);
      d.setDate(d.getDate() + dateOffset);
      return cap(d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }));
    }
    if (period === "semana") {
      const wsCur = startOfWeek(now);
      wsCur.setDate(wsCur.getDate() + dateOffset * 7);
      const end = new Date(wsCur);
      end.setDate(end.getDate() + 6);
      return `Semana del ${wsCur.getDate()}/${wsCur.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}`;
    }
    const d = new Date(now.getFullYear(), now.getMonth() + dateOffset, 1);
    return cap(d.toLocaleDateString("es-CO", { month: "long", year: "numeric" }));
  }, [period, dateOffset]);

  const effectiveArea = ownArea ?? (selectedArea !== "all" ? selectedArea : null);
  const filteredEmployees = useMemo(
    () => effectiveArea ? employees.filter(e => e.areaId === effectiveArea) : employees,
    [employees, effectiveArea]
  );
  const filteredIds = useMemo(() => new Set(filteredEmployees.map(e => e.id)), [filteredEmployees]);

  const periodShifts = useMemo(
    () => shifts.filter(s =>
      s.date >= dateRange[0] && s.date <= dateRange[1] && filteredIds.has(s.employeeId)
    ),
    [shifts, dateRange, filteredIds]
  );
  const periodAbsences = useMemo(
    () => absences.filter(a =>
      a.endDate >= dateRange[0] && a.startDate <= dateRange[1] && filteredIds.has(a.employeeId)
    ),
    [absences, dateRange, filteredIds]
  );

  const { sum, totalNoveltyRows } = useMemo(() => {
    const bds = periodShifts.map(s =>
      shiftBreakdown(s, areas.find(a => a.id === filteredEmployees.find(e => e.id === s.employeeId)?.areaId))
    );
    return {
      sum: sumBreakdowns(bds),
      totalNoveltyRows: bds.reduce((acc, bd) =>
        acc + (bd.HED > 0 ? 1 : 0) + (bd.HEN > 0 ? 1 : 0) +
              (bd.RN  > 0 ? 1 : 0) + (bd.RDF > 0 ? 1 : 0) + (bd.HEDF > 0 ? 1 : 0), 0),
    };
  }, [periodShifts, filteredEmployees, areas]);

  const overtime   = sum.HED + sum.HEN + sum.HEDF + sum.HENF;
  const surcharges = sum.RN  + sum.RDF + ((sum as any).RNF ?? 0);

  // ── Período anterior (para deltas comparativos) ──────────────
  const prevDateRange = useMemo((): [string, string] => {
    const now = new Date();
    const prevOffset = dateOffset - 1;
    if (period === "dia") {
      const d = new Date(now);
      d.setDate(d.getDate() + prevOffset);
      const iso = toISO(d);
      return [iso, iso];
    }
    if (period === "semana") {
      const wsCur = startOfWeek(now);
      wsCur.setDate(wsCur.getDate() + prevOffset * 7);
      const dys = weekDays(wsCur);
      return [toISO(dys[0]), toISO(dys[dys.length - 1])];
    }
    const d = new Date(now.getFullYear(), now.getMonth() + prevOffset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + prevOffset + 1, 0);
    return [toISO(d), toISO(last)];
  }, [period, dateOffset]);

  const prevPeriodShifts = useMemo(
    () => shifts.filter(s =>
      s.date >= prevDateRange[0] && s.date <= prevDateRange[1] && filteredIds.has(s.employeeId)
    ),
    [shifts, prevDateRange, filteredIds]
  );

  const prevSum = useMemo(() => {
    const bds = prevPeriodShifts.map(s =>
      shiftBreakdown(s, areas.find(a => a.id === filteredEmployees.find(e => e.id === s.employeeId)?.areaId))
    );
    return sumBreakdowns(bds);
  }, [prevPeriodShifts, filteredEmployees, areas]);

  const prevOvertime = prevSum.HED + prevSum.HEN + prevSum.HEDF + prevSum.HENF;

  const horasDelta = useMemo(() => {
    if (prevSum.total === 0) return null;
    const pct = Math.round(((sum.total - prevSum.total) / prevSum.total) * 100);
    return { text: pct >= 0 ? `+${pct}%` : `${pct}%`, up: pct >= 0 };
  }, [sum.total, prevSum.total]);

  const extrasDelta = useMemo(() => {
    if (prevOvertime === 0) return null;
    const diff = +(overtime - prevOvertime).toFixed(1);
    return { text: diff >= 0 ? `+${diff} h` : `${diff} h`, up: diff >= 0 };
  }, [overtime, prevOvertime]);

  useEffect(() => {
    fetchApprovals(dateRange[0], dateRange[1]).then(setApprovals).catch(() => {});
  }, [dateRange[0], dateRange[1]]);

  const approvedCount       = Object.values(approvals).filter(s => s === "Aprobada").length;
  const rejectedCount       = Object.values(approvals).filter(s => s === "No aprobada").length;
  const pendingNoveltyCount = Math.max(0, totalNoveltyRows - approvedCount - rejectedCount);

  const approvedAbsences = periodAbsences.filter(a => (a.status ?? "pendiente") === "aprobada").length;
  const pendingAbsences  = periodAbsences.filter(a => (a.status ?? "pendiente") === "pendiente").length;

  // Alerts always based on real current week / today
  const weekShifts = useMemo(
    () => shifts.filter(s => weekISOs.includes(s.date) && filteredIds.has(s.employeeId)),
    [shifts, weekISOs, filteredIds]
  );
  const heavyCount = useMemo(
    () => filteredEmployees.filter(emp => {
      const es = weekShifts.filter(s => s.employeeId === emp.id);
      return es.length > 0 &&
        sumBreakdowns(es.map(s => shiftBreakdown(s, areas.find(a => a.id === emp.areaId)))).total > 46;
    }).length,
    [filteredEmployees, weekShifts, areas]
  );

  const tardinessToday = useMemo(() => {
    const tol = (configuracion.find(c => !c.areaId)?.toleranciaLlegadaMin ?? 15) / 60;
    return registros
      .filter(r => r.fecha === today && r.tipoMovimiento === "entrada" && filteredIds.has(r.employeeId))
      .filter(entry => {
        const shift = shifts.find(s => s.employeeId === entry.employeeId && s.date === today);
        if (!shift || shift.code === "OFF" || shift.code === "ABS") return false;
        const h = new Date(entry.horaExacta).getHours() + new Date(entry.horaExacta).getMinutes() / 60;
        return h > shift.start + tol;
      }).length;
  }, [registros, shifts, configuracion, today, filteredIds]);

  const missingCheckins = useMemo(() => {
    const checkedIn = new Set(
      registros
        .filter(r => r.fecha === today && r.tipoMovimiento === "entrada" && filteredIds.has(r.employeeId))
        .map(r => r.employeeId)
    );
    return [...new Set(
      shifts
        .filter(s => s.date === today && filteredIds.has(s.employeeId) && s.code !== "OFF" && s.code !== "ABS")
        .map(s => s.employeeId)
    )].filter(id => !checkedIn.has(id)).length;
  }, [registros, shifts, today, filteredIds]);

  const lineData = useMemo(() => {
    const bdFor = (start: string, end: string) => {
      const bd = sumBreakdowns(
        periodShifts.filter(s => s.date >= start && s.date <= end).map(s =>
          shiftBreakdown(s, areas.find(a => a.id === filteredEmployees.find(e => e.id === s.employeeId)?.areaId))
        )
      );
      return {
        total: +bd.total.toFixed(1),
        STD:   +bd.std.toFixed(1),
        RN:    +bd.RN.toFixed(1),
        RDF:   +bd.RDF.toFixed(1),
        HED:   +bd.HED.toFixed(1),
        HEN:   +bd.HEN.toFixed(1),
        HEDF:  +bd.HEDF.toFixed(1),
      };
    };

    if (period === "dia") return [{ day: "Hoy", ...bdFor(dateRange[0], dateRange[1]) }];
    if (period === "semana") {
      const now = new Date();
      const wsCur = startOfWeek(now);
      wsCur.setDate(wsCur.getDate() + dateOffset * 7);
      const dys = weekDays(wsCur);
      const LABELS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
      return dys.map(d => ({ day: LABELS[d.getDay()], ...bdFor(toISO(d), toISO(d)) }));
    }
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + dateOffset, 1);
    const last  = new Date(now.getFullYear(), now.getMonth() + dateOffset + 1, 0);
    const result: any[] = [];
    let cur = new Date(first), wn = 1;
    while (cur <= last) {
      const wStart = toISO(cur);
      const next6  = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 6);
      const wEnd   = toISO(next6 > last ? last : next6);
      result.push({ day: `Sem ${wn}`, ...bdFor(wStart, wEnd) });
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
      wn++;
    }
    return result;
  }, [period, dateOffset, periodShifts, filteredEmployees, areas, dateRange]);

  const alertItems = useMemo(() => {
    const items: { level: AlertLevel; title: string; meta: string; to?: string; btn?: string }[] = [];
    if (heavyCount > 0)
      items.push({ level: "critical", title: `${heavyCount} empleado${heavyCount > 1 ? "s" : ""} con exceso de carga`, meta: "Semana actual > 46 h", to: "/scheduler", btn: "Resolver" });
    if (missingCheckins > 0)
      items.push({ level: "critical", title: `${missingCheckins} sin registrar entrada`, meta: "Turno activo sin check-in hoy", to: "/jornada", btn: "Resolver" });
    if (tardinessToday > 0)
      items.push({ level: "warning",  title: `${tardinessToday} llegaron tarde`, meta: "Superaron la tolerancia hoy", to: "/jornada", btn: "Revisar" });
    if (pendingAbsences > 0)
      items.push({ level: "warning",  title: `${pendingAbsences} ausencia${pendingAbsences > 1 ? "s" : ""} pendiente${pendingAbsences > 1 ? "s" : ""}`, meta: "Esperando aprobación", to: "/absences", btn: "Revisar" });
    if (pendingNoveltyCount > 0)
      items.push({ level: "warning",  title: `${pendingNoveltyCount} novedad${pendingNoveltyCount > 1 ? "es" : ""} sin aprobar`, meta: "Revisar en Reportes", to: "/reports", btn: "Revisar" });
    if (items.length === 0)
      items.push({ level: "ok", title: "Sin alertas activas", meta: "Todo en orden operativo" });
    return items;
  }, [heavyCount, missingCheckins, tardinessToday, pendingAbsences, pendingNoveltyCount]);

  const hasCritical  = alertItems.some(a => a.level === "critical");
  const activeCount  = filteredEmployees.filter(e => e.status === "active").length;
  const areaLabel    = selectedArea === "all"
    ? `${areas.length} área${areas.length !== 1 ? "s" : ""}`
    : (areas.find(a => a.id === selectedArea)?.name ?? "");

  useEffect(() => {
    if (!hasPermission("dashboard", "view")) {
      const first = FALLBACK_ROUTES.find(r => hasPermission(r.resource, "view"));
      navigate({ to: (first?.to ?? "/pending-approval") as any, replace: true });
    }
  }, [hasPermission, navigate]);

  if (!hasPermission("dashboard", "view")) return null;

  return (
    <>
      <Topbar title="Dashboard" subtitle="Lo que necesitas atender hoy" />

      <div className="px-4 md:px-6 py-5 max-w-[1280px] mx-auto space-y-5">

        {/* ── Toolbar ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">

          {/* Segmented — período */}
          <div className="flex items-center bg-secondary border border-border rounded-pill p-1 gap-0.5 text-sm">
            {(["dia", "semana", "mes"] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 font-medium rounded-pill transition-colors ${
                  period === p
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "dia" ? "Hoy" : p === "semana" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>

          {/* Date stepper */}
          <div className="flex items-center gap-0.5 rounded-pill border border-border bg-card px-1 py-1">
            <button
              onClick={() => setDateOffset(o => o - 1)}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-2.5 text-sm min-w-[172px] text-center tabular-nums select-none">
              {dateLabelText}
            </span>
            <button
              onClick={() => setDateOffset(o => o + 1)}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Filtro área */}
          {ownArea ? (
            <span className="text-sm border border-border rounded-pill px-3.5 py-2 bg-card text-muted-foreground">
              {areas.find(a => a.id === ownArea)?.name ?? "Mi área"}
            </span>
          ) : (
            <select
              value={selectedArea}
              onChange={e => setSelectedArea(e.target.value)}
              className="text-sm border border-border rounded-pill px-3.5 py-2 bg-card text-foreground focus:outline-none appearance-none"
            >
              <option value="all">Todas las áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}

          <span className="ml-auto hidden md:inline text-[11px] text-muted-foreground">
            Actualizado hace 2 min
          </span>
        </div>

        {/* ── 5 KPIs ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Kpi icon={Users}       label="Empleados activos" value={activeCount}          hint={areaLabel} />
          <Kpi icon={CalendarOff} label="Ausencias"         value={approvedAbsences}     hint={`${pendingAbsences} pendientes`} />
          <Kpi icon={Clock}       label="Horas programadas" value={fmtHours(sum.total)}  hint={dateLabelText} delta={horasDelta?.text} deltaUp={horasDelta?.up} />
          <Kpi icon={TrendingUp}  label="Horas extras"      value={fmtHours(overtime)}   hint="HED · HEN · HEDF · HENF" delta={extrasDelta?.text} deltaUp={extrasDelta ? !extrasDelta.up : undefined} alert />
          <Kpi icon={Timer}       label="Recargos"          value={fmtHours(surcharges)} hint="RN · RDF" />
        </div>

        {/* ── Gráfico + Riel ────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

          {/* Chart card */}
          <div className="lg:col-span-2 rounded-card bg-card shadow-card flex flex-col">
            <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4 border-b border-border/60">
              <div>
                <h3 className="font-semibold text-sm">Horas programadas</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {period === "dia"
                    ? "Total por bloque horario · hoy"
                    : period === "semana"
                    ? "Total por día · esta semana"
                    : "Total por semana · este mes"}
                </p>
              </div>
              {/* Chart type toggle — in sync with main period */}
              <div className="flex items-center bg-secondary border border-border rounded-pill p-0.5 gap-0.5 text-[11px] shrink-0">
                {(["dia", "semana", "mes"] as Period[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 rounded-pill font-medium transition-colors ${
                      period === p
                        ? "bg-card text-foreground shadow-soft"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p === "dia" ? "Día" : p === "semana" ? "Semana" : "Mes"}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-64 px-2 pt-3">
              <ResponsiveContainer>
                <AreaChart data={lineData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 4" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} unit="h" width={38} />
                  <Tooltip
                    content={<HoursTooltip />}
                    cursor={{ stroke: PRIMARY, strokeWidth: 1, strokeDasharray: "4 3", opacity: 0.4 }}
                  />
                  <Area
                    dataKey="total"
                    stroke={PRIMARY}
                    strokeWidth={2.5}
                    fill="url(#areaGrad)"
                    dot={{ r: 4, fill: "var(--color-card)", stroke: PRIMARY, strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: PRIMARY, stroke: "var(--color-card)", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="px-5 pt-3 pb-5 border-t border-border flex flex-wrap gap-x-4 gap-y-1.5">
              {[
                { code: "STD",  label: "Estándar",    color: COLORS.STD  },
                { code: "HED",  label: "Extra diur.", color: COLORS.HED  },
                { code: "HEN",  label: "Extra noct.", color: COLORS.HEN  },
                { code: "RN",   label: "Rec. noct.",  color: COLORS.RN   },
                { code: "RDF",  label: "Rec. dom.",   color: COLORS.RDF  },
                { code: "HEDF", label: "Extra dom.",  color: COLORS.HEDF },
              ].map(l => (
                <span key={l.code} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="size-2 rounded-sm shrink-0" style={{ background: l.color }} />
                  <span className="font-mono" style={{ color: "var(--color-foreground)", opacity: 0.65 }}>{l.code}</span>
                  <span>{l.label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Alert rail — charcoal */}
          <div
            className="rounded-card overflow-hidden flex flex-col shadow-card bg-foreground dark:bg-[#1e1e1e]"
          >
            {/* Rail header */}
            <div
              className="px-5 py-4 flex items-center gap-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}
            >
              <div
                className="size-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(237,86,80,0.18)" }}
              >
                <AlertTriangle className="size-5" style={{ color: PRIMARY }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#fff" }}>Alertas operativas</p>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>Requieren tu atención</p>
              </div>
              <span
                className="min-w-[30px] h-[30px] px-2 rounded-pill flex items-center justify-center text-sm font-bold tabular-nums"
                style={hasCritical
                  ? { background: PRIMARY, color: "#fff" }
                  : { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }}
              >
                {alertItems.filter(a => a.level !== "ok").length > 0
                  ? alertItems.filter(a => a.level !== "ok").length
                  : "✓"}
              </span>
            </div>

            {/* Alert list */}
            <div className="flex-1 px-4 py-4 flex flex-col gap-3">
              {alertItems.map((alert, i) => (
                <div
                  key={i}
                  className="rounded-xl p-4 flex flex-col gap-3 transition-transform hover:-translate-y-0.5"
                  style={{
                    background: alert.level === "critical" ? "rgba(237,86,80,0.10)" : "#2a2a2a",
                    border: `1px solid ${alert.level === "critical" ? "rgba(237,86,80,0.5)" : "#3c3c3c"}`,
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="shrink-0 rounded-full"
                      style={{
                        width: 9,
                        height: 9,
                        marginTop: 5,
                        background: alert.level === "critical" ? PRIMARY
                          : alert.level === "ok" ? "#4ade80"
                          : "#888888",
                        boxShadow: alert.level === "critical"
                          ? "0 0 0 4px rgba(237,86,80,0.2)"
                          : undefined,
                      }}
                    />
                    <p className="text-sm leading-snug" style={{ color: "#fff" }}>{alert.title}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                      {alert.meta}
                    </span>
                    {alert.btn && (
                      <button
                        onClick={() => alert.to && navigate({ to: alert.to as any })}
                        className="ml-auto text-[11px] font-medium rounded-pill px-3 py-1.5 transition-opacity hover:opacity-80"
                        style={alert.level === "critical"
                          ? { background: PRIMARY, border: `1px solid ${PRIMARY}`, color: "#fff" }
                          : { background: "transparent", border: "1px solid #404040", color: "#fff" }}
                      >
                        {alert.btn}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Rail footer */}
            <div
              className="px-5 py-3 flex items-center gap-2 text-[11px]"
              style={{ borderTop: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}
            >
              <UserCheck className="size-3.5 shrink-0" style={{ color: "#4ade80" }} />
              Aprobaciones y ausencias al día
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────

function Kpi({ icon: Icon, label, value, hint, delta, deltaUp, alert }: {
  icon: any;
  label: string;
  value: any;
  hint?: string;
  delta?: string;
  deltaUp?: boolean;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-card p-5 shadow-card flex flex-col gap-3 transition-transform hover:-translate-y-0.5 ${
        alert ? "border-transparent bg-foreground dark:bg-[#232323]" : "bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`text-[11px] font-medium uppercase tracking-[0.04em] ${alert ? "" : "text-muted-foreground"}`}
          style={alert ? { color: "rgba(255,255,255,0.7)" } : undefined}
        >
          {label}
        </span>
        <span
          className={`size-[34px] shrink-0 rounded-md grid place-items-center ${
            alert ? "" : "bg-secondary text-foreground"
          }`}
          style={alert ? { background: "rgba(255,255,255,0.12)", color: "#fff" } : undefined}
        >
          <Icon className="size-[18px]" aria-hidden />
        </span>
      </div>

      <div
        className="font-display text-[2.25rem] leading-none tracking-tight tabular-nums"
        style={alert ? { color: "#fff" } : undefined}
      >
        {value}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {delta && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium rounded-pill px-2 py-0.5"
            style={{
              background: alert
                ? "rgba(255,255,255,0.15)"
                : "color-mix(in srgb,#1F8A5B 12%,transparent)",
              color: deltaUp
                ? (alert ? "#4ade80" : "#1F8A5B")
                : PRIMARY,
            }}
          >
            <TrendingUp className="size-3" />
            {delta}
          </span>
        )}
        {hint && (
          <p
            className={`text-[11px] ${alert ? "" : "text-muted-foreground"}`}
            style={alert ? { color: "rgba(255,255,255,0.65)" } : undefined}
          >
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
