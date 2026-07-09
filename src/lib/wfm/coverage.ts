import type { Area, Employee, Shift, Absence } from "./types";
import { toISO, addDays, startOfWeek } from "./date";
import { detectCode, isSundayOrHoliday, getShiftWorkHours, computePartialAbsWorkHours } from "./calc";

interface ShiftSlot {
  date: string;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  required: number;
  preferred: number;
}

/**
 * Genera slots de turnos basados en requisitos de cobertura
 */
export function generateShiftSlots(
  weekStart: Date,
  area: Area
): ShiftSlot[] {
  const slots: ShiftSlot[] = [];
  
  for (let d = 0; d < 7; d++) {
    const date = toISO(addDays(weekStart, d));
    const dow = d % 7;
    
    // Buscar requisitos de cobertura para este día
    const dayReqs = area.coverageRequirements.filter(r => r.dayOfWeek === dow);
    
    dayReqs.forEach(req => {
      slots.push({
        date,
        dayOfWeek: dow,
        startHour: req.startHour,
        endHour: req.endHour,
        required: req.minWorkers,
        preferred: req.preferredWorkers ?? req.minWorkers,
      });
    });
  }
  
  return slots;
}

/**
 * Valida que la cobertura cumpla con los requisitos mínimos
 */
export function validateCoverage(
  shifts: Shift[],
  slots: ShiftSlot[]
): { valid: boolean; gaps: ShiftSlot[] } {
  const gaps: ShiftSlot[] = [];
  
  for (const slot of slots) {
    const coverage = shifts.filter(s => {
      if (s.date !== slot.date) return false;
      const worked = getShiftWorkHours(s);
      return worked != null && worked.start <= slot.startHour && worked.end >= slot.endHour;
    }).length;

    if (coverage < slot.required) {
      gaps.push(slot);
    }
  }
  
  return { valid: gaps.length === 0, gaps };
}

// ── Rotation-based scheduling (new core) ──────────────────────────────────────

export interface BaseSlot {
  dayOfWeek: number;  // 0=Sun..6=Sat
  start: number;
  end: number;
  breakMinutes: number;
  employeeId: string;
}

/** ISO date of the Monday that starts the first week of the month containing `date`. */
export function firstWeekMondayOfMonth(date: Date): string {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  return toISO(startOfWeek(firstOfMonth));
}

/** Extract the base rotation pattern from locked working shifts in a given week. */
export function extractBasePattern(shifts: Shift[], weekMondayISO: string): BaseSlot[] {
  const ws = new Date(weekMondayISO + "T00:00:00");
  const weekDates = new Set(Array.from({ length: 7 }, (_, i) => toISO(addDays(ws, i))));
  return shifts
    .filter(s => weekDates.has(s.date) && s.locked && s.code !== "OFF" && s.code !== "ABS" && s.end > s.start)
    .map(s => ({
      dayOfWeek: new Date(s.date + "T00:00:00").getDay(),
      start: s.start,
      end: s.end,
      breakMinutes: s.breakMinutes,
      employeeId: s.employeeId,
    }));
}

/**
 * Generates the anchor (first) week of the month.
 *
 * If the area has coverageRequirements, identifies the distinct shift types
 * (unique start/end combinations) and assigns employees proportionally:
 * emp[0] → type[0], emp[1] → type[1], emp[2] → type[0], ... — this way
 * the weekly rotation will move each employee through every shift type.
 *
 * Without coverageRequirements, all employees work standard hours.
 * All resulting shifts are marked locked=true.
 */
