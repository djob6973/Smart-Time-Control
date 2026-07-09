import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query, execute } from "@/lib/db";
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

function configFromDB(r: Record<string, unknown>): JornadaConfiguracion {
  return {
    id: r.id as string,
    areaId: r.area_id as string | undefined,
    toleranciaLlegadaMin: r.tolerancia_llegada_min as number,
    tiempoMaxBreakMin: r.tiempo_max_break_min as number,
    tiempoMaxAlmuerzoMin: r.tiempo_max_almuerzo_min as number,
    break1HoraInicio: (r.break1_hora_inicio as string) ?? "09:00",
    break1HoraFin: (r.break1_hora_fin as string) ?? "11:00",
    break2HoraInicio: (r.break2_hora_inicio as string) ?? "14:00",
    break2HoraFin: (r.break2_hora_fin as string) ?? "16:00",
    maxAlmuerzosPorJornada: (r.max_almuerzos_por_jornada as number) ?? 1,
    diasLaborales: (r.dias_laborales as number[]) ?? [1, 2, 3, 4, 5],
    horaInicioJornada: r.hora_inicio_jornada as string,
    horaFinJornada: r.hora_fin_jornada as string,
    requiereAprobacionEdicion: (r.requiere_aprobacion_edicion as boolean) ?? true,
  };
}

// ── Server functions internas ──────────────────────────────

const _fetchRegistros = createServerFn({ method: "GET" })
  .inputValidator(z.object({ fecha: z.string().optional() }))
  .handler(async ({ data }) => {
    let sql = "SELECT * FROM public.jornada_registros WHERE 1=1";
    const params: unknown[] = [];
    if (data.fecha) { sql += ` AND fecha = $${params.push(data.fecha)}`; }
    sql += " ORDER BY hora_exacta";
    const rows = await query(sql, params);
    return rows.map(registroFromDB);
  });

const _fetchRegistrosRango = createServerFn({ method: "GET" })
  .inputValidator(z.object({ desde: z.string(), hasta: z.string() }))
  .handler(async ({ data }) => {
    const rows = await query(
      "SELECT * FROM public.jornada_registros WHERE fecha >= $1 AND fecha <= $2 ORDER BY hora_exacta",
      [data.desde, data.hasta],
    );
    return rows.map(registroFromDB);
  });

const _fetchModificaciones = createServerFn({ method: "GET" })
  .inputValidator(z.object({ registroId: z.string().optional(), desde: z.string().optional() }))
  .handler(async ({ data }) => {
    let sql = "SELECT * FROM public.jornada_modificaciones";
    const params: unknown[] = [];
    const conds: string[] = [];
    if (data.registroId) { conds.push(`registro_id = $${params.push(data.registroId)}`); }
    if (data.desde) { conds.push(`fecha_modificacion >= $${params.push(data.desde)}`); }
    if (conds.length) { sql += ` WHERE ${conds.join(" AND ")}`; }
    sql += " ORDER BY fecha_modificacion DESC";
    const rows = await query(sql, params);
    return rows.map(
      (r): JornadaModificacion => ({
        id: r.id as string,
        registroId: r.registro_id as string,
        usuarioId: r.usuario_id as string,
        nombreUsuario: r.nombre_usuario as string | undefined,
        fechaModificacion: r.fecha_modificacion as string,
        motivo: r.motivo as string,
        campoModificado: r.campo_modificado as string | undefined,
        valorAnterior: r.valor_anterior as string | undefined,
        valorNuevo: r.valor_nuevo as string | undefined,
      }),
    );
  });

const _fetchHorarios = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await query("SELECT * FROM public.jornada_horarios ORDER BY nombre");
  return rows.map(horarioFromDB);
});

const _fetchHorariosEmpleado = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await query("SELECT * FROM public.jornada_horarios_empleado WHERE activo = true");
  return rows.map(horarioEmpleadoFromDB);
});

const _fetchCupos = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await query("SELECT * FROM public.jornada_cupos WHERE activo = true");
  return rows.map(cupoFromDB);
});

const _fetchConfiguracion = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await query("SELECT * FROM public.jornada_configuracion");
  return rows.map(configFromDB);
});

