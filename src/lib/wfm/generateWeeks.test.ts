import { describe, it, expect } from "vitest";
import { extractBasePattern, buildRotatedWeek } from "./coverage";
import { startOfWeek, toISO, addDays } from "./date";
import type { Shift, Employee, Area, Absence } from "./types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EMP_A: Employee = {
  id: "emp-a", fullName: "Ana", documentId: "1", position: "Agente",
  areaId: "area-1", leader: "", status: "active", contractType: "indefinido",
  hireDate: "2025-01-01",
  availability: {
    1: { start: 6, end: 22 }, 2: { start: 6, end: 22 }, 3: { start: 6, end: 22 },
    4: { start: 6, end: 22 }, 5: { start: 6, end: 22 }, 6: null, 0: null,
  },
};

const EMP_B: Employee = {
  id: "emp-b", fullName: "Beto", documentId: "2", position: "Agente",
  areaId: "area-1", leader: "", status: "active", contractType: "indefinido",
  hireDate: "2025-01-01",
  availability: {
    1: { start: 6, end: 22 }, 2: { start: 6, end: 22 }, 3: { start: 6, end: 22 },
    4: { start: 6, end: 22 }, 5: { start: 6, end: 22 }, 6: null, 0: null,
  },
};

const AREA: Area = {
  id: "area-1", name: "Test", leader: "",
  startHour: 6, endHour: 22,
  workingDays: [1, 2, 3, 4, 5],
  maxHoursDay: 8, maxHoursWeek: 46, maxHoursMonth: 192,
  allowOvertime: false, allowSunday: false, minRestHours: 10,
  holidaySchedule: { active: false, start: 8, end: 18 },
  enableCoverageMode: true,
  coverageRequirements: [
    { dayOfWeek: 1, startHour: 6, endHour: 14, minWorkers: 1, preferredWorkers: 1 },
    { dayOfWeek: 1, startHour: 14, endHour: 22, minWorkers: 1, preferredWorkers: 1 },
    { dayOfWeek: 2, startHour: 6, endHour: 14, minWorkers: 1, preferredWorkers: 1 },
    { dayOfWeek: 2, startHour: 14, endHour: 22, minWorkers: 1, preferredWorkers: 1 },
    { dayOfWeek: 3, startHour: 6, endHour: 14, minWorkers: 1, preferredWorkers: 1 },
    { dayOfWeek: 3, startHour: 14, endHour: 22, minWorkers: 1, preferredWorkers: 1 },
    { dayOfWeek: 4, startHour: 6, endHour: 14, minWorkers: 1, preferredWorkers: 1 },
    { dayOfWeek: 4, startHour: 14, endHour: 22, minWorkers: 1, preferredWorkers: 1 },
    { dayOfWeek: 5, startHour: 6, endHour: 14, minWorkers: 1, preferredWorkers: 1 },
    { dayOfWeek: 5, startHour: 14, endHour: 22, minWorkers: 1, preferredWorkers: 1 },
  ],
};

// Semana Jun 7-13 2026 (domingo-sábado) bloqueada: Ana en mañana, Beto en tarde (lun-vie)
const WORKING_DAYS_JUN8 = ["2026-06-08","2026-06-09","2026-06-10","2026-06-11","2026-06-12"];
const LOCKED_SHIFTS: Shift[] = WORKING_DAYS_JUN8.flatMap(date => ([
  { id: `emp-a-${date}`, employeeId: "emp-a", date, start: 6,  end: 14, breakMinutes: 60, code: "STD" as const, locked: true },
  { id: `emp-b-${date}`, employeeId: "emp-b", date, start: 14, end: 22, breakMinutes: 60, code: "STD" as const, locked: true },
]));

const ABSENCES: Absence[] = [];
const SORTED_EMPLOYEES = [EMP_A, EMP_B]; // ya ordenados por id: emp-a < emp-b

