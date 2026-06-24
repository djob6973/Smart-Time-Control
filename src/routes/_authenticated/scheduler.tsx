import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Topbar } from "@/components/wfm/Topbar";
import { useWFM, currentWeekISO } from "@/lib/wfm/store";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, startOfWeek, toISO, weekDays, DAY_LABELS } from "@/lib/wfm/date";
import { shiftBreakdown, codeColor, fmtHours, sumBreakdowns, parseAbsNote, isHoliday } from "@/lib/wfm/calc";
import type { Shift, Area, Employee, NoveltyBreakdown } from "@/lib/wfm/types";
import { ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, Sparkles, Lock, Unlock, X, Zap, Clock, Eraser, AlertTriangle, History, Trash2, Info, Filter } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { fetchShiftHistory } from "@/lib/wfm/db";
import { dispatchShiftEvent } from "@/lib/notifications/dispatch";
import type { ShiftHistory } from "@/lib/wfm/types";
import { buildEquityMap } from "@/lib/wfm/coverage";
import { isSundayOrHoliday } from "@/lib/wfm/calc";

export const Route = createFileRoute("/_authenticated/scheduler")({
  head: () => ({ meta: [{ title: "Programación · STC" }] }),
  component: Scheduler,
});

function Scheduler() {
  const { employees, areas, shifts, absences, setShift, clearShift, clearWeek, generateWeeks, lockWeek, unlockWeek, swapShifts, setCurrentUser } = useWFM();
  const { hasLimit, hasPermission, profile, user } = useAuth();

  useEffect(() => { setCurrentUser(user?.id ?? null); }, [user?.id]);
  const canEdit    = hasPermission("scheduler", "edit");
  const canGenerate = hasLimit("canGenerateShifts");
  const ownArea = profile?.areaId ?? null;

  const [weekISO, setWeekISO] = useState(currentWeekISO());
  // When user has an area assigned, force filter to their area and don't let them change it
  const [areaFilter, setAreaFilter] = useState<string>(ownArea ?? "all");
  const [editing, setEditing] = useState<{ employeeId: string; date: string } | null>(null);
  const [numWeeks, setNumWeeks] = useState(1);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showBaseWeekWarning, setShowBaseWeekWarning] = useState(false);
  const [anchorUnlockedCount, setAnchorUnlockedCount] = useState(0);
  const [swapSource, setSwapSource] = useState<{ employeeId: string; date: string } | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ employeeId: string; date: string } | null>(null);
  const [view, setView] = useState<"week" | "month">("week");
  const [historyModal, setHistoryModal] = useState<{ employeeId: string; date: string; employeeName: string } | null>(null);
  const [monthDate, setMonthDate] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [showEquity, setShowEquity] = useState(false);

  const ws = new Date(weekISO + "T00:00:00");
  const days = weekDays(ws);
  const isoDays = days.map(toISO);

  const visibleEmployees = useMemo(() => {
    // Para la vista de semana: ocultar empleados cuya inactiveDate sea anterior al lunes visible.
    // Para la vista de mes: usar el primer día del mes como referencia.
    const viewStart = view === "week" ? weekISO : toISO(monthDate);
    return employees.filter(e => {
      if (areaFilter !== "all" && e.areaId !== areaFilter) return false;
      if (e.status === "active") return true;
      // Inactivo: mostrar solo si su fecha de inactivación es dentro del período visible o posterior
      return !!e.inactiveDate && e.inactiveDate >= viewStart;
    });
  }, [employees, areaFilter, weekISO, view, monthDate]);

  const shiftMap = useMemo(() => {
    const m = new Map<string, Shift>();
    shifts.forEach(s => m.set(`${s.employeeId}|${s.date}`, s));
    return m;
  }, [shifts]);

  function getShift(eid: string, date: string) { return shiftMap.get(`${eid}|${date}`); }

  // Active (non-rejected) absence takes visual priority over any existing shift so the grid
  // reflects a newly registered absence immediately, even when shifts were already generated.
  function getEffectiveShift(eid: string, date: string): Shift | undefined {
    const realShift = shiftMap.get(`${eid}|${date}`);

    const abs = absences.find(
      a => a.employeeId === eid &&
           date >= a.startDate &&
           date <= a.endDate &&
           (a.status ?? "pendiente") !== "rechazada",
    );

    if (abs) {
      // Real ABS record is returned as-is (preserves locked state, extra work hours)
      if (realShift?.code === "ABS") return realShift;
      // Synthesize a virtual ABS overlay; preserve any real shift work hours so the editor
      // shows them correctly (e.g. STD 13-17 alongside absence 9-13).
      const isPartial = abs.startHour != null && abs.endHour != null;
      return {
        id:           realShift?.id ?? `${eid}-${date}`,
        employeeId:   eid,
        date,
        start:        realShift?.start        ?? 0,
        end:          realShift?.end          ?? 0,
        breakMinutes: realShift?.breakMinutes ?? 0,
        code:         "ABS",
        locked:       realShift?.locked ?? false,
        note:         isPartial
          ? `abs:${abs.type}:${abs.startHour}:${abs.endHour}`
          : `abs:${abs.type}`,
      };
    }

    return realShift;
  }

  const weekLockState = useMemo(() => {
    const weekShifts = shifts.filter(sh =>
      isoDays.includes(sh.date) && visibleEmployees.some(e => e.id === sh.employeeId)
    );
    if (weekShifts.length === 0) return "none" as const;
    const lockedCount = weekShifts.filter(sh => sh.locked).length;
    if (lockedCount === weekShifts.length) return "full" as const;
    if (lockedCount > 0) return "partial" as const;
    return "none" as const;
  }, [shifts, isoDays, visibleEmployees]);

  const prevWeekIsoDays = useMemo(() => {
    const prevWs = addDays(ws, -7);
    return weekDays(prevWs).map(toISO);
  }, [ws]);

  const prevWeekLocked = useMemo(() => {
    const prevShifts = shifts.filter(sh =>
      prevWeekIsoDays.includes(sh.date) && visibleEmployees.some(e => e.id === sh.employeeId)
    );
    if (prevShifts.length === 0) return false;
    return prevShifts.every(sh => sh.locked);
  }, [shifts, prevWeekIsoDays, visibleEmployees]);

  const prevWeekLabel = useMemo(() => {
    const prevWs = addDays(ws, -7);
    const days = weekDays(prevWs);
    return `${days[0].getDate()}/${days[0].getMonth() + 1} – ${days[6].getDate()}/${days[6].getMonth() + 1}`;
  }, [ws]);

  function handleGenerate() {
    if (!prevWeekLocked) { setShowBaseWeekWarning(true); return; }

    // Detectar turnos en la semana ancla que no están bloqueados
    const relevantAreas = areaFilter === "all" ? areas : areas.filter(a => a.id === areaFilter);
    let count = 0;
    for (const area of relevantAreas) {
      const empIds = new Set(employees.filter(e => e.areaId === area.id).map(e => e.id));
      const areaShifts = shifts.filter(s => empIds.has(s.employeeId));
      const lockedBefore = areaShifts.filter(s =>
        s.date < weekISO && s.locked && s.code !== "OFF" && s.code !== "ABS" && s.end > s.start
      );
      if (!lockedBefore.length) continue;
      const anchorISO = toISO(startOfWeek(new Date(
        [...lockedBefore].sort((a, b) => b.date.localeCompare(a.date))[0].date + "T00:00:00"
      )));
      const anchorEnd = toISO(addDays(new Date(anchorISO + "T00:00:00"), 6));
      count += areaShifts.filter(s =>
        s.date >= anchorISO && s.date <= anchorEnd &&
        !s.locked && s.code !== "OFF" && s.code !== "ABS" && s.end > s.start
      ).length;
    }
    setAnchorUnlockedCount(count);
    setShowGenerateConfirm(true);
  }

  function confirmGenerate() {
    setShowGenerateConfirm(false);
    generateWeeks(weekISO, areaFilter === "all" ? undefined : areaFilter, numWeeks);
    if (anchorUnlockedCount > 0) {
      toast.warning(
        `${anchorUnlockedCount} turno${anchorUnlockedCount > 1 ? "s" : ""} en la semana ancla no ${anchorUnlockedCount > 1 ? "están bloqueados" : "está bloqueado"} y no ${anchorUnlockedCount > 1 ? "entrarán" : "entrará"} en la rotación.`,
        { duration: 6000 }
      );
    }
  }

  function toggleWeekLock() {
    const af = areaFilter === "all" ? undefined : areaFilter;
    if (weekLockState === "full") unlockWeek(weekISO, af);
    else lockWeek(weekISO, af);
  }

  const canClearWeek = useMemo(() =>
    shifts.some(sh =>
      isoDays.includes(sh.date) &&
      !sh.locked &&
      visibleEmployees.some(e => e.id === sh.employeeId)
    ),
    [shifts, isoDays, visibleEmployees]
  );

  async function confirmClearWeek() {
    setShowClearConfirm(false);
    setClearing(true);
    try {
      await clearWeek(weekISO, areaFilter === "all" ? undefined : areaFilter);
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => {
    if (!swapSource) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSwapSource(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [swapSource]);

  function handleCellClick(empId: string, date: string) {
    if (!canEdit) return;
    if (!swapSource) { setEditing({ employeeId: empId, date }); return; }
    if (swapSource.employeeId === empId && swapSource.date === date) { setSwapSource(null); return; }
    if (swapSource.date !== date) { setSwapSource(null); setEditing({ employeeId: empId, date }); return; }
    setSwapTarget({ employeeId: empId, date });
  }

  function handleSwapConfirm() {
    if (!swapSource || !swapTarget) return;
    swapShifts(swapSource.employeeId, swapTarget.employeeId, swapSource.date);
    setSwapSource(null);
    setSwapTarget(null);
  }

  const coverageAreas = useMemo(() => {
    const relevant = (areaFilter === "all" ? areas : areas.filter(a => a.id === areaFilter))
      .filter(a => a.enableCoverageMode && a.coverageRequirements.length > 0);

    return relevant.map(area => {
      const areaEmps = visibleEmployees.filter(e => e.areaId === area.id);
      const daySlots = days.map(day => {
        const dow = day.getDay();
        const isoDate = toISO(day);
        return area.coverageRequirements
          .filter(r => r.dayOfWeek === dow)
          .map(req => {
            const actual = areaEmps.filter(emp => {
              const s = shiftMap.get(`${emp.id}|${isoDate}`);
              return s && s.code !== "OFF" && s.code !== "ABS"
                && s.start <= req.startHour && s.end >= req.endHour;
            }).length;
            const preferred = req.preferredWorkers ?? req.minWorkers;
            const status = actual < req.minWorkers ? "critical" as const
              : actual < preferred ? "warn" as const : "ok" as const;
            return { req, actual, status };
          });
      });
      return { area, daySlots };
    });
  }, [areas, areaFilter, visibleEmployees, days, shiftMap]);

  const monthSummary = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const monthStartISO = toISO(new Date(year, month, 1));
    const monthEndISO = toISO(new Date(year, month + 1, 0));
    const monthDays: string[] = [];
    const cursor = new Date(year, month, 1);
    while (cursor.getMonth() === month) {
      monthDays.push(toISO(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return visibleEmployees.map(emp => {
      const area = areas.find(a => a.id === emp.areaId);
      const empShifts = shifts.filter(s =>
        s.employeeId === emp.id && s.date >= monthStartISO && s.date <= monthEndISO && s.code !== "OFF"
      );
      const workShifts = empShifts.filter(s => s.code !== "ABS");
      const breakdown = sumBreakdowns(workShifts.map(s => shiftBreakdown(s, area)));
      let monthHTotal = 0;
      for (const date of monthDays) {
        const s = getEffectiveShift(emp.id, date);
        const holiday = isHoliday(date);
        if (!s || s.code === "OFF") {
          if (holiday) monthHTotal += 8;
        } else if (s.code === "ABS") {
          const info = parseAbsNote(s.note);
          monthHTotal += info ? info.absEnd - info.absStart : 8;
          monthHTotal += Math.max(0, s.end - s.start - (s.breakMinutes ?? 0) / 60);
        } else {
          monthHTotal += shiftBreakdown(s, area).total;
        }
      }
      return {
        employee: emp,
        area,
        breakdown,
        daysWorked: workShifts.length,
        absenceDays: empShifts.filter(s => s.code === "ABS").length,
        contractHours: area?.maxHoursMonth ?? 192,
        monthHTotal,
      };
    });
  }, [monthDate, visibleEmployees, shifts, areas, shiftMap, absences]);

  // Equity: acumula domingos/festivos trabajados por cada empleado visible
  // usando todos los turnos existentes hasta hoy.
  const equityData = useMemo(() => {
    const empIds = visibleEmployees.map(e => e.id);
    const map = buildEquityMap(shifts, empIds);
    const rows = visibleEmployees.map(e => ({
      employee: e,
      area: areas.find(a => a.id === e.areaId),
      sundays: shifts.filter(s => s.employeeId === e.id && s.code !== "OFF" && s.code !== "ABS" && isSundayOrHoliday(s.date) && new Date(s.date + "T00:00:00").getDay() === 0).length,
      holidays: shifts.filter(s => s.employeeId === e.id && s.code !== "OFF" && s.code !== "ABS" && isSundayOrHoliday(s.date) && new Date(s.date + "T00:00:00").getDay() !== 0).length,
      total: map.get(e.id) ?? 0,
    }));
    const avg = rows.length > 0 ? rows.reduce((s, r) => s + r.total, 0) / rows.length : 0;
    return { rows, avg };
  }, [visibleEmployees, shifts, areas]);

  function weekTotal(eid: string) {
    const list = isoDays.map(d => getShift(eid, d)).filter(Boolean) as Shift[];
    const area = areas.find(a => a.id === employees.find(e => e.id === eid)?.areaId);
    return sumBreakdowns(list.map(s => shiftBreakdown(s, area)));
  }

  // Scheduled + absence + holiday hours (8h per holiday with no shift). Separate from weekTotal.
  function weekHTotal(eid: string): number {
    const emp = employees.find(e => e.id === eid);
    const area = areas.find(a => a.id === emp?.areaId);
    let total = 0;
    for (const date of isoDays) {
      const s = getEffectiveShift(eid, date);
      const holiday = isHoliday(date);
      if (!s || s.code === "OFF") {
        if (holiday) total += 8;
      } else if (s.code === "ABS") {
        const info = parseAbsNote(s.note);
        total += info ? info.absEnd - info.absStart : 8;
        total += Math.max(0, s.end - s.start - (s.breakMinutes ?? 0) / 60);
      } else {
        total += shiftBreakdown(s, area).total;
      }
    }
    return total;
  }

  function shiftWeek(delta: number) {
    setWeekISO(toISO(addDays(ws, delta * 7)));
  }

  return (
    <>
      <Topbar
        title="Programación de turnos"
        subtitle="Vista grilla semanal · Lunes a Domingo"
        right={
          <div className="flex items-center gap-2">
            <select
              value={numWeeks}
              onChange={(e) => setNumWeeks(Number(e.target.value))}
              className="hidden sm:block text-sm rounded-pill border border-border bg-card px-3.5 py-2"
            >
              <option value={1}>1 semana</option>
              <option value={2}>2 semanas</option>
              <option value={4}>4 semanas</option>
              <option value={8}>8 semanas</option>
            </select>
            {canGenerate && (
              <button
                onClick={handleGenerate}
                className="inline-flex items-center gap-2 rounded-pill bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Sparkles className="size-4" />
                <span className="hidden sm:inline">Generar inteligente</span>
              </button>
            )}
          </div>
        }
      />

      <div className="px-4 md:px-6 py-4 md:py-6 max-w-[1280px] mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Selector de vista */}
          <div className="flex items-center rounded-pill border border-border bg-card p-1 gap-0.5 text-sm">
            <button
              onClick={() => setView("week")}
              className={cn("px-3.5 py-2 rounded-pill transition-all font-medium", view === "week" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              Semana
            </button>
            <button
              onClick={() => setView("month")}
              className={cn("px-3.5 py-2 rounded-pill transition-all inline-flex items-center gap-1.5 font-medium", view === "month" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <CalendarDays className="size-3.5" />Mes
            </button>
          </div>

          {/* Navegador de semana */}
          {view === "week" && (
            <div className="flex items-center rounded-pill border border-border bg-card overflow-hidden">
              <button onClick={() => shiftWeek(-1)} className="p-2 hover:bg-secondary"><ChevronLeft className="size-4" /></button>
              <div className="px-3 py-2 text-sm font-medium border-x border-border">
                Semana del {days[0].getDate()}/{days[0].getMonth()+1} – {days[6].getDate()}/{days[6].getMonth()+1}
              </div>
              <button onClick={() => shiftWeek(1)} className="p-2 hover:bg-secondary"><ChevronRight className="size-4" /></button>
            </div>
          )}

          {/* Navegador de mes */}
          {view === "month" && (
            <div className="flex items-center rounded-pill border border-border bg-card overflow-hidden">
              <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-2 hover:bg-secondary"><ChevronLeft className="size-4" /></button>
              <div className="px-3 py-2 text-sm font-medium border-x border-border capitalize">
                {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
              </div>
              <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-2 hover:bg-secondary"><ChevronRight className="size-4" /></button>
            </div>
          )}

          <button
            onClick={() => {
              if (view === "week") setWeekISO(toISO(startOfWeek(new Date())));
              else { const n = new Date(); setMonthDate(new Date(n.getFullYear(), n.getMonth(), 1)); }
            }}
            className="text-sm px-3.5 py-2 rounded-pill border border-border hover:bg-secondary"
          >
            Hoy
          </button>

          {/* Separador */}
          {view === "week" && (
            <div className="w-px h-5 bg-border mx-0.5 shrink-0" />
          )}

          {/* Acciones secundarias */}
          {view === "week" && canEdit && (
            <>
              <button
                onClick={toggleWeekLock}
                title={weekLockState === "full" ? "Desbloquear semana" : weekLockState === "partial" ? "Semana parcialmente bloqueada" : "Bloquear semana"}
                className={cn(
                  "h-9 px-3.5 rounded-pill border flex items-center gap-1.5 text-sm transition-colors",
                  weekLockState === "full"
                    ? "bg-primary/15 text-primary border-primary/30"
                    : weekLockState === "partial"
                    ? "bg-amber-400/15 text-amber-600 dark:text-amber-400 border-amber-400/30"
                    : "border-border bg-card text-foreground hover:bg-secondary"
                )}
              >
                {weekLockState === "full" ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                {weekLockState === "full" ? "Desbloquear" : "Bloquear"}
              </button>

              <button
                onClick={() => setShowClearConfirm(true)}
                disabled={!canClearWeek || clearing}
                title={!canClearWeek ? "No hay turnos desbloqueados para limpiar" : "Limpiar turnos no bloqueados de la semana"}
                className={cn(
                  "h-9 px-3.5 rounded-pill border border-border bg-card flex items-center gap-1.5 text-sm transition-colors",
                  canClearWeek && !clearing
                    ? "text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                    : "text-muted-foreground opacity-40 cursor-not-allowed"
                )}
              >
                <Eraser className="size-4" />
                Limpiar
              </button>
            </>
          )}

          {view === "week" && (
            <button
              onClick={() => setShowEquity(v => !v)}
              title="Equidad de domingos y festivos"
              className={cn(
                "h-9 px-3.5 rounded-pill border flex items-center gap-1.5 text-sm transition-colors",
                showEquity
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              )}
            >
              <History className="size-4" />
              Equidad
            </button>
          )}

          {/* Filtro de área */}
          <div className="ml-auto relative">
            {ownArea ? (
              <span className="h-9 px-3.5 rounded-pill border border-border bg-card flex items-center gap-1.5 text-sm text-muted-foreground">
                <Filter className="size-4 shrink-0" />
                {areas.find(a => a.id === ownArea)?.name ?? "Mi área"}
              </span>
            ) : (
              <div className="relative flex items-center">
                <Filter className="absolute left-3 size-4 text-muted-foreground pointer-events-none shrink-0" />
                <select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  className="h-9 pl-8 pr-3.5 rounded-pill border border-border bg-card text-sm"
                >
                  <option value="all">Todas las áreas</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {view === "month" && <MonthlyView summary={monthSummary} />}

        {view === "week" && swapSource && (() => {
          const srcEmp = employees.find(e => e.id === swapSource.employeeId);
          const d = new Date(swapSource.date + "T00:00:00");
          const dateLabel = `${DAY_LABELS[(d.getDay() + 6) % 7]} ${d.getDate()}/${d.getMonth() + 1}`;
          return (
            <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
              style={{ background: "color-mix(in srgb,#ED5650 10%,transparent)", border: "1px solid color-mix(in srgb,#ED5650 30%,transparent)" }}>
              <ArrowLeftRight className="size-4 shrink-0" style={{ color: "#ED5650" }} />
              <span className="flex-1 text-foreground">
                Intercambiando turno de <strong>{srcEmp?.fullName}</strong> · {dateLabel}
                {" — "}haz clic en otro empleado para completar el intercambio
              </span>
              <button
                onClick={() => setSwapSource(null)}
                className="text-xs font-medium px-2.5 py-1 rounded-pill transition hover:bg-primary/10"
                style={{ color: "#ED5650", border: "1px solid color-mix(in srgb,#ED5650 30%,transparent)" }}
              >
                Cancelar (ESC)
              </button>
            </div>
          );
        })()}

        {view === "week" && showEquity && (
          <EquityPanel data={equityData} />
        )}

        {view === "week" && <Legend />}

        <div className={cn("rounded-card bg-card overflow-hidden shadow-card", view === "month" && "hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground w-44 sticky top-0 left-0 z-20" style={{ backgroundColor: 'var(--color-card)' }}>Trabajador</th>
                  {days.map((d, i) => {
                    const isToday = isoDays[i] === toISO(new Date());
                    const holiday = isHoliday(isoDays[i]);
                    return (
                      <th key={i} className="px-2 py-3 font-medium text-center min-w-[110px] border-l border-border sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }}>
                        <div className={cn("text-[11px] font-medium uppercase tracking-wide", isToday ? "text-primary" : "text-muted-foreground")}>{DAY_LABELS[i]}</div>
                        <div className="mt-0.5 flex justify-center">
                          {isToday
                            ? <span className="inline-flex items-center justify-center size-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">{d.getDate()}</span>
                            : <span className="text-base font-semibold">{d.getDate()}</span>
                          }
                        </div>
                        {holiday && (
                          <div className="mt-1 flex justify-center">
                            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-700/40">
                              Festivo
                            </span>
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground text-right w-28 border-l border-border sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }}>Total Prog.</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground text-right w-28 border-l border-border sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }}>Total Sem.</th>
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((e, idx) => {
                  const total = weekTotal(e.id);
                  const area = areas.find(a => a.id === e.areaId);
                  const overload = area && total.total > area.maxHoursWeek;
                  return (
                    <tr key={e.id} className={cn("border-t border-border/60", idx % 2 === 1 && "bg-secondary/20")}>
                      <td className="px-4 py-2 sticky left-0 z-10 w-44" style={{ backgroundColor: 'var(--color-card)' }}>
                        <div className="flex items-center gap-2">
                          <div className="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                            {e.fullName.split(" ").map(n => n[0]).slice(0,2).join("")}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{e.fullName}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{e.position}</div>
                          </div>
                        </div>
                      </td>
                      {isoDays.map(date => {
                        const s = getEffectiveShift(e.id, date);
                        const swapState = swapSource?.employeeId === e.id && swapSource?.date === date
                          ? "source" as const
                          : swapSource && swapSource.date === date
                          ? "target" as const
                          : undefined;
                        return (
                          <td key={date} className="px-1.5 py-1.5 align-top border-l border-border">
                            <ShiftCell
                              shift={s}
                              area={area}
                              onClick={() => handleCellClick(e.id, date)}
                              onSwapClick={canEdit && !swapSource && s && s.code !== "OFF" && s.code !== "ABS" && !s.locked
                                ? (ev) => { ev.stopPropagation(); setSwapSource({ employeeId: e.id, date }); }
                                : undefined}
                              swapState={swapState}
                              isHolidayDay={isHoliday(date)}
                            />
                          </td>
                        );
                      })}
                      <td className={cn("px-4 py-2 text-right border-l border-border font-semibold", overload && "text-primary")}>
                        {fmtHours(total.total)}
                        {overload && <div className="text-[10px] font-normal text-primary">Sobrecarga</div>}
                      </td>
                      <td className="px-4 py-2 text-right border-l border-border">
                        <span className="font-semibold tabular-nums">{fmtHours(weekHTotal(e.id))}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {coverageAreas.length > 0 && (
                <tfoot>
                  {coverageAreas.map(({ area, daySlots }) => {
                    const criticalCount = daySlots.flat().filter(s => s.status === "critical").length;
                    const warnCount = daySlots.flat().filter(s => s.status === "warn").length;
                    return (
                      <tr key={area.id} className="border-t-2 border-border bg-secondary/30">
                        <td className="px-4 py-2 sticky left-0 z-10" style={{ backgroundColor: 'var(--color-card)' }}>
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cobertura mínima</div>
                          <div className="text-xs font-medium truncate">{area.name}</div>
                        </td>
                        {daySlots.map((slots, i) => (
                          <td key={i} className="px-1.5 py-1.5 border-l border-border align-top">
                            <div className="flex flex-col gap-0.5">
                              {slots.length === 0
                                ? <span className="text-[10px] text-muted-foreground/40 leading-tight">—</span>
                                : slots.map((slot, j) => (
                                  <div key={j} className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-tight"
                                    style={slot.status === "critical"
                                      ? { background: "color-mix(in srgb,#ED5650 12%,transparent)", border: "1px solid color-mix(in srgb,#ED5650 30%,transparent)", color: "#ED5650" }
                                      : slot.status === "warn"
                                      ? { background: "color-mix(in srgb,#C98A00 12%,transparent)", border: "1px solid color-mix(in srgb,#C98A00 28%,transparent)", color: "#C98A00" }
                                      : { background: "color-mix(in srgb,#1F8A5B 12%,transparent)", border: "1px solid color-mix(in srgb,#1F8A5B 28%,transparent)", color: "#1F8A5B" }
                                    }>
                                    <span className="size-1.5 rounded-full shrink-0"
                                      style={{ background: slot.status === "critical" ? "#ED5650" : slot.status === "warn" ? "#C98A00" : "#1F8A5B" }} />
                                    <span className="tabular-nums">{padH(slot.req.startHour)}–{padH(slot.req.endHour)}</span>
                                    <span className="ml-auto font-bold tabular-nums">{slot.actual}/{slot.req.minWorkers}</span>
                                  </div>
                                ))
                              }
                            </div>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right border-l border-border text-xs font-semibold">
                          {criticalCount > 0
                            ? <span className="text-red-600">{criticalCount} crítico{criticalCount > 1 ? "s" : ""}</span>
                            : warnCount > 0
                            ? <span className="text-amber-600">{warnCount} alerta{warnCount > 1 ? "s" : ""}</span>
                            : <span className="text-green-600">✓ OK</span>
                          }
                        </td>
                        <td className="border-l border-border" />
                      </tr>
                    );
                  })}
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {showGenerateConfirm && (() => {
        const areaLabel = areaFilter === "all" ? "todas las áreas" : areas.find(a => a.id === areaFilter)?.name ?? "el área";
        const weekLabel = `${days[0].getDate()}/${days[0].getMonth() + 1} – ${days[6].getDate()}/${days[6].getMonth() + 1}`;
        const endWs = addDays(ws, (numWeeks - 1) * 7);
        const endDays = weekDays(endWs);
        const rangeLabel = numWeeks === 1
          ? weekLabel
          : `${days[0].getDate()}/${days[0].getMonth() + 1} – ${endDays[6].getDate()}/${endDays[6].getMonth() + 1}`;
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={() => setShowGenerateConfirm(false)}>
            <div className="bg-card rounded-card shadow-card max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-4 bg-primary/10 border-b border-primary/20 flex items-center gap-3">
                <div className="size-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Sparkles className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-primary">Generar programación inteligente</p>
                  <p className="text-xs text-primary/70">Los turnos no bloqueados serán reemplazados</p>
                </div>
                <button onClick={() => setShowGenerateConfirm(false)} className="p-1 rounded hover:bg-primary/10 shrink-0">
                  <X className="size-4 text-primary/60" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-3">
                <p className="text-sm text-foreground leading-relaxed">
                  Se generará automáticamente la rotación de turnos para:
                </p>
                <div className="rounded-xl bg-secondary/60 border border-border px-4 py-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Período</span>
                    <span className="font-semibold">{rangeLabel}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground text-xs">Semanas</span>
                    <span className="font-semibold">{numWeeks} {numWeeks === 1 ? "semana" : "semanas"}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground text-xs">Área</span>
                    <span className="font-semibold">{areaLabel}</span>
                  </div>
                </div>
                {anchorUnlockedCount > 0 && (
                  <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <strong>{anchorUnlockedCount} turno{anchorUnlockedCount > 1 ? "s" : ""}</strong> en la semana
                      ancla no {anchorUnlockedCount > 1 ? "están bloqueados" : "está bloqueado"} y no{" "}
                      {anchorUnlockedCount > 1 ? "entrarán" : "entrará"} en la rotación.
                      Cierra este diálogo y bloquéalos primero si quieres incluirlos.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Los turnos bloqueados <span className="inline-flex items-center gap-0.5 font-medium text-foreground"><Lock className="size-3" /> no se verán afectados.</span>
                </p>
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-border flex justify-end gap-2">
                <button
                  onClick={() => setShowGenerateConfirm(false)}
                  className="text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmGenerate}
                  className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 font-medium inline-flex items-center gap-2"
                >
                  <Sparkles className="size-3.5" /> {anchorUnlockedCount > 0 ? "Generar igualmente" : "Generar"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showClearConfirm && (() => {
        const areaLabel = areaFilter === "all" ? "todas las áreas" : areas.find(a => a.id === areaFilter)?.name ?? "el área";
        const weekLabel = `${days[0].getDate()}/${days[0].getMonth() + 1} – ${days[6].getDate()}/${days[6].getMonth() + 1}`;
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={() => setShowClearConfirm(false)}>
            <div className="bg-card rounded-card shadow-card max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-4 bg-destructive/10 border-b border-destructive/20 flex items-center gap-3">
                <div className="size-9 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                  <Eraser className="size-5 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-destructive">Limpiar semana</p>
                  <p className="text-xs text-destructive/70">Esta acción no se puede deshacer</p>
                </div>
                <button onClick={() => setShowClearConfirm(false)} className="p-1 rounded hover:bg-destructive/10 shrink-0">
                  <X className="size-4 text-destructive/60" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-3">
                <p className="text-sm text-foreground leading-relaxed">
                  Se eliminarán todos los turnos <strong>no bloqueados</strong> de la semana:
                </p>
                <div className="rounded-xl bg-secondary/60 border border-border px-4 py-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Semana</span>
                    <span className="font-semibold">{weekLabel}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground text-xs">Área</span>
                    <span className="font-semibold">{areaLabel}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Los turnos bloqueados <span className="inline-flex items-center gap-0.5 font-medium text-foreground"><Lock className="size-3" /> no se verán afectados.</span>
                </p>
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-border flex justify-end gap-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmClearWeek}
                  className="text-sm px-4 py-2 rounded-pill bg-destructive text-white hover:opacity-90 font-medium inline-flex items-center gap-2"
                >
                  <Eraser className="size-3.5" /> Limpiar semana
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showBaseWeekWarning && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={() => setShowBaseWeekWarning(false)}>
          <div className="bg-card rounded-card shadow-card max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
              <div className="size-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="size-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-800">Semana base sin bloquear</p>
                <p className="text-xs text-amber-700">No se puede generar la programación inteligente</p>
              </div>
              <button onClick={() => setShowBaseWeekWarning(false)} className="ml-auto p-1 rounded hover:bg-amber-100">
                <X className="size-4 text-amber-600" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">
                Para generar la programación inteligente de la semana actual, primero debes <strong>bloquear la semana anterior</strong> (semana base).
              </p>
              <div className="rounded-xl bg-secondary/60 border border-border px-4 py-3 space-y-2 text-sm">
                <p className="font-medium text-foreground">Pasos a seguir:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs leading-relaxed">
                  <li>Navega a la semana anterior <span className="font-medium text-foreground">({prevWeekLabel})</span> usando la flecha ←</li>
                  <li>Verifica que los turnos estén correctos</li>
                  <li>Presiona <span className="inline-flex items-center gap-1 font-medium text-foreground"><Lock className="size-3" /> Bloquear semana</span></li>
                  <li>Regresa a esta semana y presiona <span className="inline-flex items-center gap-1 font-medium text-foreground"><Sparkles className="size-3" /> Generar inteligente</span></li>
                </ol>
              </div>
              <p className="text-xs text-muted-foreground">
                El bloqueo evita que la generación modifique turnos ya confirmados y sirve como punto de referencia para calcular la rotación.
              </p>
            </div>
            <div className="p-4 border-t border-border flex justify-end">
              <button
                onClick={() => setShowBaseWeekWarning(false)}
                className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 font-medium"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <ShiftEditor
          employee={employees.find(e => e.id === editing.employeeId)!}
          date={editing.date}
          shift={getEffectiveShift(editing.employeeId, editing.date)}
          onClose={() => setEditing(null)}
          onSave={(patch: any) => {
            const prev = getEffectiveShift(editing.employeeId, editing.date);
            const isNew = !prev || prev.code === "OFF";
            setShift(editing.employeeId, editing.date, patch);
            setEditing(null);
            if (patch.code !== "OFF" && patch.code !== "ABS") {
              dispatchShiftEvent({ data: {
                event: isNew ? "shift_created" : "shift_updated",
                employeeId: editing.employeeId,
                date: editing.date,
                startHour: patch.start,
                endHour: patch.end,
              }}).catch(e => console.error("[notif:shift]", e?.message ?? e));
            }
          }}
          onClear={() => {
            const prev = getEffectiveShift(editing.employeeId, editing.date);
            clearShift(editing.employeeId, editing.date);
            setEditing(null);
            if (prev && prev.code !== "OFF" && prev.code !== "ABS") {
              dispatchShiftEvent({ data: {
                event: "shift_deleted",
                employeeId: editing.employeeId,
                date: editing.date,
              }}).catch(e => console.error("[notif:shift_deleted]", e?.message ?? e));
            }
          }}
          onHistory={() => {
            const emp = employees.find(e => e.id === editing.employeeId);
            setHistoryModal({ employeeId: editing.employeeId, date: editing.date, employeeName: emp?.fullName ?? "" });
            setEditing(null);
          }}
        />
      )}

      {historyModal && (
        <ShiftHistoryModal
          employeeId={historyModal.employeeId}
          date={historyModal.date}
          employeeName={historyModal.employeeName}
          onClose={() => setHistoryModal(null)}
        />
      )}

      {swapTarget && swapSource && (() => {
        const empA = employees.find(e => e.id === swapSource.employeeId);
        const empB = employees.find(e => e.id === swapTarget.employeeId);
        if (!empA || !empB) return null;
        return (
          <SwapConfirmModal
            empA={empA}
            empB={empB}
            shiftA={getEffectiveShift(swapSource.employeeId, swapSource.date)}
            shiftB={getEffectiveShift(swapTarget.employeeId, swapTarget.date)}
            date={swapSource.date}
            onConfirm={handleSwapConfirm}
            onCancel={() => setSwapTarget(null)}
          />
        );
      })()}
    </>
  );
}

function cellBg(code: string): [string, string, string] {
  const m: Record<string, [string, string, string]> = {
    STD:  ["bg-[color-mix(in_srgb,#ADADAE_13%,transparent)]", "text-[#7a7a7a]", "color-mix(in srgb,#ADADAE 30%,transparent)"],
    HED:  ["bg-[color-mix(in_srgb,#ED5650_13%,transparent)]", "text-[#ED5650]", "color-mix(in srgb,#ED5650 30%,transparent)"],
    HEN:  ["bg-[color-mix(in_srgb,#B13833_18%,transparent)]", "text-[#B13833]", "color-mix(in srgb,#B13833 38%,transparent)"],
    HEDF: ["bg-[color-mix(in_srgb,#ED5650_26%,transparent)]", "text-[#c43f3a]", "color-mix(in srgb,#ED5650 46%,transparent)"],
    HENF: ["bg-[color-mix(in_srgb,#B13833_26%,transparent)]", "text-[#9a302d]", "color-mix(in srgb,#B13833 46%,transparent)"],
    RN:   ["bg-[color-mix(in_srgb,#62EFFF_16%,transparent)]", "text-[#0A8FA4]", "color-mix(in srgb,#62EFFF 34%,transparent)"],
    RDF:  ["bg-[color-mix(in_srgb,#DDCB05_20%,transparent)]", "text-[#8B8000]", "color-mix(in srgb,#DDCB05 40%,transparent)"],
    RNF:  ["bg-[color-mix(in_srgb,#DDCB05_20%,transparent)]", "text-[#8B8000]", "color-mix(in srgb,#DDCB05 40%,transparent)"],
    ABS:  ["bg-[color-mix(in_srgb,#C98A00_13%,transparent)]", "text-[#C98A00]", "color-mix(in srgb,#C98A00 28%,transparent)"],
  };
  return m[code] ?? ["bg-secondary/40", "text-muted-foreground", "var(--color-border)"];
}

function ShiftCell({ shift, area, onClick, onSwapClick, swapState, isHolidayDay }: {
  shift?: Shift;
  area?: Area;
  onClick: () => void;
  onSwapClick?: (e: React.MouseEvent) => void;
  swapState?: "source" | "target";
  isHolidayDay?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);

  const breakdown = useMemo(() => {
    if (!shift || shift.code === "OFF" || (shift.code === "ABS" && shift.start === 0 && shift.end === 0)) return null;
    return shiftBreakdown(shift, area);
  }, [shift, area]);

  function onEnter() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const w = 256;
    let x = r.left;
    if (x + w > window.innerWidth - 8) x = Math.max(8, window.innerWidth - w - 8);
    const estimatedH = breakdown ? 220 : 110;
    const y = r.bottom + 6 + estimatedH > window.innerHeight ? r.top - estimatedH - 6 : r.bottom + 6;
    setTipPos({ x, y });
  }

  if (!shift || shift.code === "OFF") {
    return (
      <button
        onClick={onClick}
        className={cn(
          "w-full h-[56px] rounded-lg border border-dashed text-xs text-muted-foreground transition",
          swapState === "target"
            ? "border-primary/40 bg-primary/5 text-primary"
            : isHolidayDay && shift?.code !== "OFF"
            ? "border-amber-300/60 bg-amber-50/40 hover:bg-amber-50/80 hover:border-amber-400/60 dark:bg-amber-900/10 dark:border-amber-700/40"
            : "border-border/60 hover:bg-secondary hover:border-primary"
        )}
      >
        {swapState === "target" ? (
          <ArrowLeftRight className="size-3.5 mx-auto" />
        ) : shift?.code === "OFF" ? (
          <span className="opacity-50">Descanso</span>
        ) : isHolidayDay ? (
          <div className="flex flex-col items-center gap-0.5 leading-tight">
            <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Festivo</span>
            <span className="text-[10px] text-muted-foreground/70">+ Asignar</span>
          </div>
        ) : (
          "+ Asignar"
        )}
      </button>
    );
  }

  const cc = cellBg(shift.code);
  const c = codeColor(shift.code);
  const workHours = Math.max(0, shift.end - shift.start - shift.breakMinutes / 60);

  if (shift.code === "ABS") {
    const absInfo = parseAbsNote(shift.note);
    const absHours = absInfo ? absInfo.absEnd - absInfo.absStart : 8;
    const isPartial = absInfo && !(absInfo.absStart === 0 && absInfo.absEnd === 8);
    return (
      <>
        <button
          ref={btnRef}
          onClick={onClick}
          onMouseEnter={onEnter}
          onMouseLeave={() => setTipPos(null)}
          className={cn(
            "w-full h-[56px] rounded-lg text-left px-2.5 py-1.5 transition hover:ring-1 hover:ring-primary/50 hover:shadow-sm",
            cc[0],
            swapState === "source" ? "ring-2 ring-primary ring-offset-1" :
            swapState === "target" ? "ring-2 ring-primary/30 ring-offset-1" : ""
          )}
          style={{ border: `1px solid ${cc[2]}` }}
        >
          <div className={cn("flex items-center justify-between text-[10px] font-bold uppercase tracking-wider", cc[1])}>
            <span>ABS</span>
            {shift.locked && <Lock className="size-3" />}
          </div>
          <div className="text-xs font-semibold mt-0.5 text-foreground truncate">
            {isPartial ? `${pad(absInfo!.absStart)}–${pad(absInfo!.absEnd)}` : "Ausente"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {absHours}h{workHours > 0 ? ` +${workHours.toFixed(1)}h` : ""}
          </div>
        </button>
        {tipPos && <ShiftTooltip shift={shift} breakdown={breakdown} workHours={workHours} pos={tipPos} c={c} />}
      </>
    );
  }

  return (
    <>
      <div className="relative group/cell">
        <button
          ref={btnRef}
          onClick={onClick}
          onMouseEnter={onEnter}
          onMouseLeave={() => setTipPos(null)}
          className={cn(
            "w-full h-[56px] rounded-lg text-left px-2.5 py-1.5 transition hover:ring-1 hover:ring-primary/50 hover:shadow-sm",
            cc[0],
            swapState === "source" ? "ring-2 ring-primary ring-offset-1" :
            swapState === "target" ? "ring-2 ring-border ring-offset-1" : ""
          )}
          style={{ border: `1px solid ${cc[2]}` }}
        >
          <div className={cn("flex items-center justify-between text-[10px] font-bold uppercase tracking-wider", cc[1])}>
            <span>{swapState === "source" ? "↔ " : ""}{shift.code}</span>
            {shift.locked ? <Lock className="size-3" /> : swapState === "target" ? <ArrowLeftRight className="size-3 text-primary" /> : null}
          </div>
          <div className="text-xs font-semibold mt-0.5 text-foreground">{`${pad(shift.start)}–${pad(shift.end)}`}</div>
          <div className="text-[10px] text-muted-foreground">{workHours.toFixed(1)}h</div>
        </button>
        {onSwapClick && (
          <button
            onClick={onSwapClick}
            title="Intercambiar este turno con otro empleado"
            className="absolute top-0.5 right-0.5 p-0.5 rounded bg-card/90 text-muted-foreground hover:text-primary opacity-0 group-hover/cell:opacity-100 transition-opacity"
          >
            <ArrowLeftRight className="size-3" />
          </button>
        )}
      </div>
      {tipPos && <ShiftTooltip shift={shift} breakdown={breakdown} workHours={workHours} pos={tipPos} c={c} />}
    </>
  );
}

function pad(h: number) { return String(h).padStart(2,"0") + ":00"; }
function padH(h: number) { return String(h).padStart(2,"0"); }

const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function ColTooltip({ label, tip }: { label: string; tip: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className="inline-flex items-center gap-1 cursor-default"
      onMouseEnter={e => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPos({ x: r.left + r.width / 2, y: r.bottom + 6 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {label}
      <Info className="size-3 opacity-50 shrink-0" />
      {pos && createPortal(
        <div
          style={{ position: "fixed", left: pos.x, top: pos.y, transform: "translateX(-50%)", zIndex: 9999 }}
          className="max-w-[260px] rounded-lg border border-border bg-popover shadow-lg px-3 py-2 text-[11px] leading-relaxed text-popover-foreground pointer-events-none"
        >
          {tip}
        </div>,
        document.body
      )}
    </span>
  );
}

function MonthlyView({ summary }: {
  summary: Array<{
    employee: Employee;
    area: Area | undefined;
    breakdown: NoveltyBreakdown;
    daysWorked: number;
    absenceDays: number;
    contractHours: number;
    monthHTotal: number;
  }>;
}) {
  const totals = summary.reduce(
    (acc, r) => ({
      std:  acc.std  + r.breakdown.std,
      HED:  acc.HED  + r.breakdown.HED,
      HEN:  acc.HEN  + r.breakdown.HEN,
      RN:   acc.RN   + r.breakdown.RN,
      RDF:  acc.RDF  + r.breakdown.RDF,
      otros: acc.otros + r.breakdown.HEDF + r.breakdown.HENF + r.breakdown.RNF,
      total: acc.total + r.breakdown.total,
      contract: acc.contract + r.contractHours,
      monthHTotal: acc.monthHTotal + r.monthHTotal,
    }),
    { std: 0, HED: 0, HEN: 0, RN: 0, RDF: 0, otros: 0, total: 0, contract: 0, monthHTotal: 0 }
  );

  return (
    <div className="rounded-card bg-card overflow-hidden shadow-card">
      {summary.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground text-sm">
          No hay turnos registrados para este mes. Genera una programación para ver el resumen.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground sticky top-0 left-0 z-20 min-w-56" style={{ backgroundColor: 'var(--color-card)' }}>Trabajador</th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground border-l border-border whitespace-nowrap sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }} title="Jornada estándar diurna">STD</th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.03em] text-amber-700 border-l border-border whitespace-nowrap sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }} title="Hora extra diurna">HED</th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.03em] text-amber-700 border-l border-border whitespace-nowrap sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }} title="Hora extra nocturna">HEN</th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground border-l border-border whitespace-nowrap sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }} title="Recargo nocturno">RN</th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground border-l border-border whitespace-nowrap sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }} title="Recargo dominical / festivo">RDF</th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground border-l border-border whitespace-nowrap sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }} title="HEDF + HENF + RNF">Otros</th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground border-l border-border whitespace-nowrap sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }}>Total Prog</th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground border-l border-border whitespace-nowrap sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }}>Meta</th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground border-l border-border whitespace-nowrap min-w-40 sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }}>
                  <ColTooltip label="Progreso mes Prog" tip="Horas programadas del mes vs. la meta mensual configurada para el área. Solo cuenta turnos activos, sin ausencias ni festivos." />
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground border-l border-border whitespace-nowrap sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }}>Total Mes</th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground border-l border-border whitespace-nowrap min-w-40 sticky top-0 z-10" style={{ backgroundColor: 'var(--color-card)' }}>
                  <ColTooltip label="Progreso mes" tip="Horas totales del mes vs. la meta del área: incluye turnos programados + horas de ausencias parciales + 8 h automáticas por cada día festivo sin turno asignado." />
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.map(({ employee, area, breakdown, daysWorked, absenceDays, contractHours, monthHTotal }, idx) => {
                const otros = breakdown.HEDF + breakdown.HENF + breakdown.RNF;
                const diff = breakdown.total - contractHours;
                const pct = contractHours > 0 ? Math.min(110, (breakdown.total / contractHours) * 100) : 0;
                const isOver = diff > 0;
                const diffMes = monthHTotal - contractHours;
                const pctMes = contractHours > 0 ? Math.min(110, (monthHTotal / contractHours) * 100) : 0;
                const isOverMes = diffMes > 0;
                return (
                  <tr key={employee.id} className={cn("border-t border-border", idx % 2 === 1 && "bg-secondary/20")}>
                    <td className="px-4 py-2.5 sticky left-0 z-10" style={{ backgroundColor: 'var(--color-card)' }}>
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                          {employee.fullName.split(" ").map(n => n[0]).slice(0,2).join("")}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{employee.fullName}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                            <span>{area?.name}</span>
                            <span className="text-muted-foreground/60">·</span>
                            <span>{daysWorked}d trabajados</span>
                            {absenceDays > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-amber-600">
                                <AlertTriangle className="size-2.5" />{absenceDays}d aus.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right border-l border-border text-xs tabular-nums">{fmtHours(breakdown.std)}</td>
                    <td className={cn("px-3 py-2.5 text-right border-l border-border text-xs tabular-nums font-medium", breakdown.HED > 0 ? "text-amber-600" : "text-muted-foreground/40")}>
                      {breakdown.HED > 0 ? fmtHours(breakdown.HED) : "—"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right border-l border-border text-xs tabular-nums font-medium", breakdown.HEN > 0 ? "text-amber-600" : "text-muted-foreground/40")}>
                      {breakdown.HEN > 0 ? fmtHours(breakdown.HEN) : "—"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right border-l border-border text-xs tabular-nums", breakdown.RN > 0 ? "text-foreground" : "text-muted-foreground/40")}>
                      {breakdown.RN > 0 ? fmtHours(breakdown.RN) : "—"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right border-l border-border text-xs tabular-nums", breakdown.RDF > 0 ? "text-foreground" : "text-muted-foreground/40")}>
                      {breakdown.RDF > 0 ? fmtHours(breakdown.RDF) : "—"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right border-l border-border text-xs tabular-nums", otros > 0 ? "text-foreground" : "text-muted-foreground/40")}>
                      {otros > 0 ? fmtHours(otros) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right border-l border-border text-sm font-bold tabular-nums">{fmtHours(breakdown.total)}</td>
                    <td className="px-3 py-2.5 text-right border-l border-border text-xs text-muted-foreground tabular-nums">{contractHours}h</td>
                    <td className="px-4 py-2.5 border-l border-border">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden min-w-14">
                          <div
                            className={cn("h-full rounded-full transition-all",
                              isOver ? "bg-destructive" : pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-primary" : "bg-amber-400"
                            )}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <span className={cn("text-xs font-semibold tabular-nums w-8 text-right shrink-0",
                          isOver ? "text-destructive" : pct >= 100 ? "text-green-600" : "text-muted-foreground"
                        )}>
                          {Math.round(pct)}%
                        </span>
                        <span className={cn("text-[10px] tabular-nums shrink-0 w-10 text-right",
                          isOver ? "text-destructive font-semibold" : diff < -8 ? "text-amber-600" : "text-muted-foreground"
                        )}>
                          {diff >= 0 ? `+${fmtHours(diff)}` : fmtHours(diff)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right border-l border-border text-sm font-bold tabular-nums">{fmtHours(monthHTotal)}</td>
                    <td className="px-4 py-2.5 border-l border-border">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden min-w-14">
                          <div
                            className={cn("h-full rounded-full transition-all",
                              isOverMes ? "bg-destructive" : pctMes >= 100 ? "bg-green-500" : pctMes >= 70 ? "bg-primary" : "bg-amber-400"
                            )}
                            style={{ width: `${Math.min(100, pctMes)}%` }}
                          />
                        </div>
                        <span className={cn("text-xs font-semibold tabular-nums w-8 text-right shrink-0",
                          isOverMes ? "text-destructive" : pctMes >= 100 ? "text-green-600" : "text-muted-foreground"
                        )}>
                          {Math.round(pctMes)}%
                        </span>
                        <span className={cn("text-[10px] tabular-nums shrink-0 w-10 text-right",
                          isOverMes ? "text-destructive font-semibold" : diffMes < -8 ? "text-amber-600" : "text-muted-foreground"
                        )}>
                          {diffMes >= 0 ? `+${fmtHours(diffMes)}` : fmtHours(diffMes)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-border bg-secondary/40">
              <tr>
                <td className="px-4 py-2.5 sticky left-0 z-10" style={{ backgroundColor: 'var(--color-secondary)' }}>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total equipo</span>
                </td>
                <td className="px-3 py-2.5 text-right border-l border-border text-xs font-bold tabular-nums">{fmtHours(totals.std)}</td>
                <td className={cn("px-3 py-2.5 text-right border-l border-border text-xs font-bold tabular-nums", totals.HED > 0 ? "text-amber-600" : "text-muted-foreground/40")}>{totals.HED > 0 ? fmtHours(totals.HED) : "—"}</td>
                <td className={cn("px-3 py-2.5 text-right border-l border-border text-xs font-bold tabular-nums", totals.HEN > 0 ? "text-amber-600" : "text-muted-foreground/40")}>{totals.HEN > 0 ? fmtHours(totals.HEN) : "—"}</td>
                <td className="px-3 py-2.5 text-right border-l border-border text-xs font-bold tabular-nums text-muted-foreground">{totals.RN > 0 ? fmtHours(totals.RN) : "—"}</td>
                <td className="px-3 py-2.5 text-right border-l border-border text-xs font-bold tabular-nums text-muted-foreground">{totals.RDF > 0 ? fmtHours(totals.RDF) : "—"}</td>
                <td className="px-3 py-2.5 text-right border-l border-border text-xs font-bold tabular-nums text-muted-foreground">{totals.otros > 0 ? fmtHours(totals.otros) : "—"}</td>
                <td className="px-3 py-2.5 text-right border-l border-border font-bold tabular-nums">{fmtHours(totals.total)}</td>
                <td className="px-3 py-2.5 text-right border-l border-border text-xs text-muted-foreground tabular-nums">{totals.contract}h</td>
                <td className="border-l border-border px-4 py-2.5">
                  <span className={cn("text-xs font-semibold",
                    totals.total > totals.contract ? "text-destructive" :
                    totals.total >= totals.contract ? "text-green-600" : "text-muted-foreground"
                  )}>
                    {fmtHours(totals.total - totals.contract)} neto
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right border-l border-border font-bold tabular-nums">{fmtHours(totals.monthHTotal)}</td>
                <td className="border-l border-border px-4 py-2.5">
                  <span className={cn("text-xs font-semibold",
                    totals.monthHTotal > totals.contract ? "text-destructive" :
                    totals.monthHTotal >= totals.contract ? "text-green-600" : "text-muted-foreground"
                  )}>
                    {fmtHours(totals.monthHTotal - totals.contract)} neto
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function SwapConfirmModal({ empA, empB, shiftA, shiftB, date, onConfirm, onCancel }: {
  empA: Employee; empB: Employee;
  shiftA?: Shift; shiftB?: Shift;
  date: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isBlocked = shiftA?.locked || shiftB?.locked || shiftA?.code === "ABS" || shiftB?.code === "ABS";

  function shiftLabel(s?: Shift) {
    if (!s || s.code === "OFF") return "Descanso";
    if (s.code === "ABS") return "Ausencia";
    return `${pad(s.start)} – ${pad(s.end)} · ${(s.end - s.start - s.breakMinutes / 60).toFixed(1)}h`;
  }

  function initials(name: string) {
    return name.split(" ").map(n => n[0]).slice(0, 2).join("");
  }

  const pairs = [
    { emp: empA, current: shiftA, receives: shiftB },
    { emp: empB, current: shiftB, receives: shiftA },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={onCancel}>
      <div className="bg-card rounded-card shadow-card max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 bg-indigo-50 border-b border-indigo-200 flex items-center gap-3">
          <div className="size-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="size-5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-indigo-900">Intercambiar turnos</p>
            <p className="text-xs text-indigo-700">{date}</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-indigo-100 shrink-0">
            <X className="size-4 text-indigo-600" />
          </button>
        </div>

        {isBlocked ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-destructive">No se puede intercambiar: uno de los turnos está bloqueado o es una ausencia.</p>
            <div className="flex justify-end">
              <button onClick={onCancel} className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary">Cerrar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-2">
              {pairs.map(({ emp, current, receives }) => (
                <div key={emp.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                  <div className="size-7 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                    {initials(emp.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{emp.fullName}</p>
                    <p className="text-[11px] text-muted-foreground line-through">{shiftLabel(current)}</p>
                  </div>
                  <ArrowLeftRight className="size-3.5 text-muted-foreground shrink-0" />
                  <p className="text-xs font-semibold text-indigo-700 text-right shrink-0">{shiftLabel(receives)}</p>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button onClick={onCancel} className="text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary">Cancelar</button>
              <button
                onClick={onConfirm}
                className="text-sm px-4 py-2 rounded-pill bg-indigo-600 text-white hover:bg-indigo-700 font-medium inline-flex items-center gap-2"
              >
                <ArrowLeftRight className="size-3.5" /> Confirmar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ShiftTooltip({ shift, breakdown, workHours, pos, c }: {
  shift: Shift;
  breakdown: NoveltyBreakdown | null;
  workHours: number;
  pos: { x: number; y: number };
  c: { bg: string; fg: string; label: string };
}) {
  const absInfo = parseAbsNote(shift.note);
  const isAbs = shift.code === "ABS";
  const absHours = absInfo ? absInfo.absEnd - absInfo.absStart : isAbs ? 8 : 0;
  const isPartial = absInfo && !(absInfo.absStart === 0 && absInfo.absEnd === 8);

  const breakdownRows = breakdown
    ? ([
        { code: "STD",  label: "Estándar",            val: breakdown.std },
        { code: "RN",   label: "Recargo nocturno",     val: breakdown.RN },
        { code: "RDF",  label: "Recargo dom. / fest.", val: breakdown.RDF },
        { code: "RNF",  label: "Recargo noc. dom.",    val: breakdown.RNF },
        { code: "HED",  label: "Extra diurna",         val: breakdown.HED },
        { code: "HEN",  label: "Extra nocturna",       val: breakdown.HEN },
        { code: "HEDF", label: "Extra dom. diurna",    val: breakdown.HEDF },
        { code: "HENF", label: "Extra dom. nocturna",  val: breakdown.HENF },
      ] as const).filter(r => r.val > 0)
    : [];

  return (
    <div
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 9999 }}
      className="w-64 rounded-card border border-border bg-card shadow-card pointer-events-none"
    >
      {/* Header */}
      <div className={cn("flex items-center justify-between rounded-t-[20px] px-3 py-2 border-b border-border", c.bg)}>
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-black tracking-widest uppercase", c.fg)}>{shift.code}</span>
          <span className={cn("text-xs font-semibold", c.fg)}>{c.label}</span>
        </div>
        {shift.locked && <Lock className={cn("size-3 shrink-0", c.fg)} />}
      </div>

      <div className="px-3 py-2.5 space-y-2">
        {/* ABS info */}
        {isAbs ? (
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <span className="font-medium">
                {absInfo ? (ABS_TYPE_LABELS[absInfo.type] ?? absInfo.type) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ausente</span>
              <span className="font-semibold text-red-600">
                {isPartial
                  ? `${pad(absInfo!.absStart)} – ${pad(absInfo!.absEnd)} · ${absHours}h`
                  : `Día completo · ${absHours}h`}
              </span>
            </div>
            {workHours > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trabajo adicional</span>
                <span className="font-semibold">{workHours.toFixed(1)}h</span>
              </div>
            )}
          </div>
        ) : (
          /* Regular shift time info */
          <div className="flex items-center gap-2 text-xs">
            <Clock className="size-3 text-muted-foreground shrink-0" />
            <span className="font-semibold">{pad(shift.start)} – {pad(shift.end)}</span>
            {shift.breakMinutes > 0 && (
              <span className="text-muted-foreground">· {shift.breakMinutes} min pausa</span>
            )}
          </div>
        )}

        {/* Breakdown */}
        {breakdownRows.length > 0 && (
          <div className="border-t border-border pt-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Desglose</p>
            {breakdownRows.map(r => {
              const rc = codeColor(r.code);
              const pct = breakdown!.total > 0 ? Math.round((r.val / breakdown!.total) * 100) : 0;
              return (
                <div key={r.code} className="flex items-center gap-1.5">
                  <span className={cn("rounded px-1 py-0.5 text-[9px] font-bold shrink-0 leading-none", rc.bg, rc.fg)}>
                    {r.code}
                  </span>
                  <span className="text-[11px] text-muted-foreground flex-1 truncate">{r.label}</span>
                  <span className="text-[11px] font-semibold">{fmtHours(r.val)}</span>
                  <span className="text-[9px] text-muted-foreground w-5 text-right shrink-0">{pct}%</span>
                </div>
              );
            })}
            <div className="flex justify-between items-center pt-1 border-t border-border">
              <span className="text-[11px] text-muted-foreground font-medium">Total neto</span>
              <span className="text-xs font-bold">{fmtHours(workHours)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const LEGEND_TOOLTIPS: Record<string, { title: string; desc: string; when: string }> = {
  STD:  {
    title: "Jornada Estándar",
    desc:  "Horas ordinarias diurnas dentro del límite diario configurado en el área.",
    when:  "06:00 – 21:00 · Días hábiles (lunes–sábado) · Hasta el máximo diario del área (por defecto 8 h)",
  },
  HED:  {
    title: "Hora Extra Diurna",
    desc:  "Se activa cuando la jornada supera el máximo diario en franja diurna.",
    when:  "A partir de la hora 9 (o del máx. del área) · 06:00 – 21:00 · Días hábiles",
  },
  HEN:  {
    title: "Hora Extra Nocturna",
    desc:  "Horas adicionales al estándar trabajadas en la franja nocturna.",
    when:  "A partir de la hora 9 · 21:00 – 06:00 · Días hábiles",
  },
  RN:   {
    title: "Recargo Nocturno",
    desc:  "Horas dentro del estándar (≤ máx. diario) trabajadas en horario nocturno.",
    when:  "21:00 – 06:00 · Días hábiles · Sin superar el máximo diario",
  },
  RDF:  {
    title: "Recargo Dominical / Festivo",
    desc:  "Trabajo en domingo o festivo colombiano dentro de la jornada estándar.",
    when:  "06:00 – 21:00 · Domingos y festivos · Hasta el máximo diario del área",
  },
  HEDF: {
    title: "Hora Extra Dom. Diurna",
    desc:  "Horas extras en domingo o festivo en franja diurna, superando el estándar.",
    when:  "A partir de la hora 9 · 06:00 – 21:00 · Domingos / festivos colombianos",
  },
  ABS:  {
    title: "Ausencia",
    desc:  "Inasistencia programada: vacaciones, incapacidad, licencia, permiso u otro tipo. Puede ser día completo o parcial.",
    when:  "Día completo (8 h) o franja parcial · Combinable con horas de trabajo adicionales",
  },
  OFF:  {
    title: "Día de Descanso",
    desc:  "Día libre programado. No genera ninguna novedad laboral ni se incluye en la liquidación.",
    when:  "Sin horas asignadas · No aplica en cálculo de extras ni recargos",
  },
};

function Legend() {
  const items = ["STD","HED","HEN","RN","RDF","HEDF","ABS","OFF"];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="text-[11px] font-semibold text-muted-foreground mr-1">Códigos:</span>
      {items.map(code => {
        const c = codeColor(code);
        const tip = LEGEND_TOOLTIPS[code];
        return (
          <div key={code} className="relative group">
            <div className="inline-flex items-center gap-1.5 cursor-help select-none">
              {/* Dot de color */}
              <span className={cn("size-2 rounded-full shrink-0", c.bg)} />
              {/* Código en bold + nombre en muted */}
              <span className="text-[11px] font-bold text-foreground">{code}</span>
              <span className="text-[11px] text-muted-foreground">{c.label}</span>
            </div>

            {/* Tooltip enriquecido */}
            {tip && (
              <div className={cn(
                "absolute left-0 top-[calc(100%+8px)] z-50 w-72 rounded-card border border-border bg-card shadow-card",
                "invisible opacity-0 translate-y-1",
                "group-hover:visible group-hover:opacity-100 group-hover:translate-y-0",
                "transition-all duration-200 ease-out pointer-events-none"
              )}>
                <div className={cn("flex items-center gap-2.5 rounded-t-[20px] px-3 py-2.5 border-b border-border", c.bg)}>
                  <span className={cn("text-xs font-black tracking-widest", c.fg)}>{code}</span>
                  <span className={cn("text-xs font-semibold", c.fg)}>{tip.title}</span>
                </div>
                <div className="px-3 py-2.5 space-y-2">
                  <p className="text-[11px] text-foreground leading-relaxed">{tip.desc}</p>
                  <div className="flex items-start gap-2 rounded-lg bg-secondary/60 px-2.5 py-2">
                    <Clock className="size-3 shrink-0 text-muted-foreground mt-px" />
                    <span className="text-[10px] text-muted-foreground leading-relaxed">{tip.when}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const ABS_TYPE_LABELS: Record<string, string> = {
  vacaciones: "Vacaciones", incapacidad: "Incapacidad", licencia: "Licencia",
  permiso: "Permiso", no_remunerada: "No remunerada", compensatorio: "Compensatorio",
};

const EDITOR_CODES: { code: string; label: string }[] = [
  { code: "STD",  label: "Estándar" },
  { code: "HED",  label: "Extra Diurna" },
  { code: "HEN",  label: "Extra Noct." },
  { code: "HEDF", label: "Extra Dom. D" },
  { code: "HENF", label: "Extra Dom. N" },
  { code: "RN",   label: "Rec. Noct." },
  { code: "RDF",  label: "Dom./Fest." },
  { code: "RNF",  label: "R.N. Fest." },
  { code: "ABS",  label: "Ausencia" },
  { code: "OFF",  label: "Descanso" },
];

function ShiftEditor({ employee, date, shift, onClose, onSave, onClear, onHistory }: any) {
  const { shifts, areas, absences, upsertAbsence, removeAbsence } = useWFM();
  const area = areas.find((a: any) => a.id === employee.areaId);

  const absInfo = parseAbsNote(shift?.note);
  const isAbsShift = !!absInfo || shift?.code === "ABS";

  // Existing absence record for this employee/date (for pre-filling)
  const existingAbsence = (absences as any[]).find(
    (a: any) => a.employeeId === employee.id && date >= a.startDate && date <= a.endDate,
  );

  const [code, setCode] = useState<string>(shift?.code ?? "STD");
  const [start, setStart] = useState(shift?.start ?? (isAbsShift ? 0 : 8));
  const [end, setEnd] = useState(shift?.end ?? (isAbsShift ? 0 : 16));
  const [breakMin, setBreakMin] = useState(shift?.breakMinutes ?? (isAbsShift ? 0 : 60));
  const [note, setNote] = useState(shift?.note ?? "");
  const [locked, setLocked] = useState(!!shift?.locked);
  const [showConfirm, setShowConfirm] = useState(false);
  const [absError, setAbsError] = useState<string | null>(null);
  const [confirmDeleteAbs, setConfirmDeleteAbs] = useState(false);

  // Absence config state — pre-filled from existing note or absence record
  const [absType, setAbsType] = useState<string>(
    absInfo?.type ?? existingAbsence?.type ?? "licencia",
  );
  const [absFullDay, setAbsFullDay] = useState<boolean>(
    absInfo
      ? absInfo.absStart === 0 && absInfo.absEnd === 8
      : existingAbsence?.startHour === undefined,
  );
  const [absHrStart, setAbsHrStart] = useState<number>(
    absInfo && !(absInfo.absStart === 0 && absInfo.absEnd === 8)
      ? absInfo.absStart
      : existingAbsence?.startHour ?? 8,
  );
  const [absHrEnd, setAbsHrEnd] = useState<number>(
    absInfo && !(absInfo.absStart === 0 && absInfo.absEnd === 8)
      ? absInfo.absEnd
      : existingAbsence?.endHour ?? 12,
  );

  const absHours = absInfo ? absInfo.absEnd - absInfo.absStart : (isAbsShift ? 8 : 0);
  const workHours = end > start ? Math.max(0, end - start - breakMin / 60) : 0;
  const absIsFullDay = !absInfo || (absInfo.absStart === 0 && absInfo.absEnd === 8);

  // Existing hours for this employee in the same week/month, excluding the date being edited
  const hoursCtx = useMemo(() => {
    const dateObj = new Date(date + "T00:00:00");
    const wStart = startOfWeek(dateObj);
    const wEnd = addDays(wStart, 7);
    const month = date.slice(0, 7);

    const others = shifts.filter(
      (s: any) => s.employeeId === employee.id && s.date !== date && s.code !== "OFF"
    );
    const weekShifts = others.filter((s: any) => {
      const d = new Date(s.date + "T00:00:00");
      return d >= wStart && d < wEnd;
    });
    const monthShifts = others.filter((s: any) => s.date.startsWith(month));

    const calcH = (list: any[]) =>
      list.reduce((acc: number, s: any) => {
        if (s.code === "ABS" && s.start === 0 && s.end === 0) return acc;
        return acc + Math.max(0, s.end - s.start - s.breakMinutes / 60);
      }, 0);

    return { week: calcH(weekShifts), month: calcH(monthShifts) };
  }, [shifts, employee.id, date]);

  const maxDay = area?.maxHoursDay ?? 8;
  const maxWeek = area?.maxHoursWeek ?? 46;
  const maxMonth = area?.maxHoursMonth ?? 192;

  // Projected totals including this shift's work hours
  const projDay = workHours;
  const projWeek = hoursCtx.week + workHours;
  const projMonth = hoursCtx.month + workHours;

  const overDay = projDay > maxDay;
  const overWeek = projWeek > maxWeek;
  const overMonth = projMonth > maxMonth;
  const anyOvertime = code !== "OFF" && workHours > 0 && (overDay || overWeek || overMonth);

  function handleInputChange(setter: (v: number) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(Number(e.target.value));
      setShowConfirm(false);
      setAbsError(null);
    };
  }

  function handleCodeChange(newCode: string) {
    setCode(newCode);
    if (newCode === "ABS") {
      setStart(0);
      setEnd(0);
      setBreakMin(0);
      setAbsError(null);
    }
  }

  function handleSave() {
    if (code === "OFF") {
      onSave({ code: "OFF", start: 0, end: 0, breakMinutes: 0, note: "", locked });
      return;
    }

    if (code !== "ABS" && end <= start) {
      toast.error("La hora de fin debe ser posterior a la hora de inicio.");
      return;
    }

    // Validar disponibilidad del trabajador (sólo para turnos normales, no ausencias)
    if (code !== "ABS" && employee.availability) {
      const dow = new Date(date + "T00:00:00").getDay(); // 0=Dom … 6=Sáb
      const avail: { start: number; end: number } | null | undefined =
        employee.availability[dow];
      const DAY_ES = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
      const dayName = DAY_ES[dow];

      if (avail === null) {
        toast.error(
          `${employee.fullName} no está disponible los ${dayName}. Revisa la configuración de disponibilidad del trabajador.`,
          { duration: 6000 },
        );
        return;
      }
      if (avail !== undefined && (start < avail.start || end > avail.end)) {
        toast.error(
          `Horario ${pad(start)} – ${pad(end)} fuera de la disponibilidad de ${employee.fullName} los ${dayName} ` +
          `(disponible ${pad(avail.start)} – ${pad(avail.end)}). Revisa la configuración de disponibilidad.`,
          { duration: 7000 },
        );
        return;
      }
    }

    // Effective absence range: use form state when code=ABS, else use existing note
    const vFullDay   = code === "ABS" ? absFullDay   : absIsFullDay;
    const vAbsStart  = code === "ABS" ? absHrStart   : (absInfo?.absStart ?? 0);
    const vAbsEnd    = code === "ABS" ? absHrEnd     : (absInfo?.absEnd   ?? 8);

    // Validate: work hours must not overlap with the absence time range
    if ((code === "ABS" || isAbsShift) && (start !== 0 || end !== 0)) {
      if (vFullDay) {
        setAbsError("Ausencia de día completo: no es posible programar horas de trabajo para este día.");
        return;
      }
      const overlap = start < vAbsEnd && end > vAbsStart;
      if (overlap) {
        setAbsError(
          `El horario ${pad(start)}:00–${pad(end)}:00 se superpone con la ausencia registrada ${pad(vAbsStart)}:00–${pad(vAbsEnd)}:00.`
        );
        return;
      }
    }
    setAbsError(null);

    // Validate against area's holiday schedule when date is a holiday
    if (code !== "OFF" && code !== "ABS" && isSundayOrHoliday(date) && area?.holidaySchedule?.active) {
      const hs = area.holidaySchedule;
      if (start < hs.start || end > hs.end) {
        toast.error(
          `Fuera del horario festivo del área "${area.name}" (${pad(hs.start)}:00 – ${pad(hs.end)}:00). ` +
          `Ajusta el horario del turno para este festivo.`,
          { duration: 7000 },
        );
        return;
      }
    }

    // Block when area doesn't allow overtime or Sunday/holiday work
    if (!area?.allowOvertime && code !== "OFF" && code !== "ABS") {
      if (isSundayOrHoliday(date)) {
        toast.error(
          `El área "${area?.name}" no permite trabajo dominical ni festivo. Revisa la configuración del área.`,
          { duration: 6000 },
        );
        return;
      }
      if (anyOvertime) {
        toast.error(
          `El área "${area?.name}" no permite horas extras. Ajusta el turno para no superar los límites del área.`,
          { duration: 6000 },
        );
        return;
      }
    }

    if (anyOvertime && !showConfirm) { setShowConfirm(true); return; }

    if (code === "ABS") {
      // Build note and upsert absence record
      const absNote = absFullDay
        ? `abs:${absType}`
        : `abs:${absType}:${absHrStart}:${absHrEnd}`;
      (upsertAbsence as any)({
        id:         existingAbsence?.id ?? `a-sched-${employee.id}-${date.replace(/-/g, "")}`,
        employeeId: employee.id,
        type:       absType,
        startDate:  date,
        endDate:    date,
        ...(absFullDay ? {} : { startHour: absHrStart, endHour: absHrEnd }),
        reason:     existingAbsence?.reason ?? "",
        status:     existingAbsence?.status ?? "pendiente",
      });
      const saveStart = absFullDay ? 0 : start;
      const saveEnd   = absFullDay ? 0 : end;
      const saveBreak = absFullDay ? 0 : breakMin;
      onSave({ code: "ABS", start: saveStart, end: saveEnd, breakMinutes: saveBreak, note: absNote, locked });
      return;
    }

    const saveNote = isAbsShift ? shift?.note : note;
    onSave({ code, start, end, breakMinutes: breakMin, note: saveNote, locked });
  }

  // Disponibilidad del empleado para el día siendo editado
  const _dow = new Date(date + "T00:00:00").getDay(); // 0=Dom…6=Sáb
  const _availSlot: { start: number; end: number } | null | undefined =
    employee.availability?.[_dow];
  const _availDayName =
    ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"][_dow];
  const availWarning: "none" | "day" | "hours" = (() => {
    if (!employee.availability || code === "ABS" || code === "OFF") return "none";
    if (_availSlot === null) return "day";
    if (_availSlot !== undefined && (start < _availSlot.start || end > _availSlot.end))
      return "hours";
    return "none";
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-card rounded-card shadow-card max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between">
          <div>
            <h3 className="font-semibold">{employee.fullName}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{date} · {employee.position}{area ? ` · ${area.name}` : ""}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary"><X className="size-4" /></button>
        </div>

        {/* Code picker */}
        <div className="px-5 py-3 border-b border-border bg-secondary/20">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tipo de turno</p>
          <div className="grid grid-cols-5 gap-1.5">
            {EDITOR_CODES.map(({ code: c, label }) => {
              const cc = cellBg(c);
              const isSelected = code === c;
              return (
                <button
                  key={c}
                  onClick={() => handleCodeChange(c)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-center transition-all",
                    cc[0],
                    isSelected ? "ring-2 ring-primary ring-offset-1 opacity-100" : "opacity-60 hover:opacity-90"
                  )}
                  style={isSelected ? { border: `1px solid ${cc[2]}` } : { border: "1px solid transparent" }}
                >
                  <span className={cn("text-[10px] font-black tracking-wide leading-none", cc[1])}>{c}</span>
                  <span className="text-[9px] text-muted-foreground leading-tight mt-0.5 truncate w-full text-center">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {showConfirm ? (
          <OvertimeConfirm
            employee={employee}
            area={area}
            overDay={overDay} projDay={projDay} maxDay={maxDay}
            overWeek={overWeek} projWeek={projWeek} maxWeek={maxWeek}
            overMonth={overMonth} projMonth={projMonth} maxMonth={maxMonth}
            onBack={() => setShowConfirm(false)}
            onConfirm={() => onSave({ code, start, end, breakMinutes: breakMin, note: isAbsShift ? shift?.note : note, locked })}
          />
        ) : (
          <>
            <div className="overflow-y-auto flex-1">
            {/* Absence config form (editable when code=ABS) */}
            {code === "ABS" && (
              <div className="px-5 py-3.5 border-b border-red-200 bg-red-50 space-y-3">
                <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wider">Ausencia</p>

                {/* Type */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Tipo de ausencia</label>
                  <select
                    value={absType}
                    onChange={e => setAbsType(e.target.value)}
                    className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-red-300"
                  >
                    {Object.entries(ABS_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v as string}</option>
                    ))}
                  </select>
                </div>

                {/* Full day / partial toggle */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setAbsFullDay(true); setStart(0); setEnd(0); setBreakMin(0); setAbsError(null); }}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-xs font-medium border transition-colors",
                      absFullDay
                        ? "bg-red-100 border-red-300 text-red-700"
                        : "bg-card border-border text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    Día completo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAbsFullDay(false); setAbsError(null); }}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-xs font-medium border transition-colors",
                      !absFullDay
                        ? "bg-red-100 border-red-300 text-red-700"
                        : "bg-card border-border text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    Parcial (por horas)
                  </button>
                </div>

                {/* Partial hour range */}
                {!absFullDay && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Desde</label>
                      <input
                        type="number" min={0} max={23} value={absHrStart}
                        onChange={e => { setAbsHrStart(Number(e.target.value)); setAbsError(null); }}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Hasta</label>
                      <input
                        type="number" min={1} max={24} value={absHrEnd}
                        onChange={e => { setAbsHrEnd(Number(e.target.value)); setAbsError(null); }}
                        className="input"
                      />
                    </div>
                  </div>
                )}

                <p className="text-xs text-red-600">
                  {absFullDay
                    ? "Día completo · 8h ausente"
                    : `${pad(absHrStart)}:00 – ${pad(absHrEnd)}:00 · ${Math.max(0, absHrEnd - absHrStart)}h ausente`}
                </p>
              </div>
            )}

            {/* Read-only absence warning when switching to a non-ABS code on an absence day */}
            {code !== "ABS" && isAbsShift && (
              <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200">
                <p className="text-xs font-semibold text-amber-700">
                  Este día tiene una ausencia registrada
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {absInfo ? (ABS_TYPE_LABELS[absInfo.type] ?? absInfo.type) : ""}
                  {absInfo && !absIsFullDay
                    ? ` · ${pad(absInfo.absStart)}:00 – ${pad(absInfo.absEnd)}:00`
                    : " · Día completo"}
                </p>
              </div>
            )}

            <div className="p-5 space-y-4">
              {(code === "ABS" || isAbsShift) && (
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  {(code === "ABS" ? absFullDay : absIsFullDay)
                    ? "Horas extras sobre la ausencia"
                    : "Horas de trabajo adicionales"}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Hora inicio">
                  <input type="number" min={0} max={23} value={start} onChange={handleInputChange(setStart)} className="input" />
                </Field>
                <Field label="Hora fin">
                  <input type="number" min={0} max={24} value={end} onChange={handleInputChange(setEnd)} className="input" />
                </Field>
              </div>

              {/* Advertencia de disponibilidad — se actualiza en tiempo real */}
              {availWarning !== "none" && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-500" />
                  <span>
                    {availWarning === "day"
                      ? `${employee.fullName} no está disponible los ${_availDayName}. Revisa la configuración de disponibilidad del trabajador.`
                      : `Horario ${pad(start)} – ${pad(end)} está fuera de la disponibilidad de ${employee.fullName} los ${_availDayName} (${pad(_availSlot!.start)} – ${pad(_availSlot!.end)}). Revisa la configuración de disponibilidad.`
                    }
                  </span>
                </div>
              )}

              {/* Bloqueo: área sin horas extras — trabajo dominical/festivo */}
              {!area?.allowOvertime && code !== "OFF" && code !== "ABS" && isSundayOrHoliday(date) && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-800">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-red-500" />
                  <span>
                    El área <strong>{area?.name}</strong> no permite trabajo dominical ni festivo.
                    No es posible guardar este turno hasta que se habilite la opción en la configuración del área.
                  </span>
                </div>
              )}

              {/* Info: horario especial para festivos */}
              {area?.holidaySchedule?.active && code !== "OFF" && code !== "ABS" && isSundayOrHoliday(date) && (
                <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs border ${
                  (start < area.holidaySchedule.start || end > area.holidaySchedule.end)
                    ? "bg-red-50 border-red-200 text-red-800"
                    : "bg-blue-50 border-blue-200 text-blue-800"
                }`}>
                  <AlertTriangle className={`size-3.5 shrink-0 mt-0.5 ${
                    (start < area.holidaySchedule.start || end > area.holidaySchedule.end)
                      ? "text-red-500" : "text-blue-500"
                  }`} />
                  <span>
                    Día festivo · horario del área: <strong>{pad(area.holidaySchedule.start)}:00 – {pad(area.holidaySchedule.end)}:00</strong>.
                    {(start < area.holidaySchedule.start || end > area.holidaySchedule.end) && (
                      <> El turno configurado queda fuera de este rango y no podrá guardarse.</>
                    )}
                  </span>
                </div>
              )}

              <Field label="Break (min)">
                <input type="number" min={0} max={180} value={breakMin} onChange={handleInputChange(setBreakMin)} className="input" />
              </Field>
              {!isAbsShift && (anyOvertime || note) && (
                <Field label={anyOvertime ? "Justificación de horas extras" : "Justificación"}>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="input"
                    placeholder={anyOvertime ? "Motivo o aprobación previa..." : "Opcional"}
                    autoFocus={anyOvertime && !note}
                  />
                </Field>
              )}

              {/* Absence overlap error */}
              {absError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                  <span>{absError}</span>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
                Bloquear (no reasignar al regenerar)
              </label>

              {/* Summary panel */}
              {(() => {
                const effAbsHours = code === "ABS"
                  ? (absFullDay ? 8 : Math.max(0, absHrEnd - absHrStart))
                  : absHours;
                const effTotal = effAbsHours + workHours;
                const effExtra = Math.max(0, effTotal - 8);
                const showAbs  = code === "ABS" || isAbsShift;
                return (
                  <div className="rounded-xl bg-secondary/60 p-3 text-xs space-y-1">
                    {showAbs && (
                      <div className="flex justify-between">
                        <span>Horas ausente</span>
                        <strong className="text-red-600">{effAbsHours}h</strong>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Horas trabajo</span>
                      <strong>{workHours > 0 ? `${workHours.toFixed(1)}h` : "—"}</strong>
                    </div>
                    {showAbs && (
                      <div className="flex justify-between border-t border-border pt-1 font-medium">
                        <span>Total jornada</span>
                        <strong>
                          {effTotal.toFixed(1)}h
                          {effExtra > 0 && <span className="text-amber-600 ml-1">({effExtra.toFixed(1)}h extras)</span>}
                        </strong>
                      </div>
                    )}
                    {!showAbs && (
                      <div className="flex justify-between">
                        <span>Horas netas</span>
                        <strong>{workHours.toFixed(1)}h</strong>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Live hours-limit progress — shown whenever there are work hours and an area */}
              {area && workHours > 0 && (
                <HoursProgress
                  projDay={projDay} maxDay={maxDay}
                  projWeek={projWeek} maxWeek={maxWeek}
                  projMonth={projMonth} maxMonth={maxMonth}
                  anyOvertime={anyOvertime}
                  allowOvertime={area.allowOvertime}
                />
              )}
            </div>
            </div>{/* end scrollable area */}

            <div className="p-4 border-t border-border flex justify-between items-center shrink-0">
              <div className="flex items-center">
                {/* Delete absence — shown only when an absence record exists */}
                {code === "ABS" && existingAbsence ? (
                  confirmDeleteAbs ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 font-medium">¿Eliminar ausencia?</span>
                      <button
                        onClick={() => {
                          (removeAbsence as any)(existingAbsence.id);
                          onClear();
                        }}
                        className="text-xs px-2.5 py-1 rounded-pill bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        Sí, eliminar
                      </button>
                      <button
                        onClick={() => setConfirmDeleteAbs(false)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteAbs(true)}
                      className="text-sm text-red-500 hover:text-red-700 inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="size-3.5" /> Eliminar ausencia
                    </button>
                  )
                ) : (
                  <button onClick={onClear} className="text-sm text-muted-foreground hover:text-primary">Limpiar turno</button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onHistory}
                  className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 px-2 py-1.5"
                  title="Ver historial de cambios"
                >
                  <History className="size-3.5" /> Historial
                </button>
                <button onClick={onClose} className="text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary">Cancelar</button>
                <button
                  onClick={handleSave}
                  className={cn(
                    "text-sm px-4 py-2 rounded-pill inline-flex items-center gap-2 font-medium",
                    anyOvertime && code !== "OFF"
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : "bg-primary text-primary-foreground hover:opacity-90"
                  )}
                >
                  {code === "OFF"
                    ? <><Unlock className="size-3"/> Guardar descanso</>
                    : anyOvertime
                    ? <><Zap className="size-3.5" /> Guardar con extras →</>
                    : <>{locked ? <Lock className="size-3"/> : <Unlock className="size-3"/>} Guardar</>
                  }
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <style>{`.input{width:100%;border:1px solid var(--color-input);border-radius:999px;padding:.5rem .75rem;font-size:.875rem;background:var(--color-card)}`}</style>
    </div>
  );
}

// ── Hours progress bars (live feedback while editing) ─────────────────────────
function HoursProgress({ projDay, maxDay, projWeek, maxWeek, projMonth, maxMonth, anyOvertime, allowOvertime }: {
  projDay: number; maxDay: number;
  projWeek: number; maxWeek: number;
  projMonth: number; maxMonth: number;
  anyOvertime: boolean; allowOvertime: boolean;
}) {
  const bars = [
    { label: "Día", proj: projDay, max: maxDay },
    { label: "Semana", proj: projWeek, max: maxWeek },
    { label: "Mes", proj: projMonth, max: maxMonth },
  ];

  const blockedOvertime = anyOvertime && !allowOvertime;

  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-3 transition-colors",
      blockedOvertime ? "bg-red-50 border-red-200" : anyOvertime ? "bg-amber-50 border-amber-200" : "bg-secondary/40 border-border"
    )}>
      {/* Section title */}
      <div className="flex items-center gap-2">
        {blockedOvertime ? (
          <><AlertTriangle className="size-3.5 text-red-600 shrink-0" />
          <span className="text-xs font-semibold text-red-700">Horas extras no permitidas en esta área</span></>
        ) : anyOvertime ? (
          <><Zap className="size-3.5 text-amber-600 shrink-0" />
          <span className="text-xs font-semibold text-amber-700">Límite alcanzado · horas adicionales = extras</span></>
        ) : (
          <><Clock className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-muted-foreground">Horas acumuladas del período</span></>
        )}
      </div>

      {/* Progress bars */}
      {bars.map(({ label, proj, max }) => {
        const pct = Math.min(100, (proj / max) * 100);
        const over = proj > max;
        const nearLimit = !over && pct >= 80;
        const extraH = Math.max(0, proj - max);
        return (
          <div key={label} className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className={cn("font-medium", over ? (allowOvertime ? "text-amber-700" : "text-red-700") : "text-foreground")}>{label}</span>
              <span className={cn(over ? (allowOvertime ? "text-amber-700 font-semibold" : "text-red-700 font-semibold") : "text-muted-foreground")}>
                {proj.toFixed(1)}h / {max}h
                {over && (
                  <span className={cn(
                    "ml-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    allowOvertime ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                  )}>
                    +{extraH.toFixed(1)}h extras
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 rounded-full bg-border overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  over ? (allowOvertime ? "bg-amber-500" : "bg-red-500") : nearLimit ? "bg-yellow-400" : "bg-primary"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}

      {/* Context note */}
      {anyOvertime && (
        <p className={cn("text-[11px] leading-relaxed", !allowOvertime ? "text-red-600 font-medium" : "text-amber-600")}>
          {allowOvertime
            ? "Las horas que superen el estándar se clasificarán como horas extras (HED/HEN)."
            : "⚠️ Esta área no permite horas extras. Reduce las horas del turno para poder guardar."}
        </p>
      )}
    </div>
  );
}

// ── Overtime confirmation screen (replaces editor content on save attempt) ────
function OvertimeConfirm({ employee, area, overDay, projDay, maxDay, overWeek, projWeek, maxWeek, overMonth, projMonth, maxMonth, onBack, onConfirm }: any) {
  const exceeded = [
    overDay  && { label: "Día",    proj: projDay,   max: maxDay,   extra: projDay   - maxDay },
    overWeek && { label: "Semana", proj: projWeek,  max: maxWeek,  extra: projWeek  - maxWeek },
    overMonth&& { label: "Mes",    proj: projMonth, max: maxMonth, extra: projMonth - maxMonth },
  ].filter(Boolean) as { label: string; proj: number; max: number; extra: number }[];

  return (
    <>
      <div className="overflow-y-auto flex-1">
      {/* Alert header */}
      <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
        <div className="size-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <Zap className="size-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-amber-800">Horas extras detectadas</p>
          <p className="text-xs text-amber-700">Este turno supera los límites estándar del área {area?.name ?? ""}</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-sm text-foreground">
          <strong>{employee.fullName}</strong> ya cumple con las horas estándar en:
        </p>

        {/* Exceeded limits */}
        <div className="space-y-2">
          {exceeded.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
              <div className="size-2 rounded-full bg-amber-500 shrink-0" />
              <div className="flex-1 text-xs">
                <span className="font-semibold text-foreground">{item.label}:</span>{" "}
                <span className="text-muted-foreground">{item.proj.toFixed(1)}h programadas / {item.max}h estándar</span>
              </div>
              <span className="text-xs font-bold text-amber-700 shrink-0">+{item.extra.toFixed(1)}h extras</span>
            </div>
          ))}
        </div>

        {/* Explanation */}
        <div className="rounded-xl bg-secondary/60 border border-border px-4 py-3 text-sm leading-relaxed">
          Al confirmar, las horas que superen el estándar se registrarán como{" "}
          <strong className="text-amber-700">horas extras</strong>
          {area?.allowOvertime === false && (
            <span className="block mt-1 text-xs text-red-600 font-medium">
              ⚠️ Esta área no tiene habilitadas las horas extras. Revisa la configuración del área antes de continuar.
            </span>
          )}
        </div>
      </div>

      </div>{/* end scrollable area */}

      {/* Actions */}
      <div className="p-4 border-t border-border flex justify-between items-center gap-2 shrink-0">
        <button
          onClick={onBack}
          className="text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary inline-flex items-center gap-1.5"
        >
          ← Volver a editar
        </button>
        {area?.allowOvertime !== false ? (
          <button
            onClick={onConfirm}
            className="text-sm px-4 py-2 rounded-pill bg-amber-500 text-white hover:bg-amber-600 font-medium inline-flex items-center gap-2"
          >
            <Zap className="size-3.5" /> Confirmar · guardar con extras
          </button>
        ) : (
          <button
            disabled
            className="text-sm px-4 py-2 rounded-pill bg-red-100 text-red-400 font-medium inline-flex items-center gap-2 cursor-not-allowed"
          >
            No permitido · horas extras desactivadas
          </button>
        )}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function EquityPanel({ data }: {
  data: {
    rows: Array<{ employee: Employee; area: Area | undefined; sundays: number; holidays: number; total: number }>;
    avg: number;
  };
}) {
  if (data.rows.length === 0) return null;

  const sorted = [...data.rows].sort((a, b) => b.total - a.total);
  const max = sorted[0]?.total ?? 0;

  function badge(total: number, avg: number) {
    const diff = total - avg;
    if (diff >= 2) return { label: `+${Math.round(diff)} sobre media`, cls: "bg-red-100 text-red-700 border-red-200" };
    if (diff <= -2) return { label: `${Math.round(diff)} bajo media`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
    return null;
  }

  return (
    <div className="rounded-card bg-card overflow-hidden shadow-card">
      <div className="px-4 py-3 border-b border-border bg-secondary/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Equidad Dom/Festivos</span>
          <span className="text-xs text-muted-foreground">(total acumulado)</span>
        </div>
        <span className="text-xs text-muted-foreground">Media: {data.avg.toFixed(1)} turnos</span>
      </div>
      <div className="divide-y divide-border">
        {sorted.map(({ employee, area, sundays, holidays, total }) => {
          const pct = max > 0 ? (total / max) * 100 : 0;
          const b = badge(total, data.avg);
          return (
            <div key={employee.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="size-7 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                {employee.fullName.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
              </div>
              <div className="min-w-0 w-44 shrink-0">
                <p className="text-sm font-medium truncate">{employee.fullName}</p>
                <p className="text-[11px] text-muted-foreground truncate">{area?.name}</p>
              </div>
              <div className="flex-1 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden min-w-20">
                  <div
                    className={cn("h-full rounded-full transition-all", b ? (total - data.avg >= 2 ? "bg-red-400" : "bg-amber-300") : "bg-primary/60")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
                  <span className="text-muted-foreground" title="Domingos">Dom <strong className="text-foreground">{sundays}</strong></span>
                  <span className="text-muted-foreground" title="Festivos">Fest <strong className="text-foreground">{holidays}</strong></span>
                  <span className="font-bold w-6 text-right">{total}</span>
                </div>
              </div>
              {b && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0", b.cls)}>
                  {b.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CODE_LABELS: Record<string, string> = {
  STD: "Estándar", HED: "H. Extra Diurna", HEN: "H. Extra Nocturna",
  HEDF: "H. Extra Dom. Diurna", HENF: "H. Extra Dom. Noct.",
  RN: "Recargo Nocturno", RDF: "Recargo Dom./Festivo", RNF: "Recargo Noct. Festivo",
  OFF: "Descanso", ABS: "Ausencia",
};

function ShiftHistoryModal({ employeeId, date, employeeName, onClose }: {
  employeeId: string;
  date: string;
  employeeName: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ShiftHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchShiftHistory(employeeId, date)
      .then(setRows)
      .catch(e => setErr(e.message ?? "Error al cargar historial"))
      .finally(() => setLoading(false));
  }, [employeeId, date]);

  function fmtTs(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-card rounded-card shadow-card w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <History className="size-4 text-muted-foreground" /> Historial de cambios
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{employeeName} · {date}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary"><X className="size-4" /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5">
          {loading && (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando historial…</p>
          )}
          {err && (
            <p className="text-sm text-destructive text-center py-8">{err}</p>
          )}
          {!loading && !err && rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay historial de cambios para este turno.
            </p>
          )}
          {!loading && !err && rows.length > 0 && (
            <ol className="relative border-l border-border space-y-5 ml-2">
              {rows.map((r, i) => (
                <li key={r.id} className="ml-5">
                  <span className={cn(
                    "absolute -left-2 flex items-center justify-center size-4 rounded-full ring-4 ring-card",
                    i === 0 ? "bg-primary" : "bg-secondary border border-border"
                  )} />
                  <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">
                        {r.changedByName ?? r.changedBy?.slice(0, 8) ?? "Sistema"}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{fmtTs(r.changedAt)}</span>
                    </div>
                    <div className="text-xs text-foreground">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold",
                          codeColor(r.code).bg, codeColor(r.code).fg
                        )}>{r.code}</span>
                        {CODE_LABELS[r.code] ?? r.code}
                      </span>
                      {" · "}
                      {r.startHour.toString().padStart(2,"0")}:00 – {r.endHour.toString().padStart(2,"0")}:00
                      {" · "}{r.breakMinutes}min break
                      {r.locked && <span className="ml-2 inline-flex items-center gap-0.5 text-muted-foreground"><Lock className="size-3" /> Bloqueado</span>}
                    </div>
                    {r.note && (
                      <p className="text-[11px] text-muted-foreground italic truncate">{r.note}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end shrink-0">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
