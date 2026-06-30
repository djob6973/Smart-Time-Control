import { create } from "zustand";
import { toast } from "sonner";
import type { Area, Employee, Absence, Shift } from "./types";
import { detectCode, parseAbsNote, isHoliday } from "./calc";
import { seedAreas, seedEmployees, seedAbsences, seedShifts } from "./mock";
import { toISO, startOfWeek, addDays } from "./date";
import * as db from "./db";
import {
  extractBasePattern, generateAnchorWeek, buildRotatedWeek, buildEquityMap,
  generateShiftSlots, validateCoverage,
} from "./coverage";
import type { BaseSlot } from "./coverage";

function dbErr(op: string) {
  return (err: unknown) => {
    console.error(`[wfm:${op}]`, err);
    toast.error(`No se pudo guardar (${op}). Verifica la conexión e intenta de nuevo.`);
  };
}

interface WFMState {
  areas: Area[];
  employees: Employee[];
  absences: Absence[];
  shifts: Shift[];

  initialized: boolean;
  loading: boolean;
  currentUserId: string | null;

  setCurrentUser: (id: string | null) => void;
  initFromDB: () => Promise<void>;
  seedDemoData: () => Promise<void>;

  upsertEmployee: (e: Employee) => void;
  removeEmployee: (id: string) => void;
  upsertArea: (a: Area) => void;
  removeArea: (id: string) => void;
  upsertAbsence: (a: Absence) => void;
  removeAbsence: (id: string) => void;

  setShift: (employeeId: string, date: string, patch: Partial<Shift>) => void;
  clearShift: (employeeId: string, date: string) => void;
  clearWeek: (weekStartISO: string, areaId?: string) => Promise<void>;
  generateWeek: (weekStartISO: string, areaId?: string) => void;
  generateWeeks: (weekStartISO: string, areaId?: string, numWeeks?: number) => void;
  lockWeek: (weekStartISO: string, areaId?: string) => void;
  unlockWeek: (weekStartISO: string, areaId?: string) => void;
  swapShifts: (empAId: string, empBId: string, date: string) => "ok" | "locked" | "abs";
  resetAll: () => Promise<void>;
}

