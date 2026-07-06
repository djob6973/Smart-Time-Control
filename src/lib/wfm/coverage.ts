import type { Area, Employee, Shift, CoverageRequirement, Absence } from "./types";
import { toISO, addDays, startOfWeek } from "./date";
import { detectCode, isSundayOrHoliday } from "./calc";

interface ShiftSlot {
  date: string;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  required: number;
  preferred: number;
}

interface EmployeeScore {
  employee: Employee;
  score: number;
  weekHours: number;
  monthHours: number;
  prevShiftEnd: number | null;
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
 * Calcula puntaje de empleado para un slot específico
 */
function calculateEmployeeScore(
  employee: Employee,
  slot: ShiftSlot,
  weekHours: number,
  monthHours: number,
  prevShiftEnd: number | null,
  area: Area,
  existingShifts: Shift[]
): number {
  let score = 0;
  
  // Disponibilidad
  const avail = employee.availability[slot.dayOfWeek];
  if (!avail) return -1000; // No disponible
  if (avail.start > slot.startHour || avail.end < slot.endHour) return -1000;
  
  // Descanso mínimo
  if (prevShiftEnd !== null) {
    const minStart = prevShiftEnd + area.minRestHours - 24;
    if (slot.startHour < minStart) return -500;
  }
  
  // Límites de horas
  const projectedHours = slot.endHour - slot.startHour - 1;
  if (weekHours + projectedHours > area.maxHoursWeek) return -400;
  if (monthHours + projectedHours > area.maxHoursMonth) return -400;
  
  // Ya tiene turno en este día
  const existingToday = existingShifts.find(s => s.employeeId === employee.id && s.date === slot.date);
  if (existingToday) return -1000;
  
  // Puntaje base: menor carga horaria = mejor
  score -= weekHours * 10;
  score -= monthHours * 5;
  
  // Preferencia por horarios cercanos a disponibilidad
  const availCenter = (avail.start + avail.end) / 2;
  const slotCenter = (slot.startHour + slot.endHour) / 2;
  score -= Math.abs(availCenter - slotCenter) * 2;
  
  // Rotación: penalizar si trabajó horarios similares recientemente
  const recentSimilar = existingShifts.filter(s => 
    s.employeeId === employee.id && 
    Math.abs(s.start - slot.startHour) < 2 &&
    Math.abs(s.end - slot.endHour) < 2
  ).length;
  score -= recentSimilar * 20;
  
  return score;
}

/**
 * Asigna empleados a slots basado en puntaje
 */
export function assignEmployeesToSlots(
  slots: ShiftSlot[],
  employees: Employee[],
  area: Area,
  existingShifts: Shift[],
  weekHoursMap: Map<string, number>,
  monthHoursMap: Map<string, number>,
  prevShiftEndMap: Map<string, number | null>
): Shift[] {
  const assignedShifts: Shift[] = [];
  const assignedEmployees = new Set<string>();
  
  // Ordenar slots por requerimiento (priorizar slots con mayor déficit)
  const sortedSlots = [...slots].sort((a, b) => {
    const aCoverage = existingShifts.filter(s => 
      s.date === a.date && 
      s.start >= a.startHour && 
      s.end <= a.endHour
    ).length;
    const bCoverage = existingShifts.filter(s => 
      s.date === b.date && 
      s.start >= b.startHour && 
      s.end <= b.endHour
    ).length;
    const aDeficit = a.required - aCoverage;
    const bDeficit = b.required - bCoverage;
    return bDeficit - aDeficit;
  });
  
  for (const slot of sortedSlots) {
    // Calcular cobertura actual
    const currentCoverage = existingShifts.filter(s => 
      s.date === slot.date && 
      s.start >= slot.startHour && 
      s.end <= slot.endHour
    ).length + assignedShifts.filter(s => 
      s.date === slot.date && 
      s.start >= slot.startHour && 
      s.end <= slot.endHour
    ).length;
    
    if (currentCoverage >= slot.preferred) continue;
    
    // Calcular puntajes para cada empleado
    const scores: EmployeeScore[] = employees.map(emp => ({
      employee: emp,
      score: calculateEmployeeScore(
        emp,
        slot,
        weekHoursMap.get(emp.id) ?? 0,
        monthHoursMap.get(emp.id) ?? 0,
        prevShiftEndMap.get(emp.id) ?? null,
        area,
        [...existingShifts, ...assignedShifts]
      ),
      weekHours: weekHoursMap.get(emp.id) ?? 0,
      monthHours: monthHoursMap.get(emp.id) ?? 0,
      prevShiftEnd: prevShiftEndMap.get(emp.id) ?? null,
    }));
    
    // Filtrar empleados válidos y ordenar por puntaje
    const validEmployees = scores
      .filter(s => s.score > -1000)
      .sort((a, b) => b.score - a.score);
    
    // Asignar hasta alcanzar el requerimiento
    const needed = Math.min(slot.preferred - currentCoverage, validEmployees.length);
    for (let i = 0; i < needed; i++) {
      const empScore = validEmployees[i];
      const hours = slot.endHour - slot.startHour - 1;
      
      assignedShifts.push({
        id: `${empScore.employee.id}-${slot.date}-${slot.startHour}`,
        employeeId: empScore.employee.id,
        date: slot.date,
        start: slot.startHour,
        end: slot.endHour,
        breakMinutes: 60,
        code: detectCode(slot.startHour, slot.endHour, slot.date, 60, area.maxHoursDay),
      });
      
      // Actualizar contadores
      weekHoursMap.set(empScore.employee.id, empScore.weekHours + hours);
      monthHoursMap.set(empScore.employee.id, empScore.monthHours + hours);
      prevShiftEndMap.set(empScore.employee.id, slot.endHour);
    }
  }
  
  return assignedShifts;
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
    const coverage = shifts.filter(s => 
      s.date === slot.date && 
      s.start >= slot.startHour && 
      s.end <= slot.endHour &&
      s.code !== "OFF" && s.code !== "ABS"
    ).length;
    
    if (coverage < slot.required) {
      gaps.push(slot);
    }
  }
  
