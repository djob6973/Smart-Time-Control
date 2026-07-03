import type { Shift, NoveltyBreakdown, NoveltyCode, Area } from "./types";

const NIGHT_START = 19; // 19:00 — Ley 2101/2021: jornada nocturna 7:00 p.m. – 6:00 a.m.
const NIGHT_END = 6;    // 06:00

export function isSunday(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay() === 0;
}

function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function shiftDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toNextMonday(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay();
  if (dow !== 1) d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow));
  return d;
}

/** Formats a local Date as YYYY-MM-DD using LOCAL timezone methods (not UTC). */
function dateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildHolidays(year: number): Set<string> {
  const h = new Set<string>();

  // Festivos fijos
  [`${year}-01-01`, `${year}-05-01`, `${year}-07-20`,
   `${year}-08-07`, `${year}-12-08`, `${year}-12-25`]
    .forEach((d) => h.add(d));

  // Festivos Ley Emiliani (se trasladan al lunes siguiente)
  [new Date(year, 0, 6), new Date(year, 2, 19), new Date(year, 5, 29),
   new Date(year, 7, 15), new Date(year, 9, 12),
   new Date(year, 10, 1), new Date(year, 10, 11)]
    .forEach((d) => h.add(dateToISO(toNextMonday(d))));

  // Festivos religiosos basados en Semana Santa
  const easter = easterDate(year);
  h.add(dateToISO(shiftDays(easter, -3)));                   // Jueves Santo
  h.add(dateToISO(shiftDays(easter, -2)));                   // Viernes Santo
  h.add(dateToISO(toNextMonday(shiftDays(easter, 43))));     // Ascensión
  h.add(dateToISO(toNextMonday(shiftDays(easter, 64))));     // Corpus Christi
  h.add(dateToISO(toNextMonday(shiftDays(easter, 71))));     // Sagrado Corazón

  return h;
}

const holidayCache = new Map<number, Set<string>>();

// Overrides cargados desde DB (custom_holidays). Se inicializan una sola vez en el store.
let _overrides: Record<string, boolean> = {};

/** Carga los overrides de festivos personalizados en el motor de cálculo. */
export function setHolidayOverrides(overrides: Record<string, boolean>): void {
  _overrides = overrides;
}

const KNOWN_ABS_TYPES = new Set([
  "vacaciones", "incapacidad", "licencia", "permiso", "no_remunerada", "compensatorio",
]);

/**
 * Parses the absence metadata encoded in a shift's note field.
 * New format: "abs:TYPE" (full day) | "abs:TYPE:ABSSTART:ABSEND" (partial) | "abs:TYPE:ABSSTART:ABSEND:WORKSTART:WORKEND" (partial with work hours)
 * Legacy format: just the absence type name (e.g. "vacaciones") — treated as full-day.
 * Returns null if the note does not encode absence info.
 */
export function parseAbsNote(note?: string): { type: string; absStart: number; absEnd: number; workStart?: number; workEnd?: number } | null {
  if (!note) return null;
  if (note.startsWith("abs:")) {
    const parts = note.split(":");
    if (parts.length === 2) return { type: parts[1], absStart: 0, absEnd: 8 };
    if (parts.length === 4) {
      const absStart = parseInt(parts[2], 10);
      const absEnd   = parseInt(parts[3], 10);
      if (isNaN(absStart) || isNaN(absEnd)) return { type: parts[1], absStart: 0, absEnd: 8 };
      return { type: parts[1], absStart, absEnd };
    }
    if (parts.length === 6) {
      const absStart  = parseInt(parts[2], 10);
      const absEnd    = parseInt(parts[3], 10);
      const workStart = parseInt(parts[4], 10);
      const workEnd   = parseInt(parts[5], 10);
      if (isNaN(absStart) || isNaN(absEnd)) return { type: parts[1], absStart: 0, absEnd: 8 };
      const hasWork = !isNaN(workStart) && !isNaN(workEnd) && workStart < workEnd;
      return { type: parts[1], absStart, absEnd, ...(hasWork ? { workStart, workEnd } : {}) };
    }
    return null;
  }
  // Legacy: note was stored as the absence type directly (e.g. "vacaciones")
  if (KNOWN_ABS_TYPES.has(note)) return { type: note, absStart: 0, absEnd: 8 };
  return null;
}

