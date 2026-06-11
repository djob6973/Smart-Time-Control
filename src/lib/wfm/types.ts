export type AreaId = string;
export type EmployeeId = string;

export interface CoverageRequirement {
  dayOfWeek: number;       // 0=Sun..6=Sat
  startHour: number;       // 0-23
  endHour: number;         // 0-24
  minWorkers: number;      // Mínimo de trabajadores requeridos
  preferredWorkers?: number; // Preferido (si hay suficientes)
}

export interface Area {
  id: AreaId;
  name: string;
  leader: string;
  startHour: number;       // 0-23
  endHour: number;         // 0-24
  workingDays: number[];   // 0=Sun..6=Sat
  maxHoursDay: number;
  maxHoursWeek: number;
  maxHoursMonth: number;
  allowOvertime: boolean;
  allowSunday: boolean;
  minRestHours: number;
  coverageRequirements: CoverageRequirement[]; // Requisitos de cobertura por día/horario
  enableCoverageMode: boolean; // Activar modo basado en cobertura
}

export interface Availability {
  // day 0..6 -> [startHour, endHour] or null (unavailable)
  [day: number]: { start: number; end: number } | null;
}

export interface Employee {
  id: EmployeeId;
  fullName: string;
  documentId: string;
  position: string;
  areaId: AreaId;
  leader: string;
  status: "active" | "inactive";
  contractType: "indefinido" | "fijo" | "obra" | "aprendiz";
  hireDate: string;
  availability: Availability;
}

export type AbsenceType =
  | "vacaciones"
  | "incapacidad"
  | "licencia"
  | "permiso"
  | "no_remunerada"
  | "compensatorio";

export type AbsenceStatus = "pendiente" | "aprobada" | "rechazada";

export interface Absence {
  id: string;
  employeeId: EmployeeId;
  type: AbsenceType;
  startDate: string; // ISO date
  endDate: string;
  startHour?: number;
  endHour?: number;
  reason: string;
  status?: AbsenceStatus;
}

export type NoveltyCode =
  | "STD"   // estándar
  | "HED"
  | "HEN"
  | "HEDF"
  | "HENF"
  | "RN"
  | "RDF"
  | "RNF"
  | "OFF"   // descanso
  | "ABS";  // ausencia

export interface Shift {
  id: string;
  employeeId: EmployeeId;
  date: string;        // YYYY-MM-DD
  start: number;       // hour 0..24
  end: number;         // hour 0..24
  breakMinutes: number;
  code: NoveltyCode;
  locked?: boolean;
  note?: string;
}

export interface ShiftHistory {
  id: string;
  shiftId: string;
  employeeId: string;
  date: string;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: string;
  startHour: number;
  endHour: number;
  breakMinutes: number;
  code: NoveltyCode;
  locked: boolean;
  note: string | null;
}

export interface NoveltyBreakdown {
  std: number;
  HED: number;
  HEN: number;
  HEDF: number;
  HENF: number;
  RN: number;
  RDF: number;
  RNF: number;
  total: number;
}