// ── Helper: replica la detección de ancla del store ───────────────────────────
// Ancla = última semana bloqueada ANTES de weekStartISO
function findAnchorISO(shifts: Shift[], weekStartISO: string): string {
  const locked = shifts.filter(s =>
    s.date < weekStartISO &&
    s.locked && s.code !== "OFF" && s.code !== "ABS" && s.end > s.start
  );
  if (!locked.length) return weekStartISO; // fallback: semana actual como ancla
  const latest = [...locked].sort((a, b) => b.date.localeCompare(a.date))[0];
  return toISO(startOfWeek(new Date(latest.date + "T00:00:00")));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Anchor detection — última bloqueada antes del objetivo", () => {
  it("solo Jun 7-13 bloqueado → ancla es Jun 7 (domingo) cuando objetivo = Jun 15", () => {
    const anchor = findAnchorISO(LOCKED_SHIFTS, "2026-06-15");
    expect(anchor).toBe("2026-06-07");
  });

  it("NO apunta a May 31-Jun 6 cuando no hay turnos ahí", () => {
    const anchor = findAnchorISO(LOCKED_SHIFTS, "2026-06-15");
    expect(anchor).not.toBe("2026-05-31");
  });

  it("si May 31-Jun 6 Y Jun 7-13 están bloqueados, ancla = Jun 7 (la más reciente)", () => {
    // Simula tener también Jun 1-5 bloqueados (semana May 31-Jun 6)
    const jun1Week: Shift[] = ["2026-06-01","2026-06-02","2026-06-03","2026-06-04","2026-06-05"]
      .flatMap(date => ([
        { id: `emp-a-${date}-old`, employeeId: "emp-a", date, start: 6,  end: 14, breakMinutes: 60, code: "STD" as const, locked: true },
        { id: `emp-b-${date}-old`, employeeId: "emp-b", date, start: 14, end: 22, breakMinutes: 60, code: "STD" as const, locked: true },
      ]));
    const anchor = findAnchorISO([...jun1Week, ...LOCKED_SHIFTS], "2026-06-15");
    expect(anchor).toBe("2026-06-07"); // Jun 7-13 es la más reciente antes del 15
  });

  it("sin bloqueados anteriores → ancla = semana objetivo (se autogenera)", () => {
    const anchor = findAnchorISO([], "2026-06-15");
    expect(anchor).toBe("2026-06-15");
  });
});

describe("extractBasePattern (semana Jun 8-14)", () => {
  const pattern = extractBasePattern(LOCKED_SHIFTS, "2026-06-08");

  it("extrae 10 slots (2 turnos × 5 días laborales)", () => {
    expect(pattern).toHaveLength(10);
  });

  it("Ana tiene slots de mañana (6-14) en todos los días laborales", () => {
    const anaSlots = pattern.filter(s => s.employeeId === "emp-a");
    expect(anaSlots).toHaveLength(5);
    anaSlots.forEach(s => {
      expect(s.start).toBe(6);
      expect(s.end).toBe(14);
    });
  });

  it("Beto tiene slots de tarde (14-22) en todos los días laborales", () => {
    const betoSlots = pattern.filter(s => s.employeeId === "emp-b");
    expect(betoSlots).toHaveLength(5);
    betoSlots.forEach(s => {
      expect(s.start).toBe(14);
      expect(s.end).toBe(22);
    });
  });
});