/**
 * Given an employee's availability window, area bounds, and a partial absence window,
 * returns the actual work portion of the shift (shift = intersection of avail + area, minus absence).
 * Returns null if the absence covers the entire shift or no valid shift exists.
 */
export function computePartialAbsWorkHours(
  avail: { start: number; end: number },
  areaStart: number,
  areaEnd: number,
  absStart: number,
  absEnd: number,
): { start: number; end: number } | null {
  const shiftStart = Math.max(avail.start, areaStart);
  const shiftEnd   = Math.min(avail.end,   areaEnd);
  if (shiftStart >= shiftEnd) return null;
  // Absence doesn't overlap the shift at all → full shift is the work period
  if (absEnd <= shiftStart || absStart >= shiftEnd) return { start: shiftStart, end: shiftEnd };
  // Absence covers entire shift
  if (absStart <= shiftStart && absEnd >= shiftEnd) return null;
  // Absence at the end → work before absence
  if (absStart > shiftStart) return { start: shiftStart, end: absStart };
  // Absence at the start → work after absence
  return { start: absEnd, end: shiftEnd };
}

export function detectCode(start: number, end: number, dateISO: string, breakMinutes = 60, maxHoursDay = 8): NoveltyCode {
  if (end <= start) return "OFF";
  const duration = Math.max(0, end - start - breakMinutes / 60);
  if (duration <= 0) return "OFF";
  const dow = new Date(dateISO + "T00:00:00").getDay();
  const holiday = dow === 0 || isHoliday(dateISO);
  const nightH = nightHours(start, end);
  const isNight = nightH > 0;
  const isExtra = duration > maxHoursDay;
  if (holiday && isExtra && isNight) return "HENF";
  if (holiday && isExtra) return "HEDF";
  if (holiday && isNight) return "RNF";
  if (holiday) return "RDF";
  if (isExtra && isNight) return "HEN";
  if (isExtra) return "HED";
  if (isNight) return "RN";
  return "STD";
}

/**
 * Determina si una fecha es festivo en Colombia.
 * Primero consulta los overrides cargados desde DB (setHolidayOverrides),
 * luego el algoritmo automático (Ley Emiliani + Semana Santa + fijos).
 */
export function isHoliday(dateStr: string): boolean {
  if (Object.prototype.hasOwnProperty.call(_overrides, dateStr)) {
    return _overrides[dateStr];
  }
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (!holidayCache.has(year)) holidayCache.set(year, buildHolidays(year));
  return holidayCache.get(year)!.has(dateStr);
}

export function isSundayOrHoliday(dateStr: string): boolean {
  return isSunday(dateStr) || isHoliday(dateStr);
}

/** Retorna el set de festivos automáticos para un año (sin overrides). */
export function getHolidaysForYear(year: number): Set<string> {
  if (!holidayCache.has(year)) holidayCache.set(year, buildHolidays(year));
  return holidayCache.get(year)!;
}

/** Returns hours within [start,end) that fall into night window (21-06). */
function nightHours(start: number, end: number): number {
  let n = 0;
  for (let h = start; h < end; h++) {
    const hh = ((h % 24) + 24) % 24;
    if (hh >= NIGHT_START || hh < NIGHT_END) n++;
  }
  return n;
}

