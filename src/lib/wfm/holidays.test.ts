import { describe, it, expect } from "vitest";
import { isHoliday, isSundayOrHoliday } from "./calc";

// ─────────────────────────────────────────────────────────────────────────────
// Festivos Colombia — Ley 51/1983 (Emiliani) + Ley 17/1982 + festivos fijos
//
// NOTA sobre 2026-07-13:
//   San Pedro y San Pablo cae el 29 de junio. En 2026, jun 29 ya ES lunes,
//   por lo tanto el festivo permanece el 29-jun-2026, NO se traslada a jul 13.
//   Fuentes que muestran jul 13 como festivo están equivocadas para ese año.
// ─────────────────────────────────────────────────────────────────────────────

describe("isHoliday – festivos fijos (fecha siempre igual)", () => {
  it("Año Nuevo siempre es festivo", () => {
    for (const y of [2024, 2025, 2026, 2027, 2028, 2030, 2035])
      expect(isHoliday(`${y}-01-01`)).toBe(true);
  });

  it("Día del Trabajo (1 mayo) siempre es festivo", () => {
    for (const y of [2024, 2025, 2026, 2027, 2028])
      expect(isHoliday(`${y}-05-01`)).toBe(true);
  });

  it("Independencia (20 julio) siempre es festivo", () => {
    for (const y of [2024, 2025, 2026, 2027, 2028])
      expect(isHoliday(`${y}-07-20`)).toBe(true);
  });

  it("Batalla de Boyacá (7 agosto) siempre es festivo", () => {
    for (const y of [2024, 2025, 2026, 2027, 2028])
      expect(isHoliday(`${y}-08-07`)).toBe(true);
  });

  it("Inmaculada Concepción (8 diciembre) siempre es festivo", () => {
    for (const y of [2024, 2025, 2026, 2027, 2028])
      expect(isHoliday(`${y}-12-08`)).toBe(true);
  });

  it("Navidad (25 diciembre) siempre es festivo", () => {
    for (const y of [2024, 2025, 2026, 2027, 2028, 2035])
      expect(isHoliday(`${y}-12-25`)).toBe(true);
  });
});

describe("isHoliday – Ley Emiliani: traslados al lunes siguiente", () => {
  it("Reyes Magos (6 enero) → lunes siguiente si no cae lunes", () => {
    // 2025: ene 6 = lunes → permanece
    expect(isHoliday("2025-01-06")).toBe(true);
    // 2026: ene 6 = martes → traslado a ene 12
    expect(isHoliday("2026-01-06")).toBe(false);
    expect(isHoliday("2026-01-12")).toBe(true);
    // 2027: ene 6 = miércoles → traslado a ene 11
    expect(isHoliday("2027-01-11")).toBe(true);
    expect(isHoliday("2027-01-06")).toBe(false);
    // 2028: ene 6 = jueves → traslado a ene 10
    expect(isHoliday("2028-01-10")).toBe(true);
  });

  it("San José (19 marzo) → lunes siguiente si no cae lunes", () => {
    // 2025: mar 19 = miércoles → traslado a mar 24
    expect(isHoliday("2025-03-24")).toBe(true);
    expect(isHoliday("2025-03-19")).toBe(false);
    // 2028: mar 19 = domingo → traslado a mar 20
    expect(isHoliday("2028-03-20")).toBe(true);
    expect(isHoliday("2028-03-19")).toBe(false);
  });

  it("San Pedro y San Pablo (29 junio) → lunes siguiente si no cae lunes", () => {
    // 2024: jun 29 = sábado → traslado a jul 1
    expect(isHoliday("2024-07-01")).toBe(true);
    expect(isHoliday("2024-06-29")).toBe(false);
    // 2025: jun 29 = domingo → traslado a jun 30
    expect(isHoliday("2025-06-30")).toBe(true);
    // 2026: jun 29 = lunes → permanece jun 29 (NO se traslada a jul 13)
    expect(isHoliday("2026-06-29")).toBe(true);
    expect(isHoliday("2026-07-13")).toBe(false);
    // 2027: jun 29 = martes → traslado a jul 5
    expect(isHoliday("2027-07-05")).toBe(true);
  });

  it("Asunción de la Virgen (15 agosto) → lunes siguiente", () => {
    // 2025: ago 15 = viernes → traslado a ago 18
    expect(isHoliday("2025-08-18")).toBe(true);
    expect(isHoliday("2025-08-15")).toBe(false);
    // 2026: ago 15 = sábado → traslado a ago 17
    expect(isHoliday("2026-08-17")).toBe(true);
  });

  it("Día de la Raza (12 octubre) → lunes siguiente", () => {
    // 2025: oct 12 = domingo → traslado a oct 13
    expect(isHoliday("2025-10-13")).toBe(true);
    // 2026: oct 12 = lunes → permanece
    expect(isHoliday("2026-10-12")).toBe(true);
    // 2027: oct 12 = martes → traslado a oct 18
    expect(isHoliday("2027-10-18")).toBe(true);
  });

  it("Todos los Santos (1 noviembre) → lunes siguiente", () => {
    // 2025: nov 1 = sábado → traslado a nov 3
    expect(isHoliday("2025-11-03")).toBe(true);
    expect(isHoliday("2025-11-01")).toBe(false);
    // 2027: nov 1 = lunes → permanece
    expect(isHoliday("2027-11-01")).toBe(true);
  });

  it("Independencia de Cartagena (11 noviembre) → lunes siguiente", () => {
    // 2024: nov 11 = lunes → permanece
    expect(isHoliday("2024-11-11")).toBe(true);
    // 2025: nov 11 = martes → traslado a nov 17
    expect(isHoliday("2025-11-17")).toBe(true);
    expect(isHoliday("2025-11-11")).toBe(false);
    // 2026: nov 11 = miércoles → traslado a nov 16
    expect(isHoliday("2026-11-16")).toBe(true);
  });
});

