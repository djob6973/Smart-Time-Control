import { create } from "zustand";
import type {
  JornadaRegistro,
  JornadaModificacion,
  JornadaHorario,
  JornadaHorarioEmpleado,
  JornadaCupo,
  JornadaConfiguracion,
  EstadoEmpleado,
  EstadoJornadaEmpleado,
  TipoMovimiento,
} from "./types";
import * as db from "./db";
import type { Shift } from "@/lib/wfm/types";

interface JornadaState {
  registros: JornadaRegistro[];
  modificaciones: JornadaModificacion[];
  horarios: JornadaHorario[];
  horariosEmpleado: JornadaHorarioEmpleado[];
  cupos: JornadaCupo[];
  configuracion: JornadaConfiguracion[];

  initialized: boolean;
  loading: boolean;
  fechaActiva: string; // YYYY-MM-DD viewed date

  initFromDB: (fecha?: string) => Promise<void>;
  setFechaActiva: (fecha: string) => void;
  reloadRegistros: (fecha: string) => Promise<void>;
  loadRango: (desde: string, hasta: string) => Promise<void>;

  // Registro de movimientos
  registrarMovimiento: (
    employeeId: string,
    tipo: TipoMovimiento,
    areaId: string | undefined,
    usuarioId: string,
    observaciones?: string,
  ) => Promise<{ ok: boolean; error?: string }>;

  // Modificación manual
  editarRegistro: (
    registro: JornadaRegistro,
    nuevaHora: string,
    motivo: string,
    usuarioId: string,
  ) => Promise<void>;
  eliminarRegistro: (id: string, motivo: string, usuarioId: string) => Promise<void>;
  agregarRegistroManual: (
    r: Omit<JornadaRegistro, "id" | "createdAt">,
    motivo: string,
    usuarioId: string,
  ) => Promise<void>;

  // Horarios
  upsertHorario: (h: JornadaHorario) => void;
  removeHorario: (id: string) => void;
  asignarHorario: (he: JornadaHorarioEmpleado) => void;

  // Cupos
  upsertCupo: (c: JornadaCupo) => Promise<void>;
  removeCupo: (id: string) => void;

  // Configuración
  upsertConfiguracion: (c: JornadaConfiguracion) => Promise<void>;

  // Computed helpers
  getEstadoEmpleado: (employeeId: string, fecha: string, shiftStart?: number | null) => EstadoJornadaEmpleado;
  getRegistrosDia: (employeeId: string, fecha: string) => JornadaRegistro[];
  getCuposDisponibles: (
    areaId: string | undefined,
    tipo: "break" | "almuerzo",
    fecha: string,
  ) => { max: number; enUso: number; disponibles: number };
  
  // Sincronización con scheduler
  getShiftProgramado: (employeeId: string, fecha: string, shifts: Shift[]) => Shift | null;
}

