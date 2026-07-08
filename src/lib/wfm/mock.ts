import type { Area, Employee, Absence, Shift, Availability } from "./types";
import { toISO, startOfWeek, addDays } from "./date";

const fullAvail = (s = 8, e = 18, allowSunday = false): Availability => ({
  0: allowSunday ? { start: s, end: e } : null,
  1: { start: s, end: e }, 2: { start: s, end: e }, 3: { start: s, end: e },
  4: { start: s, end: e }, 5: { start: s, end: e }, 6: { start: s, end: e },
});

export const seedAreas: Area[] = [
  { 
    id: "tq",
    name: "T&Q",
    leader: "María González",
    startHour: 7,
    endHour: 19,
    workingDays: [1,2,3,4,5,6],
    maxHoursDay: 8,
    maxHoursWeek: 46,
    maxHoursMonth: 192,
    allowOvertime: true,
    allowSunday: false,
    minRestHours: 12,
    holidaySchedule: { active: false, start: 8, end: 18 },
    coverageRequirements: [
      { dayOfWeek: 1, startHour: 7, endHour: 19, minWorkers: 3, preferredWorkers: 4 },
      { dayOfWeek: 2, startHour: 7, endHour: 19, minWorkers: 3, preferredWorkers: 4 },
      { dayOfWeek: 3, startHour: 7, endHour: 19, minWorkers: 3, preferredWorkers: 4 },
      { dayOfWeek: 4, startHour: 7, endHour: 19, minWorkers: 3, preferredWorkers: 4 },
      { dayOfWeek: 5, startHour: 7, endHour: 19, minWorkers: 3, preferredWorkers: 4 },
      { dayOfWeek: 6, startHour: 7, endHour: 14, minWorkers: 2, preferredWorkers: 3 },
    ],
    enableCoverageMode: false,
  },
  { 
    id: "ops",
    name: "Operaciones",
    leader: "Carlos Ruiz",
    startHour: 6,
    endHour: 22,
    workingDays: [1,2,3,4,5,6,0],
    maxHoursDay: 8,
    maxHoursWeek: 48,
    maxHoursMonth: 200,
    allowOvertime: true,
    allowSunday: true,
    minRestHours: 12,
    holidaySchedule: { active: false, start: 8, end: 18 },
    coverageRequirements: [
      { dayOfWeek: 1, startHour: 6,  endHour: 14, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 1, startHour: 14, endHour: 22, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 2, startHour: 6,  endHour: 14, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 2, startHour: 14, endHour: 22, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 3, startHour: 6,  endHour: 14, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 3, startHour: 14, endHour: 22, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 4, startHour: 6,  endHour: 14, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 4, startHour: 14, endHour: 22, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 5, startHour: 6,  endHour: 14, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 5, startHour: 14, endHour: 22, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 6, startHour: 6,  endHour: 14, minWorkers: 1, preferredWorkers: 2 },
      { dayOfWeek: 6, startHour: 14, endHour: 22, minWorkers: 1, preferredWorkers: 2 },
      { dayOfWeek: 0, startHour: 8,  endHour: 16, minWorkers: 1, preferredWorkers: 2 },
    ],
    enableCoverageMode: true,
  },
  { 
    id: "sop",
    name: "Soporte",
    leader: "Laura Pérez",
    startHour: 8,
    endHour: 20,
    workingDays: [1,2,3,4,5,6],
    maxHoursDay: 8,
    maxHoursWeek: 44,
    maxHoursMonth: 184,
    allowOvertime: true,
    allowSunday: false,
    minRestHours: 12,
    holidaySchedule: { active: false, start: 8, end: 18 },
    coverageRequirements: [
      { dayOfWeek: 1, startHour: 8, endHour: 20, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 2, startHour: 8, endHour: 20, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 3, startHour: 8, endHour: 20, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 4, startHour: 8, endHour: 20, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 5, startHour: 8, endHour: 20, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 6, startHour: 8, endHour: 14, minWorkers: 1, preferredWorkers: 2 },
    ],
    enableCoverageMode: false,
  },
  { 
    id: "com",
    name: "Comercial",
    leader: "Andrés Castro",
    startHour: 8,
    endHour: 18,
    workingDays: [1,2,3,4,5],
    maxHoursDay: 8,
    maxHoursWeek: 40,
    maxHoursMonth: 176,
    allowOvertime: false,
    allowSunday: false,
    minRestHours: 12,
    holidaySchedule: { active: false, start: 8, end: 18 },
    coverageRequirements: [
      { dayOfWeek: 1, startHour: 8, endHour: 18, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 2, startHour: 8, endHour: 18, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 3, startHour: 8, endHour: 18, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 4, startHour: 8, endHour: 18, minWorkers: 2, preferredWorkers: 3 },
      { dayOfWeek: 5, startHour: 8, endHour: 18, minWorkers: 2, preferredWorkers: 3 },
    ],
    enableCoverageMode: false,
  },
];