describe("isHoliday – festivos calculados desde Semana Santa", () => {
  it("Jueves y Viernes Santo correctos para 2024–2028", () => {
    const semanas: Record<number, [string, string]> = {
      2024: ["2024-03-28", "2024-03-29"],
      2025: ["2025-04-17", "2025-04-18"],
      2026: ["2026-04-02", "2026-04-03"],
      2027: ["2027-03-25", "2027-03-26"],
      2028: ["2028-04-13", "2028-04-14"],
    };
    for (const [, [jue, vie]] of Object.entries(semanas)) {
      expect(isHoliday(jue)).toBe(true);
      expect(isHoliday(vie)).toBe(true);
    }
  });

  it("Ascensión del Señor (Pascua+43, lunes)", () => {
    expect(isHoliday("2024-05-13")).toBe(true);
    expect(isHoliday("2025-06-02")).toBe(true);
    expect(isHoliday("2026-05-18")).toBe(true);
    expect(isHoliday("2027-05-10")).toBe(true);
    expect(isHoliday("2028-05-29")).toBe(true);
  });

  it("Corpus Christi (Pascua+64, lunes)", () => {
    expect(isHoliday("2024-06-03")).toBe(true);
    expect(isHoliday("2025-06-23")).toBe(true);
    expect(isHoliday("2026-06-08")).toBe(true);
    expect(isHoliday("2027-05-31")).toBe(true);
    expect(isHoliday("2028-06-19")).toBe(true);
  });

  it("Sagrado Corazón (Pascua+71, lunes)", () => {
    expect(isHoliday("2024-06-10")).toBe(true);
    // 2025: Sagrado Corazón = Pascua(abr20)+71 = jun 30 (lunes).
    // San Pedro/Pablo (jun 29 = domingo) también se traslada a jun 30.
    // Ambos festivos coinciden → jun 30 es festivo.
    expect(isHoliday("2025-06-30")).toBe(true);
    expect(isHoliday("2026-06-15")).toBe(true);
    expect(isHoliday("2027-06-07")).toBe(true);
    expect(isHoliday("2028-06-26")).toBe(true);
  });
});

describe("isHoliday – días que NO son festivos", () => {
  it("Días comunes no son festivos", () => {
    expect(isHoliday("2026-12-24")).toBe(false); // Nochebuena
    expect(isHoliday("2026-12-31")).toBe(false); // Nochevieja
    expect(isHoliday("2026-03-15")).toBe(false);
    expect(isHoliday("2027-06-15")).toBe(false);
    expect(isHoliday("2028-09-10")).toBe(false);
  });

  it("La fecha original no es festivo cuando hay traslado", () => {
    expect(isHoliday("2026-01-06")).toBe(false); // Reyes orig. (es martes)
    expect(isHoliday("2025-03-19")).toBe(false); // San José orig. (es miércoles)
    expect(isHoliday("2025-11-11")).toBe(false); // Cartagena orig. (es martes)
  });
});

describe("isHoliday – casos de prueba solicitados por especificación", () => {
  it("2026-06-29 → festivo (San Pedro y San Pablo, ya era lunes)", () =>
    expect(isHoliday("2026-06-29")).toBe(true));

  it("2026-07-13 → NO festivo (jul 13 no tiene festivo asignado en 2026)", () =>
    expect(isHoliday("2026-07-13")).toBe(false));

  it("2026-07-20 → festivo (Independencia, fijo)", () =>
    expect(isHoliday("2026-07-20")).toBe(true));

  it("2026-12-25 → festivo (Navidad, fijo)", () =>
    expect(isHoliday("2026-12-25")).toBe(true));

  it("2026-12-24 → NO festivo", () =>
    expect(isHoliday("2026-12-24")).toBe(false));

  it("2027-01-11 → festivo (Reyes trasladado al lunes)", () =>
    expect(isHoliday("2027-01-11")).toBe(true));

  it("2028-03-20 → festivo (San José trasladado al lunes)", () =>
    expect(isHoliday("2028-03-20")).toBe(true));
});

describe("isSundayOrHoliday", () => {
  it("Domingo siempre es true", () => {
    expect(isSundayOrHoliday("2026-07-12")).toBe(true); // domingo
    expect(isSundayOrHoliday("2026-01-04")).toBe(true); // domingo
  });

  it("Festivo en día de semana es true", () => {
    expect(isSundayOrHoliday("2026-04-02")).toBe(true); // Jueves Santo
    expect(isSundayOrHoliday("2026-07-20")).toBe(true); // Independencia (lunes)
  });

  it("Día laboral común es false", () => {
    expect(isSundayOrHoliday("2026-03-10")).toBe(false); // martes sin festivo
  });
});