function computeEstado(
  registros: JornadaRegistro[],
  config: JornadaConfiguracion | undefined,
  fecha: string,
  horario?: JornadaHorario,
  shiftHoraEntrada?: string, // hora de inicio del turno WFM ("HH:MM"), usado cuando no hay horario jornada
): Pick<EstadoJornadaEmpleado, "estado" | "ultimoMovimiento" | "horaUltimoMovimiento" | "tiempoEnBreakMin" | "tiempoEnAlmuerzoMin" | "minutosEnJornada" | "esTarde" | "minutosRetraso" | "breakExcedido" | "almuerzoExcedido" | "jornadaExcedida"> {
  const sorted = [...registros].sort(
    (a, b) => new Date(a.horaExacta).getTime() - new Date(b.horaExacta).getTime(),
  );
  const ultimo = sorted[sorted.length - 1];

  const now = new Date();
  // Usar fecha LOCAL (no UTC) para evitar desfases en zonas UTC-N como Colombia
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const esFechaActual = fecha === hoy;
  const toleranciaMin = config?.toleranciaLlegadaMin ?? 15;
  // Normalizar a HH:MM (la DB puede guardar "HH:MM:SS")
  const toHHMM = (t: string) => t.slice(0, 5);
  // Prioridad: horario asignado al empleado > config global
  const horaInicioStr = toHHMM(horario?.horaEntrada ?? shiftHoraEntrada ?? config?.horaInicioJornada ?? "08:00");
  const horaInicioMs = new Date(`${fecha}T${horaInicioStr}:00`).getTime() + toleranciaMin * 60000;

  let estado: EstadoEmpleado = "pendiente_ingreso";
  let esTarde = false;

  // Para fechas pasadas sin salida registrada usamos fin de día (23:59) como referencia,
  // no el tiempo actual, para evitar métricas absurdas en registros históricos.
  const refTime = esFechaActual ? now.getTime() : new Date(`${fecha}T23:59:59`).getTime();

  if (sorted.length === 0) {
    // Solo evaluar tardanza si hay un horario de jornada o turno WFM explícito.
    const tieneReferencia = !!horario || !!shiftHoraEntrada;
    if (!tieneReferencia) {
      estado = "sin_turno";
    } else if (refTime > horaInicioMs) {
      estado = "tarde";
      esTarde = esFechaActual;
    } else {
      estado = "pendiente_ingreso";
    }
  } else {
    const tipo = ultimo.tipoMovimiento;
    if (tipo === "salida") {
      estado = "fuera_jornada";
    } else if (tipo === "salida_break") {
      estado = esFechaActual ? "en_break" : "fuera_jornada";
    } else if (tipo === "salida_almuerzo") {
      estado = esFechaActual ? "en_almuerzo" : "fuera_jornada";
    } else {
      estado = esFechaActual ? "en_jornada" : "fuera_jornada";
    }
    const entrada = sorted.find((r) => r.tipoMovimiento === "entrada");
    if (entrada) {
      const entradaTime = new Date(entrada.horaExacta).getTime();
      const limite = new Date(`${fecha}T${horaInicioStr}:00`).getTime() + toleranciaMin * 60000;
      esTarde = entradaTime > limite;
    }
  }

  // Minutos de retraso respecto a horaInicio (sin contar tolerancia)
  let minutosRetraso = 0;
  if (esTarde) {
    const entrada = sorted.find((r) => r.tipoMovimiento === "entrada");
    if (entrada) {
      const entradaTime = new Date(entrada.horaExacta).getTime();
      const horaInicioExacta = new Date(`${fecha}T${horaInicioStr}:00`).getTime();
      minutosRetraso = Math.floor((entradaTime - horaInicioExacta) / 60000);
    } else if (esFechaActual) {
      // Aún no entró hoy: retraso desde horaInicio hasta ahora
      const horaInicioExacta = new Date(`${fecha}T${horaInicioStr}:00`).getTime();
      minutosRetraso = Math.floor((now.getTime() - horaInicioExacta) / 60000);
    }
  }

  // Tiempo en break
  let tiempoEnBreakMin = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].tipoMovimiento === "salida_break") {
      const fin = sorted.find(
        (r, j) => j > i && r.tipoMovimiento === "regreso_break",
      );
      const salida = new Date(sorted[i].horaExacta).getTime();
      const regreso = fin ? new Date(fin.horaExacta).getTime() : refTime;
      tiempoEnBreakMin += Math.floor((regreso - salida) / 60000);
    }
  }

  // Tiempo en almuerzo
  let tiempoEnAlmuerzoMin = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].tipoMovimiento === "salida_almuerzo") {
      const fin = sorted.find(
        (r, j) => j > i && r.tipoMovimiento === "regreso_almuerzo",
      );
      const salida = new Date(sorted[i].horaExacta).getTime();
      const regreso = fin ? new Date(fin.horaExacta).getTime() : refTime;
      tiempoEnAlmuerzoMin += Math.floor((regreso - salida) / 60000);
    }
  }

  // Minutos en jornada (desde entrada hasta salida o refTime)
  let minutosEnJornada = 0;
  const entrada = sorted.find((r) => r.tipoMovimiento === "entrada");
  if (entrada) {
    const salidaFinal = sorted.find((r) => r.tipoMovimiento === "salida");
    const fin = salidaFinal ? new Date(salidaFinal.horaExacta).getTime() : refTime;
    minutosEnJornada = Math.floor(
      (fin - new Date(entrada.horaExacta).getTime()) / 60000,
    );
  }

  const tiempoMaxBreakMin = config?.tiempoMaxBreakMin ?? 15;
  const tiempoMaxAlmuerzoMin = config?.tiempoMaxAlmuerzoMin ?? 60;
  // Prioridad: horario asignado al empleado > config global
  const horaFinStr = toHHMM(horario?.horaSalida ?? config?.horaFinJornada ?? "22:00");
  const horaFinMs = new Date(`${fecha}T${horaFinStr}:00`).getTime();

  const breakExcedido = tiempoEnBreakMin > tiempoMaxBreakMin;
  const almuerzoExcedido = tiempoEnAlmuerzoMin > tiempoMaxAlmuerzoMin;
  const jornadaExcedida =
    esFechaActual &&
    now.getTime() > horaFinMs &&
    (estado === "en_jornada" || estado === "en_break" || estado === "en_almuerzo");

  return {
    estado,
    ultimoMovimiento: ultimo?.tipoMovimiento,
    horaUltimoMovimiento: ultimo?.horaExacta,
    tiempoEnBreakMin,
    tiempoEnAlmuerzoMin,
    minutosEnJornada,
    esTarde,
    minutosRetraso,
    breakExcedido,
    almuerzoExcedido,
    jornadaExcedida,
  };
}

