import { describe, it, expect } from "vitest";
import { getShiftWorkHours } from "./calc";
import { validateCoverage } from "./coverage";
import type { Shift } from "./types";

// Reproduce el escenario reportado: ausencia parcial 13-16 + horas de trabajo
// adicionales 08-13 (turno partido), contra franjas 08-09 (min1), 10-16 (min3), 16-18 (min2).

describe("getShiftWorkHours — ausencia parcial con horas de trabajo adicionales", () => {
  it("Camino A: horas codificadas en note (abs:TYPE:absStart:absEnd:workStart:workEnd), start/end en 0", () => {
    const shift: Shift = {
      id: "s1", employeeId: "e1", date: "2026-07-06",
      start: 0, end: 0, breakMinutes: 0, code: "ABS",
      note: "abs:permiso:13:16:8:13",
    };
    expect(getShiftWorkHours(shift)).toEqual({ start: 8, end: 13 });
  });

  it("Camino B: horas reales en shift.start/end, note de 4 partes sin workStart/workEnd", () => {
    const shift: Shift = {
      id: "s2", employeeId: "e1", date: "2026-07-06",
      start: 8, end: 13, breakMinutes: 0, code: "ABS",
      note: "abs:permiso:13:16",
    };
    expect(getShiftWorkHours(shift)).toEqual({ start: 8, end: 13 });
  });

  it("ausencia de día completo → sin horas trabajadas", () => {
    const shift: Shift = {
      id: "s3", employeeId: "e1", date: "2026-07-06",
      start: 0, end: 0, breakMinutes: 0, code: "ABS",
      note: "abs:vacaciones",
    };
    expect(getShiftWorkHours(shift)).toBeNull();
  });
});

describe("validateCoverage — no debe subestimar la cobertura de un turno partido por ausencia parcial", () => {
  const slots = [
    { date: "2026-07-06", dayOfWeek: 1, startHour: 8, endHour: 9, required: 1, preferred: 1 },
    { date: "2026-07-06", dayOfWeek: 1, startHour: 10, endHour: 16, required: 3, preferred: 3 },
    { date: "2026-07-06", dayOfWeek: 1, startHour: 16, endHour: 18, required: 2, preferred: 2 },
  ];

  it("empleado con ausencia 13-16 + trabajo 08-13 cubre la franja 08-09 (antes: excluido por completo)", () => {
    const shifts: Shift[] = [
      { id: "s1", employeeId: "e1", date: "2026-07-06", start: 0, end: 0, breakMinutes: 0, code: "ABS", note: "abs:permiso:13:16:8:13" },
    ];
    const { gaps } = validateCoverage(shifts, [slots[0]]);
    expect(gaps.length).toBe(0); // 08-09 debe quedar cubierta (1/1), no en 0/1
  });

  it("ese mismo empleado NO cubre 10-16 (sale a las 13, no está presente toda la franja) ni 16-18", () => {
    const shifts: Shift[] = [
      { id: "s1", employeeId: "e1", date: "2026-07-06", start: 0, end: 0, breakMinutes: 0, code: "ABS", note: "abs:permiso:13:16:8:13" },
    ];
    const { gaps } = validateCoverage(shifts, [slots[1], slots[2]]);
    expect(gaps.length).toBe(2); // ambas franjas siguen sin cubrir por este empleado, correctamente
  });
});