describe("buildRotatedWeek offset=1 → semana Jun 15-21", () => {
  const pattern = extractBasePattern(LOCKED_SHIFTS, "2026-06-08");
  const weekShifts = buildRotatedWeek(
    "2026-06-15", pattern, SORTED_EMPLOYEES, 1, AREA, ABSENCES, LOCKED_SHIFTS
  );

  const jun15 = weekShifts.filter(s => s.date === "2026-06-15");

  it("genera turnos para Jun 15 (lunes)", () => {
    expect(jun15.length).toBeGreaterThan(0);
  });

  it("Beto (idx 1 → rotado a mañana) trabaja 6-14 el lunes 15", () => {
    const betoShift = jun15.find(s => s.employeeId === "emp-b" && s.code !== "OFF");
    expect(betoShift).toBeDefined();
    expect(betoShift!.start).toBe(6);
    expect(betoShift!.end).toBe(14);
  });

  it("Ana (idx 0 → rotada a tarde) trabaja 14-22 el lunes 15", () => {
    const anaShift = jun15.find(s => s.employeeId === "emp-a" && s.code !== "OFF");
    expect(anaShift).toBeDefined();
    expect(anaShift!.start).toBe(14);
    expect(anaShift!.end).toBe(22);
  });

  it("los turnos generados NO tienen fechas de Jun 1-7 (ancla falsa)", () => {
    const wrongDates = weekShifts.filter(s => s.date < "2026-06-08");
    expect(wrongDates).toHaveLength(0);
  });

  it("los turnos generados NO tienen fechas de Jun 8-14 (semana bloqueada)", () => {
    const anchorDates = weekShifts.filter(s => s.date >= "2026-06-08" && s.date <= "2026-06-14");
    expect(anchorDates).toHaveLength(0);
  });

  it("las fechas generadas son solo Jun 15-21", () => {
    const dates = [...new Set(weekShifts.map(s => s.date))].sort();
    dates.forEach(d => {
      expect(d >= "2026-06-15" && d <= "2026-06-21").toBe(true);
    });
  });
});

describe("buildRotatedWeek respeta turnos bloqueados individualmente", () => {
  // Beto tiene un turno bloqueado diferente el lunes 15 (asignado manualmente)
  const manualLock: Shift = {
    id: "emp-b-2026-06-15-manual", employeeId: "emp-b",
    date: "2026-06-15", start: 8, end: 16, breakMinutes: 60,
    code: "STD", locked: true,
  };
  const pattern = extractBasePattern(LOCKED_SHIFTS, "2026-06-08");
  const weekShifts = buildRotatedWeek(
    "2026-06-15", pattern, SORTED_EMPLOYEES, 1, AREA, ABSENCES,
    [...LOCKED_SHIFTS, manualLock]
  );

  it("Beto mantiene su turno manual bloqueado (8-16) en vez del rotado (6-14)", () => {
    const betoJun15 = weekShifts.find(s => s.employeeId === "emp-b" && s.date === "2026-06-15");
    expect(betoJun15).toBeDefined();
    expect(betoJun15!.start).toBe(8);
    expect(betoJun15!.end).toBe(16);
    expect(betoJun15!.locked).toBe(true);
  });
});

describe("buildRotatedWeek reasigna el turno cuando el rotado está ausente", () => {
  const pattern = extractBasePattern(LOCKED_SHIFTS, "2026-06-08");
  // Con offset=1, Beto rota a la mañana (6-14) el lunes 15. Si Beto está ausente,
  // el turno de mañana debe cubrirlo Ana (el siguiente en la rotación) en vez de
  // quedar sin cubrir.
  const absencesWithBeto: Absence[] = [
    { id: "abs-1", employeeId: "emp-b", type: "vacaciones", startDate: "2026-06-15", endDate: "2026-06-15", reason: "Vacaciones" },
  ];
  const weekShifts = buildRotatedWeek(
    "2026-06-15", pattern, SORTED_EMPLOYEES, 1, AREA, absencesWithBeto, LOCKED_SHIFTS
  );
  const jun15 = weekShifts.filter(s => s.date === "2026-06-15");

  it("Beto queda registrado como ABS", () => {
    const betoShift = jun15.find(s => s.employeeId === "emp-b");
    expect(betoShift?.code).toBe("ABS");
  });

  it("Ana cubre el turno de mañana (6-14) en vez de quedar sin cubrir", () => {
    const anaShift = jun15.find(s => s.employeeId === "emp-a" && s.code !== "OFF" && s.code !== "ABS");
    expect(anaShift).toBeDefined();
    expect(anaShift!.start).toBe(6);
    expect(anaShift!.end).toBe(14);
  });
});