  return { valid: gaps.length === 0, gaps };
}

/**
 * Implementa rotación de horarios entre empleados
 */
export function rotateShifts(
  shifts: Shift[],
  employees: Employee[],
  weekOffset: number
): Shift[] {
  if (employees.length === 0) return shifts;
  
  // Crear mapa de rotación basado en hash del empleado y offset de semana
  const rotationMap = new Map<string, string>();
  employees.forEach((emp, idx) => {
    const rotationOffset = (idx + weekOffset) % employees.length;
    const rotatedEmp = employees[rotationOffset];
    rotationMap.set(emp.id, rotatedEmp.id);
  });
  
  // Aplicar rotación
  return shifts.map(shift => {
    const newEmployeeId = rotationMap.get(shift.employeeId);
    if (!newEmployeeId) return shift;
    
    return {
      ...shift,
      id: shift.id.replace(shift.employeeId, newEmployeeId),
      employeeId: newEmployeeId,
    };
  });
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
  function makeAbs(emp: Employee, date: string, abs: Absence): Shift {
    const partial = abs.startHour !== undefined && abs.endHour !== undefined;
    return {
      id: `${emp.id}-${date}`, employeeId: emp.id, date,
      start: 0, end: 0, breakMinutes: 0, code: "ABS", locked: true,
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
      if (abs) { result.push(makeAbs(emp, date, abs)); continue; }

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
            if (abs) return false;
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

        // Absent employee → ABS, stop trying for this slot
        const abs = absences.find(a => a.employeeId === emp.id && date >= a.startDate && date <= a.endDate);
        if (abs) {
          assignedKeys.add(key);
          const partial = abs.startHour !== undefined && abs.endHour !== undefined;
          result.push({
            id: `${emp.id}-${date}`, employeeId: emp.id, date,
            start: 0, end: 0, breakMinutes: 0, code: "ABS",
            note: partial ? `abs:${abs.type}:${abs.startHour}:${abs.endHour}` : `abs:${abs.type}`,
          });
          break;
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