const _insertRegistro = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as Omit<JornadaRegistro, "id" | "createdAt">)
  .handler(async ({ data: r }) => {
    const rows = await query(
      `INSERT INTO public.jornada_registros
         (employee_id, fecha, hora_exacta, tipo_movimiento, area_id,
          usuario_registro_id, observaciones, estado, es_modificacion, registro_original_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        r.employeeId, r.fecha, r.horaExacta, r.tipoMovimiento,
        r.areaId ?? null, r.usuarioRegistroId ?? null, r.observaciones ?? null,
        r.estado, r.esModificacion, r.registroOriginalId ?? null,
      ],
    );
    return registroFromDB(rows[0]);
  });

const _updateRegistro = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as JornadaRegistro)
  .handler(async ({ data: r }) => {
    await execute(
      `UPDATE public.jornada_registros SET
         employee_id=$2, fecha=$3, hora_exacta=$4, tipo_movimiento=$5,
         area_id=$6, usuario_registro_id=$7, observaciones=$8,
         estado=$9, es_modificacion=$10, registro_original_id=$11
       WHERE id=$1`,
      [
        r.id, r.employeeId, r.fecha, r.horaExacta, r.tipoMovimiento,
        r.areaId ?? null, r.usuarioRegistroId ?? null, r.observaciones ?? null,
        r.estado, r.esModificacion, r.registroOriginalId ?? null,
      ],
    );
  });

const _deleteRegistro = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await execute("DELETE FROM public.jornada_registros WHERE id = $1", [data.id]);
  });

const _insertModificacion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as Omit<JornadaModificacion, "id" | "fechaModificacion">)
  .handler(async ({ data: m }) => {
    await execute(
      `INSERT INTO public.jornada_modificaciones
         (registro_id, usuario_id, nombre_usuario, motivo, campo_modificado, valor_anterior, valor_nuevo)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [m.registroId, m.usuarioId, m.nombreUsuario ?? null, m.motivo, m.campoModificado ?? null, m.valorAnterior ?? null, m.valorNuevo ?? null],
    );
  });

const _upsertHorario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as JornadaHorario)
  .handler(async ({ data: h }) => {
    await execute(
      `INSERT INTO public.jornada_horarios
         (id, nombre, tipo_jornada, hora_entrada, hora_salida, break_inicio, break_fin,
          almuerzo_inicio, almuerzo_fin, dias_aplicables, area_id, cargo, turno, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         nombre=$2, tipo_jornada=$3, hora_entrada=$4, hora_salida=$5,
         break_inicio=$6, break_fin=$7, almuerzo_inicio=$8, almuerzo_fin=$9,
         dias_aplicables=$10, area_id=$11, cargo=$12, turno=$13, activo=$14`,
      [
        h.id, h.nombre, h.tipoJornada, h.horaEntrada ?? null, h.horaSalida ?? null,
        h.breakInicio ?? null, h.breakFin ?? null, h.almuerzoInicio ?? null, h.almuerzoFin ?? null,
        h.diasAplicables, h.areaId ?? null, h.cargo ?? null, h.turno ?? null, h.activo,
      ],
    );
  });

const _deleteHorario = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await execute("DELETE FROM public.jornada_horarios WHERE id = $1", [data.id]);
  });

const _upsertHorarioEmpleado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as JornadaHorarioEmpleado)
  .handler(async ({ data: h }) => {
    await execute(
      `INSERT INTO public.jornada_horarios_empleado
         (id, employee_id, horario_id, fecha_inicio, fecha_fin, activo)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         employee_id=$2, horario_id=$3, fecha_inicio=$4, fecha_fin=$5, activo=$6`,
      [h.id, h.employeeId, h.horarioId, h.fechaInicio, h.fechaFin ?? null, h.activo],
    );
  });

const _upsertCupo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as JornadaCupo)
  .handler(async ({ data: c }) => {
    await execute(
      `INSERT INTO public.jornada_cupos
         (id, area_id, tipo, max_simultaneos, cargo, turno, hora_inicio, hora_fin, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         area_id=$2, tipo=$3, max_simultaneos=$4, cargo=$5, turno=$6,
         hora_inicio=$7, hora_fin=$8, activo=$9`,
      [
        c.id, c.areaId ?? null, c.tipo, c.maxSimultaneos,
        c.cargo ?? null, c.turno ?? null, c.horaInicio ?? null, c.horaFin ?? null, c.activo,
      ],
    );
  });