describe("buildRotatedWeek — ausencia parcial que no se solapa con el turno rotado", () => {
  const pattern = extractBasePattern(LOCKED_SHIFTS, "2026-06-08");
  // Beto rota a la mañana (6-14) el lunes 15 con offset=1. Su ausencia es 11-15,
  // que SÍ se solapa con 6-14, así que debe generar ABS con horas residuales 6-11.
  it("ausencia 11-15 sobre turno 6-14 deja horas de trabajo residuales 6-11 (no ABS 0/0)", () => {
    const absencesPartial: Absence[] = [
      { id: "abs-1", employeeId: "emp-b", type: "permiso", startDate: "2026-06-15", endDate: "2026-06-15", startHour: 11, endHour: 15, reason: "Cita médica" },
    ];
    const weekShifts = buildRotatedWeek(
      "2026-06-15", pattern, SORTED_EMPLOYEES, 1, AREA, absencesPartial, LOCKED_SHIFTS
    );
    const betoShift = weekShifts.find(s => s.employeeId === "emp-b" && s.date === "2026-06-15");
    expect(betoShift?.code).toBe("ABS");
    expect(betoShift?.start).toBe(6);
    expect(betoShift?.end).toBe(11);
  });

  it("ausencia 15-18 NO se solapa con el turno rotado 6-14 → el empleado trabaja normalmente (no ABS)", () => {
    const absencesNoOverlap: Absence[] = [
      { id: "abs-2", employeeId: "emp-b", type: "permiso", startDate: "2026-06-15", endDate: "2026-06-15", startHour: 15, endHour: 18, reason: "Cita médica" },
    ];
    const weekShifts = buildRotatedWeek(
      "2026-06-15", pattern, SORTED_EMPLOYEES, 1, AREA, absencesNoOverlap, LOCKED_SHIFTS
    );
    const betoShift = weekShifts.find(s => s.employeeId === "emp-b" && s.date === "2026-06-15");
    expect(betoShift?.code).not.toBe("ABS");
    expect(betoShift?.start).toBe(6);
    expect(betoShift?.end).toBe(14);
  });
});

describe("Rotación completa de 4 semanas (Jun 8 → Jun 28)", () => {
  const pattern = extractBasePattern(LOCKED_SHIFTS, "2026-06-08");
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const anchorDate = new Date("2026-06-08T00:00:00");

  const results = [1, 2, 3].map(w => {
    const weekDate = addDays(new Date("2026-06-08T00:00:00"), w * 7);
    const weekISO = toISO(weekDate);
    const offset = Math.round((weekDate.getTime() - anchorDate.getTime()) / MS_PER_WEEK);
    return {
      weekISO,
      offset,
      shifts: buildRotatedWeek(weekISO, pattern, SORTED_EMPLOYEES, offset, AREA, ABSENCES, LOCKED_SHIFTS),
    };
  });

  it("semana 2 (offset 1): Beto en mañana, Ana en tarde el lunes", () => {
    const lunes = results[0].shifts.filter(s => s.date === "2026-06-15" && s.code !== "OFF");
    expect(lunes.find(s => s.employeeId === "emp-b")?.start).toBe(6);
    expect(lunes.find(s => s.employeeId === "emp-a")?.start).toBe(14);
  });

  it("semana 3 (offset 2): Ana en mañana, Beto en tarde el lunes (vuelta al origen)", () => {
    const lunes = results[1].shifts.filter(s => s.date === "2026-06-22" && s.code !== "OFF");
    expect(lunes.find(s => s.employeeId === "emp-a")?.start).toBe(6);
    expect(lunes.find(s => s.employeeId === "emp-b")?.start).toBe(14);
  });

  it("semana 4 (offset 3): Beto en mañana, Ana en tarde de nuevo", () => {
    const lunes = results[2].shifts.filter(s => s.date === "2026-06-29" && s.code !== "OFF");
    expect(lunes.find(s => s.employeeId === "emp-b")?.start).toBe(6);
    expect(lunes.find(s => s.employeeId === "emp-a")?.start).toBe(14);
  });
});