export const useJornada = create<JornadaState>()((set, get) => ({
  registros: [],
  modificaciones: [],
  horarios: [],
  horariosEmpleado: [],
  cupos: [],
  configuracion: [],
  initialized: false,
  loading: false,
  fechaActiva: (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; })(),

  initFromDB: async (fecha) => {
    set({ loading: true });
    try {
      const now = new Date();
      const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const hoy = fecha ?? localToday;
      // Modificaciones: últimos 90 días para no traer toda la historia
      const desde90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const desde90str = `${desde90.getFullYear()}-${String(desde90.getMonth() + 1).padStart(2, "0")}-${String(desde90.getDate()).padStart(2, "0")}`;
      const [registros, modificaciones, horarios, horariosEmpleado, cupos, configuracion] = await Promise.all([
        db.fetchRegistros(hoy),
        db.fetchModificaciones(undefined, desde90str),
        db.fetchHorarios(),
        db.fetchHorariosEmpleado(),
        db.fetchCupos(),
        db.fetchConfiguracion(),
      ]);
      set({ registros, modificaciones, horarios, horariosEmpleado, cupos, configuracion, initialized: true, fechaActiva: hoy });
    } finally {
      set({ loading: false });
    }
  },

  setFechaActiva: (fecha) => {
    set({ fechaActiva: fecha });
    get().reloadRegistros(fecha);
  },

  reloadRegistros: async (fecha) => {
    const data = await db.fetchRegistros(fecha);
    set((s) => ({
      registros: [
        ...s.registros.filter((r) => r.fecha !== fecha),
        ...data,
      ],
    }));
  },

  loadRango: async (desde, hasta) => {
    const data = await db.fetchRegistrosRango(desde, hasta);
    set((s) => {
      const existingIds = new Set(s.registros.map((r) => r.id));
      const nuevos = data.filter((r) => !existingIds.has(r.id));
      return nuevos.length > 0 ? { registros: [...s.registros, ...nuevos] } : s;
    });
  },

  registrarMovimiento: async (employeeId, tipo, areaId, usuarioId, observaciones) => {
    const config = get().configuracion.find((c) => !c.areaId) ?? get().configuracion[0];
    if (config?.diasLaborales?.length && !config.diasLaborales.includes(new Date().getDay())) {
      return { ok: false, error: "Hoy no es un día laboral según la configuración." };
    }

    const { registros } = get();
    const nowLocal = new Date();
    const hoy = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, "0")}-${String(nowLocal.getDate()).padStart(2, "0")}`;
    const registrosHoy = registros.filter(
      (r) => r.employeeId === employeeId && r.fecha === hoy,
    );

    // Validate no duplicate movement
    const yaExiste = registrosHoy.some((r) => r.tipoMovimiento === tipo);
    if (yaExiste && tipo === "entrada") {
      return { ok: false, error: "Ya existe una entrada registrada para hoy." };
    }

    if (tipo === "salida_break") {
      const maxBreaks = config?.maxBreaksPorJornada ?? 2;
      const breaks = registrosHoy.filter((r) => r.tipoMovimiento === "salida_break").length;
      if (breaks >= maxBreaks) {
        return { ok: false, error: `Ya se han usado los ${maxBreaks} break${maxBreaks !== 1 ? "s" : ""} permitidos por jornada.` };
      }
    }
    if (tipo === "salida_almuerzo") {
      const maxAlmuerzos = config?.maxAlmuerzosPorJornada ?? 1;
      const almuerzos = registrosHoy.filter((r) => r.tipoMovimiento === "salida_almuerzo").length;
      if (almuerzos >= maxAlmuerzos) {
        return { ok: false, error: `Ya se ${maxAlmuerzos === 1 ? "ha usado el almuerzo permitido" : `han usado los ${maxAlmuerzos} almuerzos permitidos`} para esta jornada.` };
      }
    }

    // Validate flow
    const sorted = [...registrosHoy].sort(
      (a, b) => new Date(a.horaExacta).getTime() - new Date(b.horaExacta).getTime(),
    );
    const ultimo = sorted[sorted.length - 1]?.tipoMovimiento;

    const flujoValido: Record<string, TipoMovimiento[]> = {
      entrada: [],
      salida_break: ["entrada", "regreso_break", "regreso_almuerzo"],
      regreso_break: ["salida_break"],
      salida_almuerzo: ["entrada", "regreso_break", "regreso_almuerzo"],
      regreso_almuerzo: ["salida_almuerzo"],
      salida: ["entrada", "regreso_break", "regreso_almuerzo"],
    };

    const prevAllow = flujoValido[tipo] ?? [];
    if (prevAllow.length > 0 && (!ultimo || !prevAllow.includes(ultimo as TipoMovimiento))) {
      return { ok: false, error: `No se puede registrar '${tipo}' en el estado actual.` };
    }

    // Check cupo limits for break / almuerzo
    if (tipo === "salida_break" || tipo === "salida_almuerzo") {
      const cupoTipo = tipo === "salida_break" ? "break" : "almuerzo";
      const { max, enUso } = get().getCuposDisponibles(areaId, cupoTipo, hoy);
      if (max > 0 && enUso >= max) {
        return {
          ok: false,
          error: `No es posible iniciar ${cupoTipo}. El límite simultáneo permitido para el área ya fue alcanzado (${max} personas).`,
        };
      }
    }

    try {
      const nuevo = await db.insertRegistro({
        employeeId,
        fecha: hoy,
        horaExacta: new Date().toISOString(),
        tipoMovimiento: tipo,
        areaId,
        usuarioRegistroId: usuarioId,
        observaciones,
        estado: "valido",
        esModificacion: false,
      });
      set((s) => ({ registros: [...s.registros, nuevo] }));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Error al registrar." };
    }
  },

  editarRegistro: async (registro, nuevaHora, motivo, usuarioId) => {
    const config = get().configuracion.find((c) => !c.areaId) ?? get().configuracion[0];
    const estadoResultante = config?.requiereAprobacionEdicion ? "pendiente" : "modificado";
    const actualizado: JornadaRegistro = {
      ...registro,
      horaExacta: nuevaHora,
      estado: estadoResultante,
      esModificacion: true,
    };
    set((s) => ({
      registros: s.registros.map((r) => (r.id === registro.id ? actualizado : r)),
    }));
    await db.updateRegistro(actualizado);
    await db.insertModificacion({
      registroId: registro.id,
      usuarioId,
      motivo,
      campoModificado: "hora_exacta",
      valorAnterior: registro.horaExacta,
      valorNuevo: nuevaHora,
    });
    const mods = await db.fetchModificaciones(registro.id);
    set((s) => ({
      modificaciones: [
        ...s.modificaciones.filter((m) => m.registroId !== registro.id),
        ...mods,
      ],
    }));
  },

  eliminarRegistro: async (id, motivo, usuarioId) => {
    const registro = get().registros.find((r) => r.id === id);
    if (!registro) return;
    set((s) => ({ registros: s.registros.filter((r) => r.id !== id) }));
    await db.insertModificacion({
      registroId: id,
      usuarioId,
      motivo,
      campoModificado: "eliminado",
      valorAnterior: registro.horaExacta,
      valorNuevo: undefined,
    });
    await db.deleteRegistro(id);
  },

  agregarRegistroManual: async (r, motivo, usuarioId) => {
    const config = get().configuracion.find((c) => !c.areaId) ?? get().configuracion[0];
    const estadoResultante = config?.requiereAprobacionEdicion ? "pendiente" : "modificado";
    const nuevo = await db.insertRegistro({ ...r, esModificacion: true, estado: estadoResultante });
    set((s) => ({ registros: [...s.registros, nuevo] }));
    await db.insertModificacion({
      registroId: nuevo.id,
      usuarioId,
      motivo,
      campoModificado: "registro_manual",
      valorAnterior: undefined,
      valorNuevo: nuevo.horaExacta,
    });
  },

  upsertHorario: (h) => {
    set((s) => ({
      horarios: s.horarios.some((x) => x.id === h.id)
        ? s.horarios.map((x) => (x.id === h.id ? h : x))
        : [...s.horarios, h],
    }));
    db.upsertHorario(h).catch(console.error);
  },

  removeHorario: (id) => {
    set((s) => ({ horarios: s.horarios.filter((h) => h.id !== id) }));
    db.deleteHorario(id).catch(console.error);
  },

  asignarHorario: (he) => {
    set((s) => ({
      horariosEmpleado: s.horariosEmpleado.some((x) => x.id === he.id)
        ? s.horariosEmpleado.map((x) => (x.id === he.id ? he : x))
        : [...s.horariosEmpleado, he],
    }));
    db.upsertHorarioEmpleado(he).catch(console.error);
  },

  upsertCupo: async (c) => {
    set((s) => ({
      cupos: s.cupos.some((x) => x.id === c.id)
        ? s.cupos.map((x) => (x.id === c.id ? c : x))
        : [...s.cupos, c],
    }));
    await db.upsertCupo(c);
  },

  removeCupo: (id) => {
    set((s) => ({ cupos: s.cupos.filter((c) => c.id !== id) }));
    db.deleteCupo(id).catch(console.error);
  },

  upsertConfiguracion: async (c) => {
    set((s) => ({
      configuracion: s.configuracion.some((x) => x.id === c.id)
        ? s.configuracion.map((x) => (x.id === c.id ? c : x))
        : [...s.configuracion, c],
    }));
    await db.upsertConfiguracion(c);
  },

  getRegistrosDia: (employeeId, fecha) =>
    get().registros.filter((r) => r.employeeId === employeeId && r.fecha === fecha),

  getEstadoEmpleado: (employeeId, fecha, shiftStart) => {
    const registros = get().getRegistrosDia(employeeId, fecha);
    const config = get().configuracion.find((c) => !c.areaId) ?? get().configuracion[0];

    // Buscar horario asignado al empleado vigente en esa fecha
    const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
    const asignacion = get().horariosEmpleado.find(
      (x) => x.employeeId === employeeId && x.activo &&
        x.fechaInicio <= fecha && (!x.fechaFin || x.fechaFin >= fecha),
    );
    const horario = asignacion
      ? get().horarios.find(
          (h) => h.id === asignacion.horarioId && h.activo && h.diasAplicables.includes(diaSemana),
        )
      : undefined;

    // Si no hay horario jornada pero sí hay turno WFM, usarlo como referencia de hora de entrada
    const shiftHoraEntrada =
      !horario && shiftStart != null
        ? `${String(shiftStart).padStart(2, "0")}:00`
        : undefined;

    const resultado = computeEstado(registros, config, fecha, horario, shiftHoraEntrada);
    return { employeeId, fecha, ...resultado };
  },

  getCuposDisponibles: (areaId, tipo, fecha) => {
    const { cupos, registros } = get();
    const cupo = cupos.find(
      (c) => c.tipo === tipo && c.activo && (!c.areaId || c.areaId === areaId),
    );
    if (!cupo) return { max: 0, enUso: 0, disponibles: 999 };

    const tipoSalida = tipo === "break" ? "salida_break" : "salida_almuerzo";

    const enUso = registros.filter((r) => {
      if (r.fecha !== fecha) return false;
      const empRegs = registros
        .filter((x) => x.employeeId === r.employeeId && x.fecha === fecha)
        .sort((a, b) => new Date(a.horaExacta).getTime() - new Date(b.horaExacta).getTime());
      const last = empRegs[empRegs.length - 1];
      return last?.tipoMovimiento === tipoSalida;
    });

    const count = new Set(enUso.map((r) => r.employeeId)).size;
    return {
      max: cupo.maxSimultaneos,
      enUso: count,
      disponibles: Math.max(0, cupo.maxSimultaneos - count),
    };
  },

  getShiftProgramado: (employeeId, fecha, shifts) => {
    return shifts.find(s => s.employeeId === employeeId && s.date === fecha) || null;
  },
}));