export const useWFM = create<WFMState>()((set, get) => ({
  areas: [],
  employees: [],
  absences: [],
  shifts: [],
  initialized: false,
  loading: false,
  currentUserId: null,

  setCurrentUser: (id) => set({ currentUserId: id }),

  // Carga datos reales desde Supabase al iniciar la app
  initFromDB: async () => {
    set({ loading: true });
    try {
      const [areas, employees, absences, shifts] = await Promise.all([
        db.fetchAreas(),
        db.fetchEmployees(),
        db.fetchAbsences(),
        db.fetchShifts(),
      ]);
      set({ areas, employees, absences, shifts, initialized: true });
    } finally {
      set({ loading: false });
    }
  },

  // Carga datos demo en Supabase (solo usar en configuración inicial)
  seedDemoData: async () => {
    set({ loading: true });
    try {
      const shifts = seedShifts();
      await db.seedAllData(seedAreas, seedEmployees, seedAbsences, shifts);
      set({
        areas: seedAreas,
        employees: seedEmployees,
        absences: seedAbsences,
        shifts,
        initialized: true,
      });
    } finally {
      set({ loading: false });
    }
  },

  // ── Employees ──────────────────────────────────────────────
  upsertEmployee: (e) => {
    set((s) => ({
      employees: s.employees.some((x) => x.id === e.id)
        ? s.employees.map((x) => (x.id === e.id ? e : x))
        : [...s.employees, e],
    }));
    db.upsertEmployee(e).catch(dbErr("trabajador"));
  },

  removeEmployee: (id) => {
    set((s) => ({ employees: s.employees.filter((e) => e.id !== id) }));
    db.removeEmployee(id).catch(dbErr("trabajador"));
  },

  // ── Areas ──────────────────────────────────────────────────
  upsertArea: (a) => {
    set((s) => ({
      areas: s.areas.some((x) => x.id === a.id)
        ? s.areas.map((x) => (x.id === a.id ? a : x))
        : [...s.areas, a],
    }));
    db.upsertArea(a).catch(dbErr("área"));
  },

  removeArea: (id) => {
    set((s) => ({ areas: s.areas.filter((a) => a.id !== id) }));
    db.removeArea(id).catch(dbErr("área"));
  },

  // ── Absences ───────────────────────────────────────────────
  upsertAbsence: (a) => {
    set((s) => ({
      absences: s.absences.some((x) => x.id === a.id)
        ? s.absences.map((x) => (x.id === a.id ? a : x))
        : [...s.absences, a],
    }));
    db.upsertAbsence(a).catch(dbErr("ausencia"));
  },

  removeAbsence: (id) => {
    set((s) => ({ absences: s.absences.filter((a) => a.id !== id) }));
    db.removeAbsence(id).catch(dbErr("ausencia"));
  },

  // ── Shifts ─────────────────────────────────────────────────
  setShift: (employeeId, date, patch) => {
    set((s) => {
      const idx = s.shifts.findIndex(
        (sh) => sh.employeeId === employeeId && sh.date === date,
      );
      const base: Shift =
        idx >= 0
          ? s.shifts[idx]
          : { id: `${employeeId}-${date}`, employeeId, date, start: 8, end: 16, breakMinutes: 60, code: "STD" };
      const merged: Shift = { ...base, ...patch };
      if (patch.start !== undefined || patch.end !== undefined) {
        // Preserve ABS code for absence shifts (detected by note OR by original code)
        if (parseAbsNote(merged.note) || base.code === "ABS") {
          merged.code = "ABS";
        } else {
          const emp = s.employees.find((e: any) => e.id === employeeId);
          const areaMaxDay = s.areas.find((a: any) => a.id === emp?.areaId)?.maxHoursDay ?? 8;
          merged.code = detectCode(merged.start, merged.end, merged.date, merged.breakMinutes, areaMaxDay);
        }
      }
      const next = [...s.shifts];
      if (idx >= 0) next[idx] = merged;
      else next.push(merged);
      db.upsertShift(merged, get().currentUserId).catch(dbErr("turno"));
      return { shifts: next };
    });
  },

  clearShift: (employeeId, date) => {
    set((s) => ({
      shifts: s.shifts.filter(
        (sh) => !(sh.employeeId === employeeId && sh.date === date),
      ),
    }));
    db.removeShift(employeeId, date).catch(dbErr("turno"));
  },

  // ── Generación automática semanal ──────────────────────────
  generateWeek: (weekStartISO, areaId) => {
    const ws = new Date(weekStartISO + "T00:00:00");
    const { employees, areas, absences, shifts } = get();
    const newShifts: Shift[] = [];

    employees.forEach((e) => {
      if (areaId && e.areaId !== areaId) return;
      const area = areas.find((a) => a.id === e.areaId);
      if (!area) return;

      let weekHours = 0;
      // Cargar turno del día anterior para continuidad entre semanas
      const prevDate = toISO(addDays(ws, -1));
      const prevShift = shifts.find((sh) => sh.employeeId === e.id && sh.date === prevDate);
      let prevShiftEnd: number | null = (prevShift && prevShift.code !== "OFF" && prevShift.code !== "ABS") ? prevShift.end : null;

      for (let d = 0; d < 7; d++) {
        const date = toISO(addDays(ws, d));
        const dow = (d + 1) % 7;

        const locked = shifts.find((sh) => sh.employeeId === e.id && sh.date === date && sh.locked);
        if (locked) {
          if (locked.code !== "OFF" && locked.code !== "ABS") {
            weekHours += Math.max(0, locked.end - locked.start - locked.breakMinutes / 60);
            prevShiftEnd = locked.end;
          } else {
            prevShiftEnd = null;
          }
          newShifts.push(locked);
          continue;
        }

        const avail = e.availability[dow];
        const abs = absences.find(
          (a) => a.employeeId === e.id && date >= a.startDate && date <= a.endDate,
        );

        if (abs) {
          prevShiftEnd = null;
          const isPartial = abs.startHour !== undefined && abs.endHour !== undefined;
          let absNote: string;
          if (isPartial && avail) {
            const absStart = abs.startHour!;
            const absEnd   = abs.endHour!;
            const shiftStart = Math.max(avail.start, area.startHour);
            const shiftEnd   = Math.min(avail.end,   area.endHour);
            // Compute the work window: portion of the shift not covered by the absence
            let workStart = 0, workEnd = 0;
            if (absStart > shiftStart && absEnd >= shiftEnd) {
              // Absence at the end — work is [shiftStart, absStart]
              workStart = shiftStart; workEnd = absStart;
            } else if (absStart <= shiftStart && absEnd < shiftEnd) {
              // Absence at the start — work is [absEnd, shiftEnd]
              workStart = absEnd; workEnd = shiftEnd;
            }
            absNote = workStart < workEnd
              ? `abs:${abs.type}:${absStart}:${absEnd}:${workStart}:${workEnd}`
              : `abs:${abs.type}:${absStart}:${absEnd}`;
          } else {
            absNote = isPartial ? `abs:${abs.type}:${abs.startHour}:${abs.endHour}` : `abs:${abs.type}`;
          }
          newShifts.push({ id: `${e.id}-${date}`, employeeId: e.id, date, start: 0, end: 0, breakMinutes: 0, code: "ABS", note: absNote });
          continue;
        }
        // Determinar si el día es festivo y si aplica horario especial
        const isHolidayDate = isHoliday(date);
        const holidaySched = area.holidaySchedule;
        const useHolidayHours = isHolidayDate && holidaySched?.active;
        const areaStart = useHolidayHours ? holidaySched.start : area.startHour;
        const areaEnd   = useHolidayHours ? holidaySched.end   : area.endHour;

        if (!avail || !area.workingDays.includes(dow) || (dow === 0 && !area.allowSunday)) {
          prevShiftEnd = null;
          newShifts.push({ id: `${e.id}-${date}`, employeeId: e.id, date, start: 0, end: 0, breakMinutes: 0, code: "OFF" });
          continue;
        }
        // Rotación sábado: 33% descansan (más equilibrado que 50%)
        const satRotation = [...e.id].reduce((s, c) => s + c.charCodeAt(0), 0) % 3;
        if (d === 5 && satRotation === 0) {
          prevShiftEnd = null;
          newShifts.push({ id: `${e.id}-${date}`, employeeId: e.id, date, start: 0, end: 0, breakMinutes: 0, code: "OFF" });
          continue;
        }

        // minRestHours: retrasar el inicio si el turno anterior terminó muy tarde
        const minStart = prevShiftEnd !== null
          ? Math.max(0, prevShiftEnd + area.minRestHours - 24)
          : 0;
        const start = Math.max(areaStart, avail.start, minStart);

        // Si el descanso mínimo empuja el inicio más allá de lo disponible, OFF este día
        if (start >= areaEnd || start >= avail.end) {
          prevShiftEnd = null;
          newShifts.push({ id: `${e.id}-${date}`, employeeId: e.id, date, start: 0, end: 0, breakMinutes: 0, code: "OFF" });
          continue;
        }

        // allowOvertime: si no se permiten extras, el tope diario es 8h estándar
        const effectiveMaxDay = area.allowOvertime ? area.maxHoursDay : Math.min(area.maxHoursDay, 8);
        let end = Math.min(start + effectiveMaxDay + 1, avail.end, areaEnd);

        // maxHoursWeek: recortar el turno si el empleado ya consumió su cuota semanal
        const projectedHours = Math.max(0, end - start - 1);
        const weekBudget = area.maxHoursWeek - weekHours;
        if (projectedHours > weekBudget) {
          end = Math.floor(start + weekBudget + 1);
        }
        if (end <= start) {
          prevShiftEnd = null;
          newShifts.push({ id: `${e.id}-${date}`, employeeId: e.id, date, start: 0, end: 0, breakMinutes: 0, code: "OFF" });
          continue;
        }

        weekHours += Math.max(0, end - start - 1);
        prevShiftEnd = end;

        newShifts.push({
          id: `${e.id}-${date}`,
          employeeId: e.id,
          date,
          start,
          end,
          breakMinutes: 60,
          code: detectCode(start, end, date, 60, area.maxHoursDay),
        });
      }
    });

    set((s) => {
      const dates = new Set(newShifts.map((x) => x.date));
      const remaining = s.shifts.filter(
        (sh) =>
          !(
            dates.has(sh.date) &&
            (!areaId || employees.find((e) => e.id === sh.employeeId)?.areaId === areaId)
          ),
      );
      return { shifts: [...remaining, ...newShifts] };
    });

    // Persiste en Supabase en lote
    db.upsertShiftsBatch(newShifts, get().currentUserId).catch(dbErr("generación"));
  },

  // ── Generación multi-semana con rotación desde semana ancla ──
  //
  // Lógica:
  //  1. La "semana ancla" es la primera semana del mes que contiene weekStartISO.
  //  2. Si la semana ancla ya tiene turnos bloqueados → se usa como patrón base.
  //  3. Si no → se genera automáticamente (distribuyendo empleados en los turnos
  //     definidos por coverageRequirements) y se bloquea.
  //  4. Las semanas siguientes rotan el patrón base cíclicamente entre empleados,
  //     de modo que cada agente pase por todos los tipos de turno.
  //  5. Los turnos bloqueados individuales nunca se sobreescriben.
  generateWeeks: (weekStartISO, areaId, numWeeks = 4) => {
    const { employees, areas, absences, shifts } = get();
    const startDate = new Date(weekStartISO + "T00:00:00");
    const allNewShifts: Shift[] = [];
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

    const relevantAreas = areas.filter(a => !areaId || a.id === areaId);

    for (const area of relevantAreas) {
      // Empleados del área ordenados de forma consistente
      const areaEmployees = employees
        .filter(e => e.areaId === area.id && e.status === "active")
        .sort((a, b) => a.id.localeCompare(b.id));

      if (areaEmployees.length === 0) continue;

      // 1. Semana ancla = última semana bloqueada ANTES de la semana objetivo.
      //    Se busca el turno bloqueado más reciente anterior a weekStartISO y se toma
      //    el lunes de esa semana. Si no hay ninguna semana bloqueada anterior,
      //    la semana actual se genera y bloquea como ancla.
      const areaShifts = shifts.filter(s => areaEmployees.some(e => e.id === s.employeeId));
      const lockedBeforeStart = areaShifts.filter(s =>
        s.date < weekStartISO &&
        s.locked && s.code !== "OFF" && s.code !== "ABS" && s.end > s.start
      );

      const anchorISO = lockedBeforeStart.length > 0
        ? toISO(startOfWeek(new Date(
            // sort DESCENDENTE → el más reciente primero
            [...lockedBeforeStart].sort((a, b) => b.date.localeCompare(a.date))[0].date + "T00:00:00"
          )))
        : weekStartISO; // sin ancla bloqueada → la semana actual se convierte en ancla

      let basePattern: BaseSlot[];

      if (lockedBeforeStart.length > 0) {
        // Ancla bloqueada encontrada → extraer patrón base directamente
        basePattern = extractBasePattern(areaShifts, anchorISO);
      } else {
        // Sin ancla → generar semana actual, bloquearla y usarla como base
        const anchorShifts = generateAnchorWeek(anchorISO, area, areaEmployees, absences, shifts);
        allNewShifts.push(...anchorShifts);
        basePattern = extractBasePattern(anchorShifts, anchorISO);
      }

      // Solo se rotan los empleados presentes en el patrón base.
      // Empleados nuevos (sin semana bloqueada) quedan fuera de la rotación
      // hasta que el administrador los programe manualmente y bloquee esa semana.
      const patternEmpIds = new Set(basePattern.map(s => s.employeeId));
      const rotationEmployees = areaEmployees.filter(e => patternEmpIds.has(e.id));

      // Mapa de equidad: acumula domingos/festivos trabajados por cada empleado
      // hasta el inicio del período a generar (no incluye las semanas futuras).
      const equityMap = buildEquityMap(
        shifts,
        rotationEmployees.map(e => e.id),
        undefined,
        weekStartISO,
      );

      // 3. Generar cada semana solicitada
      const anchorDate = new Date(anchorISO + "T00:00:00");

      for (let w = 0; w < numWeeks; w++) {
        const weekDate = addDays(startDate, w * 7);
        const weekISO = toISO(weekDate);

        if (weekISO === anchorISO) continue;

        const weekOffset = Math.round(
          (weekDate.getTime() - anchorDate.getTime()) / MS_PER_WEEK
        );

        // Excluir los shifts de la semana objetivo del existingShifts para que
        // buildRotatedWeek siempre aplique la rotación fresca (no preserve locks
        // de generaciones anteriores que quedaron bloqueadas por ser ancla vieja).
        const weekEnd = toISO(addDays(new Date(weekISO + "T00:00:00"), 6));
        const existingForRotation = [...shifts, ...allNewShifts]
          .filter(s => s.date < weekISO || s.date > weekEnd);
        const weekShifts = buildRotatedWeek(
          weekISO,
          basePattern,
          rotationEmployees,
          weekOffset,
          area,
          absences,
          existingForRotation,
          equityMap,
        );
        console.log("[generateWeeks] turnos semana", weekISO, "→",
          weekShifts.filter(s => s.code !== "OFF").map(s => `${s.employeeId.slice(-4)} ${s.date} ${s.start}-${s.end} ${s.code} locked:${!!s.locked}`));

        allNewShifts.push(...weekShifts);
      }
    }

    console.log("[generateWeeks] total allNewShifts:", allNewShifts.length,
      "| working:", allNewShifts.filter(s => s.code !== "OFF" && s.code !== "ABS").length,
      "| fechas:", [...new Set(allNewShifts.map(s => s.date))].sort());

    // ── Validación de cobertura post-generación ───────────────
    const coverageWarnings: string[] = [];
    for (const area of relevantAreas.filter(a => a.enableCoverageMode && a.coverageRequirements.length > 0)) {
      const areaEmpIds = new Set(
        employees.filter(e => e.areaId === area.id && e.status === "active").map(e => e.id)
      );
      let gapCount = 0;
      for (let w = 0; w < numWeeks; w++) {
        const weekDate = addDays(startDate, w * 7);
        const slots = generateShiftSlots(weekDate, area);
        const weekShifts = allNewShifts.filter(s => areaEmpIds.has(s.employeeId));
        const { gaps } = validateCoverage(weekShifts, slots);
        gapCount += gaps.length;
      }
      if (gapCount > 0) {
        coverageWarnings.push(`${area.name} (${gapCount} franja${gapCount !== 1 ? "s" : ""})`);
      }
    }

    set((s) => {
      const dates = new Set(allNewShifts.map(x => x.date));
      const remaining = s.shifts.filter(sh =>
        !(dates.has(sh.date) && (!areaId || employees.find(e => e.id === sh.employeeId)?.areaId === areaId))
      );
      return { shifts: [...remaining, ...allNewShifts] };
    });

    const workingCount = allNewShifts.filter(s => s.code !== "OFF" && s.code !== "ABS").length;
    db.upsertShiftsBatch(allNewShifts, get().currentUserId)
      .then(() => {
        if (coverageWarnings.length > 0) {
          toast.warning(
            `${workingCount} turnos generados. Cobertura insuficiente en: ${coverageWarnings.join(", ")}`,
            { duration: 7000 }
          );
        } else {
          toast.success(`${workingCount} turnos generados correctamente`);
        }
      })
      .catch(dbErr("generación"));
  },

  // ── Limpiar semana (solo turnos no bloqueados) ─────────────
  clearWeek: async (weekStartISO, areaId) => {
    const ws = new Date(weekStartISO + "T00:00:00");
    const { employees, shifts } = get();
    const dates = new Set(Array.from({ length: 7 }, (_, i) => toISO(addDays(ws, i))));
    const toRemove = shifts.filter(sh => {
      if (!dates.has(sh.date)) return false;
      if (sh.locked) return false;
      if (areaId && employees.find(e => e.id === sh.employeeId)?.areaId !== areaId) return false;
      return true;
    });
    if (toRemove.length === 0) return;
    const ids = new Set(toRemove.map(sh => sh.id));
    set(s => ({ shifts: s.shifts.filter(sh => !ids.has(sh.id)) }));
    await db.removeShiftsBatch(Array.from(ids));
  },

  // ── Bloqueo / desbloqueo de semana completa ────────────────
  lockWeek: (weekStartISO, areaId) => {
    const ws = new Date(weekStartISO + "T00:00:00");
    const { employees, shifts } = get();
    const dates = new Set(Array.from({ length: 7 }, (_, i) => toISO(addDays(ws, i))));
    const updated = shifts.map(sh => {
      if (!dates.has(sh.date)) return sh;
      if (areaId && employees.find(e => e.id === sh.employeeId)?.areaId !== areaId) return sh;
      return { ...sh, locked: true };
    });
    set({ shifts: updated });
    const toUpdate = updated.filter(sh =>
      dates.has(sh.date) && (!areaId || employees.find(e => e.id === sh.employeeId)?.areaId === areaId)
    );
    db.upsertShiftsBatch(toUpdate, get().currentUserId).catch(dbErr("bloqueo"));
  },

  unlockWeek: (weekStartISO, areaId) => {
    const ws = new Date(weekStartISO + "T00:00:00");
    const { employees, shifts } = get();
    const dates = new Set(Array.from({ length: 7 }, (_, i) => toISO(addDays(ws, i))));
    const updated = shifts.map(sh => {
      if (!dates.has(sh.date)) return sh;
      if (areaId && employees.find(e => e.id === sh.employeeId)?.areaId !== areaId) return sh;
      return { ...sh, locked: false };
    });
    set({ shifts: updated });
    const toUpdate = updated.filter(sh =>
      dates.has(sh.date) && (!areaId || employees.find(e => e.id === sh.employeeId)?.areaId === areaId)
    );
    db.upsertShiftsBatch(toUpdate, get().currentUserId).catch(dbErr("desbloqueo"));
  },

  // ── Intercambio de turnos entre dos empleados ─────────────
  swapShifts: (empAId, empBId, date) => {
    const { shifts, employees, areas, absences } = get();

    const shiftA = shifts.find(s => s.employeeId === empAId && s.date === date);
    const shiftB = shifts.find(s => s.employeeId === empBId && s.date === date);

    if (shiftA?.locked || shiftB?.locked) return "locked";
    if (shiftA?.code === "ABS" || shiftB?.code === "ABS") return "abs";
    const hasAbs = (eid: string) => absences.some(a => a.employeeId === eid && date >= a.startDate && date <= a.endDate);
    if (hasAbs(empAId) || hasAbs(empBId)) return "abs";

    const areaOf = (eid: string) => {
      const emp = employees.find(e => e.id === eid);
      return areas.find(a => a.id === emp?.areaId);
    };

    const build = (forEmpId: string, fromShift: Shift | undefined): Shift => {
      if (!fromShift || fromShift.code === "OFF") {
        return { id: `${forEmpId}-${date}`, employeeId: forEmpId, date, start: 0, end: 0, breakMinutes: 0, code: "OFF" };
      }
      const maxDay = areaOf(forEmpId)?.maxHoursDay ?? 8;
      return {
        id: `${forEmpId}-${date}`,
        employeeId: forEmpId,
        date,
        start: fromShift.start,
        end: fromShift.end,
        breakMinutes: fromShift.breakMinutes,
        code: detectCode(fromShift.start, fromShift.end, date, fromShift.breakMinutes, maxDay),
        note: fromShift.note,
      };
    };

    const newA = build(empAId, shiftB);
    const newB = build(empBId, shiftA);

    set(s => ({
      shifts: [
        ...s.shifts.filter(sh => !(sh.date === date && (sh.employeeId === empAId || sh.employeeId === empBId))),
        ...[newA, newB].filter(sh => sh.code !== "OFF"),
      ],
    }));

    [newA, newB].forEach(sh => {
      if (sh.code === "OFF") db.removeShift(sh.employeeId, sh.date).catch(dbErr("intercambio"));
      else db.upsertShift(sh, get().currentUserId).catch(dbErr("intercambio"));
    });

    return "ok";
  },

  // ── Reset total ────────────────────────────────────────────
  resetAll: async () => {
    set({ loading: true });
    try {
      await db.clearAllData();
      set({ areas: [], employees: [], absences: [], shifts: [], initialized: true });
    } finally {
      set({ loading: false });
    }
  },
}));

export function currentWeekISO(): string {
  return toISO(startOfWeek(new Date()));
}