const _deleteCupo = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await execute("DELETE FROM public.jornada_cupos WHERE id = $1", [data.id]);
  });

const _upsertConfiguracion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as JornadaConfiguracion)
  .handler(async ({ data: c }) => {
    await execute(
      `INSERT INTO public.jornada_configuracion
         (id, area_id, tolerancia_llegada_min, tiempo_max_break_min, tiempo_max_almuerzo_min,
          break1_hora_inicio, break1_hora_fin, break2_hora_inicio, break2_hora_fin, max_almuerzos_por_jornada,
          dias_laborales, hora_inicio_jornada, hora_fin_jornada, requiere_aprobacion_edicion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         area_id=$2, tolerancia_llegada_min=$3, tiempo_max_break_min=$4,
         tiempo_max_almuerzo_min=$5, break1_hora_inicio=$6, break1_hora_fin=$7,
         break2_hora_inicio=$8, break2_hora_fin=$9, max_almuerzos_por_jornada=$10,
         dias_laborales=$11, hora_inicio_jornada=$12,
         hora_fin_jornada=$13, requiere_aprobacion_edicion=$14`,
      [
        c.id, c.areaId ?? null, c.toleranciaLlegadaMin, c.tiempoMaxBreakMin,
        c.tiempoMaxAlmuerzoMin, c.break1HoraInicio, c.break1HoraFin,
        c.break2HoraInicio, c.break2HoraFin, c.maxAlmuerzosPorJornada ?? 1,
        c.diasLaborales, c.horaInicioJornada,
        c.horaFinJornada, c.requiereAprobacionEdicion,
      ],
    );
  });

// ── Exports públicos con la misma firma que antes ──────────

export async function fetchRegistros(fecha?: string): Promise<JornadaRegistro[]> {
  return _fetchRegistros({ data: { fecha } });
}

export async function fetchRegistrosRango(desde: string, hasta: string): Promise<JornadaRegistro[]> {
  return _fetchRegistrosRango({ data: { desde, hasta } });
}

export async function fetchModificaciones(registroId?: string, desde?: string): Promise<JornadaModificacion[]> {
  return _fetchModificaciones({ data: { registroId, desde } });
}

export async function fetchHorarios(): Promise<JornadaHorario[]> {
  return _fetchHorarios();
}

export async function fetchHorariosEmpleado(): Promise<JornadaHorarioEmpleado[]> {
  return _fetchHorariosEmpleado();
}

export async function fetchCupos(): Promise<JornadaCupo[]> {
  return _fetchCupos();
}

export async function fetchConfiguracion(): Promise<JornadaConfiguracion[]> {
  return _fetchConfiguracion();
}

export async function insertRegistro(
  r: Omit<JornadaRegistro, "id" | "createdAt">,
): Promise<JornadaRegistro> {
  return _insertRegistro({ data: r });
}

export async function updateRegistro(r: JornadaRegistro): Promise<void> {
  await _updateRegistro({ data: r });
}

export async function deleteRegistro(id: string): Promise<void> {
  await _deleteRegistro({ data: { id } });
}

export async function insertModificacion(
  m: Omit<JornadaModificacion, "id" | "fechaModificacion">,
): Promise<void> {
  await _insertModificacion({ data: m });
}

export async function upsertHorario(h: JornadaHorario): Promise<void> {
  await _upsertHorario({ data: h });
}

export async function deleteHorario(id: string): Promise<void> {
  await _deleteHorario({ data: { id } });
}

export async function upsertHorarioEmpleado(h: JornadaHorarioEmpleado): Promise<void> {
  await _upsertHorarioEmpleado({ data: h });
}

export async function upsertCupo(c: JornadaCupo): Promise<void> {
  await _upsertCupo({ data: c });
}

export async function deleteCupo(id: string): Promise<void> {
  await _deleteCupo({ data: { id } });
}

export async function upsertConfiguracion(c: JornadaConfiguracion): Promise<void> {
  await _upsertConfiguracion({ data: c });
}
