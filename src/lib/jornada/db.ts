import { supabase } from "@/lib/supabase";
import type {
  JornadaRegistro,
  JornadaModificacion,
  JornadaHorario,
  JornadaHorarioEmpleado,
  JornadaCupo,
  JornadaConfiguracion,
} from "./types";

// ── Mappers ────────────────────────────────────────────────

function registroFromDB(r: Record<string, unknown>): JornadaRegistro {
  return {
    id: r.id as string,
    employeeId: r.employee_id as string,
    fecha: r.fecha as string,
    horaExacta: r.hora_exacta as string,
    tipoMovimiento: r.tipo_movimiento as JornadaRegistro["tipoMovimiento"],
    areaId: r.area_id as string | undefined,
    usuarioRegistroId: r.usuario_registro_id as string | undefined,
    observaciones: r.observaciones as string | undefined,
    estado: r.estado as JornadaRegistro["estado"],
    esModificacion: (r.es_modificacion as boolean) ?? false,
    registroOriginalId: r.registro_original_id as string | undefined,
    createdAt: r.created_at as string,
  };
}

function registroToDB(r: Omit<JornadaRegistro, "id" | "createdAt"> & { id?: string }) {
  return {
    ...(r.id ? { id: r.id } : {}),
    employee_id: r.employeeId,
    fecha: r.fecha,
    hora_exacta: r.horaExacta,
    tipo_movimiento: r.tipoMovimiento,
    area_id: r.areaId ?? null,
    usuario_registro_id: r.usuarioRegistroId ?? null,
    observaciones: r.observaciones ?? null,
    estado: r.estado,
    es_modificacion: r.esModificacion,
    registro_original_id: r.registroOriginalId ?? null,
  };
}

function modificacionFromDB(r: Record<string, unknown>): JornadaModificacion {
  return {
    id: r.id as string,
    registroId: r.registro_id as string,
    usuarioId: r.usuario_id as string,
    fechaModificacion: r.fecha_modificacion as string,
    motivo: r.motivo as string,
    campoModificado: r.campo_modificado as string | undefined,
    valorAnterior: r.valor_anterior as string | undefined,
    valorNuevo: r.valor_nuevo as string | undefined,
  };
}

function horarioFromDB(r: Record<string, unknown>): JornadaHorario {
  return {
    id: r.id as string,
    nombre: r.nombre as string,
    tipoJornada: r.tipo_jornada as JornadaHorario["tipoJornada"],
    horaEntrada: r.hora_entrada as string | undefined,
    horaSalida: r.hora_salida as string | undefined,
    breakInicio: r.break_inicio as string | undefined,
    breakFin: r.break_fin as string | undefined,
    almuerzoInicio: r.almuerzo_inicio as string | undefined,
    almuerzoFin: r.almuerzo_fin as string | undefined,
    diasAplicables: (r.dias_aplicables as number[]) ?? [1, 2, 3, 4, 5],
    areaId: r.area_id as string | undefined,
    cargo: r.cargo as string | undefined,
    turno: r.turno as string | undefined,
    activo: (r.activo as boolean) ?? true,
  };
}

function horarioToDB(h: JornadaHorario) {
  return {
    id: h.id,
    nombre: h.nombre,
    tipo_jornada: h.tipoJornada,
    hora_entrada: h.horaEntrada ?? null,
    hora_salida: h.horaSalida ?? null,
    break_inicio: h.breakInicio ?? null,
    break_fin: h.breakFin ?? null,
    almuerzo_inicio: h.almuerzoInicio ?? null,
    almuerzo_fin: h.almuerzoFin ?? null,
    dias_aplicables: h.diasAplicables,
    area_id: h.areaId ?? null,
    cargo: h.cargo ?? null,
    turno: h.turno ?? null,
    activo: h.activo,
  };
}

function horarioEmpleadoFromDB(r: Record<string, unknown>): JornadaHorarioEmpleado {
  return {
    id: r.id as string,
    employeeId: r.employee_id as string,
    horarioId: r.horario_id as string,
    fechaInicio: r.fecha_inicio as string,
    fechaFin: r.fecha_fin as string | undefined,
    activo: (r.activo as boolean) ?? true,
  };
}

function cupoFromDB(r: Record<string, unknown>): JornadaCupo {
  return {
    id: r.id as string,
    areaId: r.area_id as string | undefined,
    tipo: r.tipo as "break" | "almuerzo",
    maxSimultaneos: r.max_simultaneos as number,
    cargo: r.cargo as string | undefined,
    turno: r.turno as string | undefined,
    horaInicio: r.hora_inicio as string | undefined,
    horaFin: r.hora_fin as string | undefined,
    activo: (r.activo as boolean) ?? true,
  };
}

function cupoToDB(c: JornadaCupo) {
  return {
    id: c.id,
    area_id: c.areaId ?? null,
    tipo: c.tipo,
    max_simultaneos: c.maxSimultaneos,
    cargo: c.cargo ?? null,
    turno: c.turno ?? null,
    hora_inicio: c.horaInicio ?? null,
    hora_fin: c.horaFin ?? null,
    activo: c.activo,
  };
}