export function generateAnchorWeek(
  weekMondayISO: string,
  area: Area,
  sortedEmployees: Employee[],
  absences: Absence[],
  existingShifts: Shift[]
): Shift[] {
  const ws = new Date(weekMondayISO + "T00:00:00");
  const result: Shift[] = [];

  function makeOff(emp: Employee, date: string): Shift {
    return { id: `${emp.id}-${date}`, employeeId: emp.id, date, start: 0, end: 0, breakMinutes: 0, code: "OFF", locked: true };
  }
  function makeAbs(emp: Employee, date: string, abs: Absence, workHours?: { start: number; end: number } | null): Shift {
    const partial = abs.startHour !== undefined && abs.endHour !== undefined;
    return {
      id: `${emp.id}-${date}`, employeeId: emp.id, date,
      start: workHours?.start ?? 0, end: workHours?.end ?? 0, breakMinutes: workHours ? 60 : 0, code: "ABS", locked: true,
      note: partial ? `abs:${abs.type}:${abs.startHour}:${abs.endHour}` : `abs:${abs.type}`,
    };
  }

  // Build sorted unique shift types from coverage requirements
  const shiftTypes: { start: number; end: number }[] = [];
  if (area.enableCoverageMode && area.coverageRequirements.length > 0) {
    const seen = new Set<string>();
    for (const r of area.coverageRequirements) {
      const key = `${r.startHour}-${r.endHour}`;
      if (!seen.has(key)) { seen.add(key); shiftTypes.push({ start: r.startHour, end: r.endHour }); }
    }
    shiftTypes.sort((a, b) => a.start - b.start);
  }

  sortedEmployees.forEach((emp, empIdx) => {
    // Round-robin assignment: each employee gets one shift type for the whole week
    const shiftType = shiftTypes.length > 0
      ? shiftTypes[empIdx % shiftTypes.length]
      : { start: area.startHour, end: Math.min(area.startHour + area.maxHoursDay + 1, area.endHour) };

    for (let d = 0; d < 7; d++) {
      const date = toISO(addDays(ws, d));
      const dow = new Date(date + "T00:00:00").getDay();

      // Preserve existing locked shift
      const existing = existingShifts.find(s => s.employeeId === emp.id && s.date === date && s.locked);
      if (existing) { result.push(existing); continue; }

      if (!area.workingDays.includes(dow) || (dow === 0 && !area.allowSunday)) {
        result.push(makeOff(emp, date)); continue;
      }

      // Coverage mode: only create shift if this day has a requirement for this type
      if (shiftTypes.length > 0) {
        const hasReq = area.coverageRequirements.some(
          r => r.dayOfWeek === dow && r.startHour === shiftType.start && r.endHour === shiftType.end
        );
        if (!hasReq) { result.push(makeOff(emp, date)); continue; }
      }

      const abs = absences.find(a => a.employeeId === emp.id && date >= a.startDate && date <= a.endDate);
      if (abs) {
        const partial = abs.startHour !== undefined && abs.endHour !== undefined;
        if (!partial) { result.push(makeAbs(emp, date, abs)); continue; }
        const workHours = computePartialAbsWorkHours(shiftType, shiftType.start, shiftType.end, abs.startHour!, abs.endHour!);
        const noOverlap = workHours != null && workHours.start === shiftType.start && workHours.end === shiftType.end;
        if (!noOverlap) { result.push(makeAbs(emp, date, abs, workHours)); continue; }
        // Absence doesn't overlap this employee's shift window this day — treat as a normal working shift.
      }

      const avail = emp.availability[dow];
      if (!avail || avail.start > shiftType.start || avail.end < shiftType.end) {
        result.push(makeOff(emp, date)); continue;
      }

      result.push({
        id: `${emp.id}-${date}`,
        employeeId: emp.id,
        date,
        start: shiftType.start,
        end: shiftType.end,
        breakMinutes: 60,
        code: detectCode(shiftType.start, shiftType.end, date, 60, area.maxHoursDay),
        locked: true,
      });
    }
  });

  return result;
}

/**
 * Counts how many Sunday/holiday working shifts each employee has accumulated
 * in the given period. Used to balance equity in rotation.
 */
export function buildEquityMap(
  shifts: Shift[],
  employeeIds: string[],
  periodStart?: string,
  periodEnd?: string,
): Map<string, number> {
  const map = new Map<string, number>(employeeIds.map(id => [id, 0]));
  for (const s of shifts) {
    if (!map.has(s.employeeId)) continue;
    if (s.code === "OFF" || s.code === "ABS") continue;
    if (periodStart && s.date < periodStart) continue;
    if (periodEnd && s.date > periodEnd) continue;
    if (isSundayOrHoliday(s.date)) {
      map.set(s.employeeId, (map.get(s.employeeId) ?? 0) + 1);
    }
  }
  return map;
}

/**
 * Builds a full week of shifts by rotating the base pattern among employees.
 *
 * weekOffset = weeks elapsed since the anchor week.
 * Each slot's original employee is shifted by weekOffset positions in sortedEmployees,
 * so every employee cycles through every shift type over N weeks.
 *
 * - Existing locked shifts are preserved as-is.
 * - Absent employees receive ABS; the slot then tries the next employee in rotation.
 * - Employees with no slot assignment receive OFF.
 */
