export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfWeek(d: Date): Date {
  const n = new Date(d);
  const day = n.getDay(); // 0 sun .. 6 sat
  const diff = -day; // sunday
  n.setDate(n.getDate() + diff);
  n.setHours(0, 0, 0, 0);
  return n;
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => { // D-S
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const DAY_FULL = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

export function fmtDate(iso: string): string {
  const [y,m,d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

// ISO 8601 week number (1-53), Monday-based, first week contains the year's first Thursday.
export function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}