export function shiftBreakdown(shift: Shift, area?: Area): NoveltyBreakdown {
  const empty: NoveltyBreakdown = {
    std: 0, HED: 0, HEN: 0, HEDF: 0, HENF: 0, RN: 0, RDF: 0, RNF: 0, total: 0,
  };
  if (shift.code === "OFF") return empty;
  // ABS: only include breakdown if extra work hours were programmed on top of the absence
  if (shift.code === "ABS" && shift.start === 0 && shift.end === 0) return empty;

  const totalHours = Math.max(0, shift.end - shift.start - shift.breakMinutes / 60);
  if (totalHours <= 0) return empty;

  const sundayOrHoliday = isSunday(shift.date) || isHoliday(shift.date);

  const maxStd = area?.maxHoursDay ?? 8;
  const stdHours = Math.min(totalHours, maxStd);
  const extra = totalHours - stdHours;

  // Sequential: std fills the first maxStd worked hours; break assumed within std block.
  // Using sub-range nightHours avoids the proportional error and caps correctly (Bug 1 & 2).
  const stdClockEnd = shift.start + stdHours + shift.breakMinutes / 60;
  const nightInStd  = Math.min(stdHours, nightHours(shift.start, Math.min(stdClockEnd, shift.end)));
  const nightInExtra = Math.min(extra,   nightHours(Math.min(stdClockEnd, shift.end), shift.end));

  const b: NoveltyBreakdown = { ...empty };
  b.std   = round2(stdHours);
  b.total = round2(totalHours);

  if (sundayOrHoliday) {
    b.RDF  = round2(stdHours  - nightInStd);
    b.RNF  = round2(nightInStd);
    b.HEDF = round2(extra     - nightInExtra);
    b.HENF = round2(nightInExtra);
  } else {
    b.RN  = round2(nightInStd);
    b.HED = round2(extra - nightInExtra);
    b.HEN = round2(nightInExtra);
  }
  return b;
}

export function sumBreakdowns(list: NoveltyBreakdown[]): NoveltyBreakdown {
  return list.reduce<NoveltyBreakdown>((a, b) => ({
    std: round2(a.std + b.std),
    HED: round2(a.HED + b.HED),
    HEN: round2(a.HEN + b.HEN),
    HEDF: round2(a.HEDF + b.HEDF),
    HENF: round2(a.HENF + b.HENF),
    RN: round2(a.RN + b.RN),
    RDF: round2(a.RDF + b.RDF),
    RNF: round2(a.RNF + b.RNF),
    total: round2(a.total + b.total),
  }), { std:0,HED:0,HEN:0,HEDF:0,HENF:0,RN:0,RDF:0,RNF:0,total:0 });
}

function round2(n: number) { return Math.round(n * 100) / 100; }

export function fmtHours(n: number): string {
  if (!n) return "—";
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`;
}

export function codeColor(code: string): { bg: string; fg: string; label: string } {
  switch (code) {
    case "STD":  return { bg: "bg-gray-100",    fg: "text-gray-600",        label: "Estándar" };
    case "HED":  return { bg: "bg-red-100",     fg: "text-red-600",         label: "Extra diurna" };
    case "HEN":  return { bg: "bg-rose-100",    fg: "text-rose-800",        label: "Extra nocturna" };
    case "HEDF": return { bg: "bg-red-200",     fg: "text-red-700",         label: "Extra dom. diurna" };
    case "HENF": return { bg: "bg-rose-200",    fg: "text-rose-900",        label: "Extra dom. nocturna" };
    case "RN":   return { bg: "bg-cyan-100",    fg: "text-cyan-700",        label: "Recargo nocturno" };
    case "RDF":  return { bg: "bg-yellow-100",  fg: "text-yellow-700",      label: "Recargo dominical" };
    case "RNF":  return { bg: "bg-yellow-100",  fg: "text-yellow-700",      label: "Recargo noc. dom." };
    case "OFF":  return { bg: "bg-muted",       fg: "text-muted-foreground", label: "Descanso" };
    case "ABS":  return { bg: "bg-amber-100",   fg: "text-amber-700",       label: "Ausencia" };
    default:     return { bg: "bg-secondary",   fg: "text-foreground",      label: code };
  }
}