export function buildRotatedWeek(
  weekMondayISO: string,
  basePattern: BaseSlot[],
  sortedEmployees: Employee[],
  weekOffset: number,
  area: Area,
  absences: Absence[],
  existingShifts: Shift[],
  equityMap?: Map<string, number>,
): Shift[] {
  const ws = new Date(weekMondayISO + "T00:00:00");
  const result: Shift[] = [];
  const assignedKeys = new Set<string>();
  // Work on a mutable copy so Sunday/holiday assignments update counts within
  // the same generation pass (avoids double-assigning same employee).
  const equity = equityMap ? new Map(equityMap) : null;

  for (let d = 0; d < 7; d++) {
    const date = toISO(addDays(ws, d));
    const dow = new Date(date + "T00:00:00").getDay();
    const daySlots = basePattern.filter(s => s.dayOfWeek === dow);
    const isSunHol = isSundayOrHoliday(date);

    for (const slot of daySlots) {
      // ── Equity-aware assignment for Sunday / holiday ───────────────────────
      if (isSunHol && equity) {
        // Build ordered candidate list: fewest Sunday/holiday shifts first,
        // falling back to cyclic position as tiebreaker.
        const originalIdx = sortedEmployees.findIndex(e => e.id === slot.employeeId);
        const candidates = sortedEmployees
          .map((emp, idx) => ({ emp, idx }))
          .filter(({ emp }) => {
            const key = `${emp.id}|${date}`;
            if (assignedKeys.has(key)) return false;
            const abs = absences.find(a => a.employeeId === emp.id && date >= a.startDate && date <= a.endDate);
            if (abs) {
              const partial = abs.startHour !== undefined && abs.endHour !== undefined;
              if (!partial) return false;
              const workHours = computePartialAbsWorkHours({ start: slot.start, end: slot.end }, slot.start, slot.end, abs.startHour!, abs.endHour!);
              const noOverlap = workHours != null && workHours.start === slot.start && workHours.end === slot.end;
              if (!noOverlap) return false;
              // Absence doesn't overlap this slot's hours — employee remains a valid candidate.
            }
            const avail = emp.availability?.[dow];
            if (avail && (avail.start > slot.start || avail.end < slot.end)) return false;
            return true;
          })
          .sort((a, b) => {
            const diff = (equity.get(a.emp.id) ?? 0) - (equity.get(b.emp.id) ?? 0);
            if (diff !== 0) return diff;
            // Tiebreak: respect cyclic rotation order from this slot's original position
            const aRot = (a.idx - originalIdx + sortedEmployees.length) % sortedEmployees.length;
            const bRot = (b.idx - originalIdx + sortedEmployees.length) % sortedEmployees.length;
            return aRot - bRot;
          });

        if (candidates.length > 0) {
          const { emp } = candidates[0];
          const key = `${emp.id}|${date}`;
          // Check for existing locked shift first
          const locked = existingShifts.find(s => s.employeeId === emp.id && s.date === date && s.locked);
          assignedKeys.add(key);
          if (locked) {
            result.push(locked);
          } else {
            result.push({
              id: `${emp.id}-${date}`,
              employeeId: emp.id,
              date,
              start: slot.start,
              end: slot.end,
              breakMinutes: slot.breakMinutes,
              code: detectCode(slot.start, slot.end, date, slot.breakMinutes, area.maxHoursDay),
            });
            equity.set(emp.id, (equity.get(emp.id) ?? 0) + 1);
          }
        }
        continue;
      }

      // ── Standard cyclic rotation for regular days ──────────────────────────
      const originalIdx = sortedEmployees.findIndex(e => e.id === slot.employeeId);
      if (originalIdx === -1) continue;

      // Try rotated employee; fall back to next if unavailable
      for (let attempt = 0; attempt < sortedEmployees.length; attempt++) {
        const rotatedIdx = (originalIdx + weekOffset + attempt) % sortedEmployees.length;
        const emp = sortedEmployees[rotatedIdx];
        const key = `${emp.id}|${date}`;
        if (assignedKeys.has(key)) continue;

        // Preserve existing locked shift
        const locked = existingShifts.find(s => s.employeeId === emp.id && s.date === date && s.locked);
        if (locked) {
          assignedKeys.add(key);
          result.push(locked);
          break;
        }

        // Absent employee → ABS, try the next employee in rotation for this slot
        // (unless the absence doesn't actually overlap this slot's hours, in which case the employee stays available)
        const abs = absences.find(a => a.employeeId === emp.id && date >= a.startDate && date <= a.endDate);
        if (abs) {
          const partial = abs.startHour !== undefined && abs.endHour !== undefined;
          const workHours = partial
            ? computePartialAbsWorkHours({ start: slot.start, end: slot.end }, slot.start, slot.end, abs.startHour!, abs.endHour!)
            : null;
          const noOverlap = partial && workHours != null && workHours.start === slot.start && workHours.end === slot.end;
          if (!noOverlap) {
            assignedKeys.add(key);
            result.push({
              id: `${emp.id}-${date}`, employeeId: emp.id, date,
              start: workHours?.start ?? 0, end: workHours?.end ?? 0, breakMinutes: workHours ? slot.breakMinutes : 0, code: "ABS",
              note: partial ? `abs:${abs.type}:${abs.startHour}:${abs.endHour}` : `abs:${abs.type}`,
            });
            continue;
          }
          // Absence doesn't overlap this slot's hours — employee remains available for it.
        }

        const avail = emp.availability?.[dow];
        if (avail && (avail.start > slot.start || avail.end < slot.end)) continue;

        assignedKeys.add(key);
        result.push({
          id: `${emp.id}-${date}`,
          employeeId: emp.id,
          date,
          start: slot.start,
          end: slot.end,
          breakMinutes: slot.breakMinutes,
          code: detectCode(slot.start, slot.end, date, slot.breakMinutes, area.maxHoursDay),
        });
        break;
      }
    }

    // Every employee not assigned a slot today → OFF
    for (const emp of sortedEmployees) {
      const key = `${emp.id}|${date}`;
      if (!assignedKeys.has(key)) {
        assignedKeys.add(key);
        result.push({ id: `${emp.id}-${date}`, employeeId: emp.id, date, start: 0, end: 0, breakMinutes: 0, code: "OFF" });
      }
    }
  }

  return result;
}