function configFromDB(r: Record<string, unknown>): JornadaConfiguracion {
  return {
    id: r.id as string,
    areaId: r.area_id as string | undefined,
    toleranciaLlegadaMin: r.tolerancia_llegada_min as number,
    tiempoMaxBreakMin: r.tiempo_max_break_min as number,
    tiempoMaxAlmuerzoMin: r.tiempo_max_almuerzo_min as number,
    diasLaborales: (r.dias_laborales as number[]) ?? [1, 2, 3, 4, 5],
    horaInicioJornada: r.hora_inicio_jornada as string,
    horaFinJornada: r.hora_fin_jornada as string,
    requiereAprobacionEdicion: (r.requiere_aprobacion_edicion as boolean) ?? true,
  };
}

function configToDB(c: JornadaConfiguracion) {
  return {
    id: c.id,
    area_id: c.areaId ?? null,
    tolerancia_llegada_min: c.toleranciaLlegadaMin,
    tiempo_max_break_min: c.tiempoMaxBreakMin,
    tiempo_max_almuerzo_min: c.tiempoMaxAlmuerzoMin,
    dias_laborales: c.diasLaborales,
    hora_inicio_jornada: c.horaInicioJornada,
    hora_fin_jornada: c.horaFinJornada,
    requiere_aprobacion_edicion: c.requiereAprobacionEdicion,
  };
}

// ── Fetch ──────────────────────────────────────────────────

export async function fetchRegistros(fecha?: string): Promise<JornadaRegistro[]> {
  let q = supabase.from("jornada_registros").select("*").order("hora_exacta");
  if (fecha) q = q.eq("fecha", fecha);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(registroFromDB);
}

export async function fetchRegistrosRango(desde: string, hasta: string): Promise<JornadaRegistro[]> {
  const { data, error } = await supabase
    .from("jornada_registros")
    .select("*")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("hora_exacta");
  if (error) throw error;
  return (data ?? []).map(registroFromDB);
}

export async function fetchModificaciones(registroId?: string): Promise<JornadaModificacion[]> {
  let q = supabase.from("jornada_modificaciones").select("*").order("fecha_modificacion", { ascending: false });
  if (registroId) q = q.eq("registro_id", registroId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(modificacionFromDB);
}

export async function fetchHorarios(): Promise<JornadaHorario[]> {
  const { data, error } = await supabase.from("jornada_horarios").select("*").order("nombre");
  if (error) throw error;
  return (data ?? []).map(horarioFromDB);
}

export async function fetchHorariosEmpleado(): Promise<JornadaHorarioEmpleado[]> {
  const { data, error } = await supabase.from("jornada_horarios_empleado").select("*").eq("activo", true);
  if (error) throw error;
  return (data ?? []).map(horarioEmpleadoFromDB);
}

export async function fetchCupos(): Promise<JornadaCupo[]> {
  const { data, error } = await supabase.from("jornada_cupos").select("*").eq("activo", true);
  if (error) throw error;
  return (data ?? []).map(cupoFromDB);
}

export async function fetchConfiguracion(): Promise<JornadaConfiguracion[]> {
  const { data, error } = await supabase.from("jornada_configuracion").select("*");
  if (error) throw error;
  return (data ?? []).map(configFromDB);
}

// ── Upserts ───────────────────────────────────────────────

export async function insertRegistro(
  r: Omit<JornadaRegistro, "id" | "createdAt">,
): Promise<JornadaRegistro> {
  const { data, error } = await supabase
    .from("jornada_registros")
    .insert(registroToDB(r))
    .select()
    .single();
  if (error) throw error;
  return registroFromDB(data as Record<string, unknown>);
}

export async function updateRegistro(r: JornadaRegistro): Promise<void> {
  const { error } = await supabase
    .from("jornada_registros")
    .update(registroToDB(r))
    .eq("id", r.id);
  if (error) throw error;
}

export async function deleteRegistro(id: string): Promise<void> {
  const { error } = await supabase.from("jornada_registros").delete().eq("id", id);
  if (error) throw error;
}

export async function insertModificacion(
  m: Omit<JornadaModificacion, "id" | "fechaModificacion">,
): Promise<void> {
  const { error } = await supabase.from("jornada_modificaciones").insert({
    registro_id: m.registroId,
    usuario_id: m.usuarioId,
    motivo: m.motivo,
    campo_modificado: m.campoModificado ?? null,
    valor_anterior: m.valorAnterior ?? null,
    valor_nuevo: m.valorNuevo ?? null,
  });
  if (error) throw error;
}

export async function upsertHorario(h: JornadaHorario): Promise<void> {
  const { error } = await supabase.from("jornada_horarios").upsert(horarioToDB(h));
  if (error) throw error;
}

export async function deleteHorario(id: string): Promise<void> {
  const { error } = await supabase.from("jornada_horarios").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertHorarioEmpleado(h: JornadaHorarioEmpleado): Promise<void> {
  const { error } = await supabase.from("jornada_horarios_empleado").upsert({
    id: h.id,
    employee_id: h.employeeId,
    horario_id: h.horarioId,
    fecha_inicio: h.fechaInicio,
    fecha_fin: h.fechaFin ?? null,
    activo: h.activo,
  });
  if (error) throw error;
}

export async function upsertCupo(c: JornadaCupo): Promise<void> {
  const { error } = await supabase.from("jornada_cupos").upsert(cupoToDB(c));
  if (error) throw error;
}

export async function deleteCupo(id: string): Promise<void> {
  const { error } = await supabase.from("jornada_cupos").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertConfiguracion(c: JornadaConfiguracion): Promise<void> {
  const { error } = await supabase.from("jornada_configuracion").upsert(configToDB(c));
  if (error) throw error;
}
