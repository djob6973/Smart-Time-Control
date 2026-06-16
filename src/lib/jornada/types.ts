export type TipoMovimiento =
  | "entrada"
  | "salida_break"
  | "regreso_break"
  | "salida_almuerzo"
  | "regreso_almuerzo"
  | "salida";

export type EstadoRegistro = "valido" | "modificado" | "pendiente" | "irregular";

export type TipoJornada =
  | "completa"
  | "media"
  | "rotativo"
  | "flexible"
  | "nocturno"
  | "especial";

export type EstadoEmpleado =
  | "en_jornada"
  | "en_break"
  | "en_almuerzo"
  | "fuera_jornada"
  | "ausente"
  | "tarde"
  | "pendiente_ingreso"
  | "sin_turno";

export interface JornadaRegistro {
  id: string;
  employeeId: string;
  fecha: string;          // YYYY-MM-DD
  horaExacta: string;     // ISO datetime
  tipoMovimiento: TipoMovimiento;
  areaId?: string;
  usuarioRegistroId?: string;
  observaciones?: string;
  estado: EstadoRegistro;
  esModificacion: boolean;
  registroOriginalId?: string;
  createdAt: string;
}

export interface JornadaModificacion {
  id: string;
  registroId: string;
  usuarioId: string;
  fechaModificacion: string;
  motivo: string;
  campoModificado?: string;
  valorAnterior?: string;
  valorNuevo?: string;
}

export interface JornadaHorario {
  id: string;
  nombre: string;
  tipoJornada: TipoJornada;
  horaEntrada?: string;   // HH:MM
  horaSalida?: string;
  breakInicio?: string;
  breakFin?: string;
  almuerzoInicio?: string;
  almuerzoFin?: string;
  diasAplicables: number[];
  areaId?: string;
  cargo?: string;
  turno?: string;
  activo: boolean;
}

export interface JornadaHorarioEmpleado {
  id: string;
  employeeId: string;
  horarioId: string;
  fechaInicio: string;
  fechaFin?: string;
  activo: boolean;
}

export interface JornadaCupo {
  id: string;
  areaId?: string;
  tipo: "break" | "almuerzo";
  maxSimultaneos: number;
  cargo?: string;
  turno?: string;
  horaInicio?: string;
  horaFin?: string;
  activo: boolean;
}

export interface JornadaConfiguracion {
  id: string;
  areaId?: string;
  toleranciaLlegadaMin: number;
  tiempoMaxBreakMin: number;
  tiempoMaxAlmuerzoMin: number;
  maxBreaksPorJornada: number;
  maxAlmuerzosPorJornada: number;
  diasLaborales: number[];
  horaInicioJornada: string;
  horaFinJornada: string;
  requiereAprobacionEdicion: boolean;
}

// Computed state per employee for a given day
export interface EstadoJornadaEmpleado {
  employeeId: string;
  fecha: string;
  estado: EstadoEmpleado;
  ultimoMovimiento?: TipoMovimiento;
  horaUltimoMovimiento?: string;
  tiempoEnBreakMin?: number;
  tiempoEnAlmuerzoMin?: number;
  minutosEnJornada?: number;
  esTarde: boolean;
  minutosRetraso: number; // 0 si no llegó tarde
  breakExcedido: boolean;
  almuerzoExcedido: boolean;
  jornadaExcedida: boolean;
}

export const TIPO_MOVIMIENTO_LABELS: Record<TipoMovimiento, string> = {
  entrada: "Entrada",
  salida_break: "Salida a Break",
  regreso_break: "Regreso de Break",
  salida_almuerzo: "Salida a Almuerzo",
  regreso_almuerzo: "Regreso de Almuerzo",
  salida: "Salida",
};

export const ESTADO_LABELS: Record<EstadoEmpleado, string> = {
  en_jornada: "En jornada",
  en_break: "En break",
  en_almuerzo: "En almuerzo",
  fuera_jornada: "Fuera de jornada",
  ausente: "Ausente",
  tarde: "Tarde",
  pendiente_ingreso: "Pendiente ingreso",
  sin_turno: "Sin turno programado",
};

export const ESTADO_COLORS: Record<EstadoEmpleado, string> = {
  en_jornada:        "bg-[color-mix(in_srgb,#1F8A5B_14%,transparent)] text-[#1F8A5B]",
  en_break:          "bg-[color-mix(in_srgb,#C98A00_16%,transparent)] text-[#9a6b00]",
  en_almuerzo:       "bg-primary/12 text-primary",
  fuera_jornada:     "bg-secondary text-muted-foreground",
  ausente:           "bg-primary/12 text-primary",
  tarde:             "bg-primary/12 text-primary",
  pendiente_ingreso: "bg-secondary text-muted-foreground",
  sin_turno:         "bg-secondary/60 text-muted-foreground/60",
};

// Valid transitions: what moves are allowed after each state
export const SIGUIENTES_MOVIMIENTOS: Record<EstadoEmpleado, TipoMovimiento[]> = {
  pendiente_ingreso: ["entrada"],
  tarde:             ["entrada"],
  ausente:           ["entrada"],
  en_jornada:        ["salida_break", "salida_almuerzo", "salida"],
  en_break:          ["regreso_break"],
  en_almuerzo:       ["regreso_almuerzo"],
  fuera_jornada:     [],
  sin_turno:         [],
};