const NAMES = [
  "Juan Pérez","Ana Rodríguez","Carlos Gómez","Lucía Martínez","Diego Herrera","Sofía Ramírez",
  "Pedro Jiménez","Valentina López","Mateo Torres","Camila Vargas","Andrés Mejía","Daniela Ortiz",
  "Felipe Cárdenas","Isabella Suárez","Sebastián Rojas","Manuela Gil","Tomás Beltrán","Laura Niño",
];

export const seedEmployees: Employee[] = NAMES.map((n, i) => {
  const area = seedAreas[i % seedAreas.length];
  return {
    id: `e${i + 1}`,
    fullName: n,
    documentId: String(1000000000 + i * 137),
    position: ["Analista","Operador","Especialista","Coordinador","Asesor"][i % 5],
    areaId: area.id,
    leader: area.leader,
    status: "active",
    contractType: i % 4 === 0 ? "fijo" : "indefinido",
    hireDate: `2023-0${(i % 9) + 1}-15`,
    availability: fullAvail(area.startHour, area.endHour, area.allowSunday),
  };
});

export const seedAbsences: Absence[] = [
  { id: "a1", employeeId: "e3", type: "vacaciones", startDate: toISO(addDays(new Date(), 2)), endDate: toISO(addDays(new Date(), 6)), reason: "Vacaciones programadas" },
  { id: "a2", employeeId: "e7", type: "incapacidad", startDate: toISO(addDays(new Date(), 1)), endDate: toISO(addDays(new Date(), 1)), reason: "Incapacidad médica" },
];

export function seedShifts(): Shift[] {
  const ws = startOfWeek(new Date());
  const out: Shift[] = [];
  seedEmployees.forEach((e, idx) => {
    for (let d = 0; d < 7; d++) {
      const date = toISO(addDays(ws, d));
      const isSat = d === 5;
      const isSun = d === 6;
      const area = seedAreas.find(a => a.id === e.areaId);
      
      // Domingo: solo si el área permite
      if (isSun && !area?.allowSunday) {
        out.push({ id: `${e.id}-${date}`, employeeId: e.id, date, start: 0, end: 0, breakMinutes: 0, code: "OFF" });
        continue;
      }
      
      // Sábado: rotación menos agresiva (33% en lugar de 50%)
      if (isSat && idx % 3 !== 0) {
        out.push({ id: `${e.id}-${date}`, employeeId: e.id, date, start: 0, end: 0, breakMinutes: 0, code: "OFF" });
        continue;
      }
      
      const start = 8 + (idx % 3);
      const end = start + 8 + (idx % 2 === 0 && d === 2 ? 2 : 0);
      out.push({
        id: `${e.id}-${date}`,
        employeeId: e.id,
        date,
        start,
        end,
        breakMinutes: 60,
        code: end - start > 8 ? "HED" : "STD",
      });
    }
  });
  return out;
}
