import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query, queryOne, execute } from "@/lib/db";
import type { RoleName } from "@/lib/permissions";
import { DEFAULT_LIMITS_BY_ROLE } from "@/lib/permissions";
import type { Aviso } from "./types";

// ── Mapper ─────────────────────────────────────────────────

function avisoFromDB(r: Record<string, unknown>): Aviso {
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    areaId: (r.area_id as string | null) ?? null,
    titulo: r.titulo as string,
    subtitulo: (r.subtitulo as string) ?? undefined,
    descripcion: r.descripcion as string,
    imagenData: (r.imagen_data as string) ?? null,
    fechaActivacion: r.fecha_activacion as string,
    fechaVencimiento: r.fecha_vencimiento as string,
    activo: r.activo as boolean,
    creadoPor: (r.creado_por as string) ?? undefined,
    creadoPorNombre: (r.creado_por_nombre as string) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ── Autorización server-side ────────────────────────────────
// La conexión pg no pasa por PostgREST/RLS real, así que el rol/área del
// solicitante se revalida aquí en vez de confiar en lo que mande el cliente.

async function getCallerContext(userId: string) {
  const profile = await queryOne<{ area_id: string | null; nombre: string; full_name: string }>(
    `SELECT area_id, nombre, full_name FROM public.user_profiles WHERE id = $1`,
    [userId],
  );
  const roleRow = await queryOne<{ nombre: string }>(
    `SELECT r.nombre FROM public.user_roles ur
     JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1 LIMIT 1`,
    [userId],
  );
  const role = (roleRow?.nombre as RoleName | undefined) ?? null;
  return {
    areaId: profile?.area_id ?? null,
    nombre: profile?.nombre || profile?.full_name || "",
    role,
  };
}

// Si el rol está restringido a su propia área, ignora cualquier área que mande
// el cliente y fuerza la del solicitante (evita que un líder publique en otra área).
function resolveAreaId(
  role: RoleName | null,
  callerAreaId: string | null,
  requestedAreaId: string | null,
): string | null {
  const restrict = role ? (DEFAULT_LIMITS_BY_ROLE[role]?.restrictToOwnArea ?? true) : true;
  return restrict ? callerAreaId : requestedAreaId;
}

function validarImagen(imagenData: string | null | undefined) {
  if (!imagenData) return;
  if (!imagenData.startsWith("data:image/")) throw new Error("Archivo de imagen inválido");
  if (imagenData.length > 700_000) throw new Error("La imagen es demasiado grande (máx 500 KB)");
}

// ── Server functions ────────────────────────────────────────

export const listAvisos = createServerFn({ method: "GET" })
  .inputValidator(z.object({ organizationId: z.string() }))
  .handler(async ({ data }) => {
    const rows = await query(
      `SELECT * FROM public.avisos WHERE organization_id = $1 ORDER BY created_at DESC`,
      [data.organizationId],
    );
    return rows.map(avisoFromDB);
  });

export const listAvisosActivos = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({ organizationId: z.string(), areaId: z.string().nullable().optional() }),
  )
  .handler(async ({ data }) => {
    const rows = await query(
      `SELECT * FROM public.avisos
       WHERE organization_id = $1 AND activo = true
         AND fecha_activacion <= NOW() AND fecha_vencimiento > NOW()
         AND (area_id IS NULL OR area_id = $2)
       ORDER BY fecha_activacion DESC`,
      [data.organizationId, data.areaId ?? null],
    );
    return rows.map(avisoFromDB);
  });

const avisoInputSchema = z.object({
  organizationId: z.string(),
  areaId: z.string().nullable().optional(),
  titulo: z.string().min(1),
  subtitulo: z.string().optional(),
  descripcion: z.string().min(1),
  imagenData: z.string().nullable().optional(),
  fechaActivacion: z.string(),
  fechaVencimiento: z.string(),
  activo: z.boolean().optional(),
  userId: z.string(), // solicitante — para revalidar rol/área en el servidor
});

export const createAviso = createServerFn({ method: "POST" })
  .inputValidator(avisoInputSchema)
  .handler(async ({ data }) => {
    validarImagen(data.imagenData);
    if (new Date(data.fechaVencimiento) <= new Date(data.fechaActivacion)) {
      throw new Error("La fecha de vencimiento debe ser posterior a la de activación");
    }
    const caller = await getCallerContext(data.userId);
    const areaId = resolveAreaId(caller.role, caller.areaId, data.areaId ?? null);

    const rows = await query(
      `INSERT INTO public.avisos
         (organization_id, area_id, titulo, subtitulo, descripcion, imagen_data,
          fecha_activacion, fecha_vencimiento, activo, creado_por, creado_por_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        data.organizationId,
        areaId,
        data.titulo,
        data.subtitulo ?? null,
        data.descripcion,
        data.imagenData ?? null,
        data.fechaActivacion,
        data.fechaVencimiento,
        data.activo ?? true,
        data.userId,
        caller.nombre,
      ],
    );
    return avisoFromDB(rows[0]);
  });

const avisoUpdateSchema = avisoInputSchema.extend({ id: z.string() });

export const updateAviso = createServerFn({ method: "POST" })
  .inputValidator(avisoUpdateSchema)
  .handler(async ({ data }) => {
    validarImagen(data.imagenData);
    if (new Date(data.fechaVencimiento) <= new Date(data.fechaActivacion)) {
      throw new Error("La fecha de vencimiento debe ser posterior a la de activación");
    }
    const caller = await getCallerContext(data.userId);
    const existing = await queryOne<{ area_id: string | null }>(
      `SELECT area_id FROM public.avisos WHERE id = $1`,
      [data.id],
    );
    if (!existing) throw new Error("Aviso no encontrado");
    const restrict = caller.role
      ? (DEFAULT_LIMITS_BY_ROLE[caller.role]?.restrictToOwnArea ?? true)
      : true;
    if (restrict && existing.area_id !== caller.areaId) {
      throw new Error("No tienes permiso para editar avisos de otra área");
    }
    const areaId = resolveAreaId(caller.role, caller.areaId, data.areaId ?? null);

    await execute(
      `UPDATE public.avisos SET
         area_id=$2, titulo=$3, subtitulo=$4, descripcion=$5, imagen_data=$6,
         fecha_activacion=$7, fecha_vencimiento=$8, activo=$9
       WHERE id=$1`,
      [
        data.id,
        areaId,
        data.titulo,
        data.subtitulo ?? null,
        data.descripcion,
        data.imagenData ?? null,
        data.fechaActivacion,
        data.fechaVencimiento,
        data.activo ?? true,
      ],
    );
  });

export const toggleActivoAviso = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), activo: z.boolean(), userId: z.string() }))
  .handler(async ({ data }) => {
    const caller = await getCallerContext(data.userId);
    const existing = await queryOne<{ area_id: string | null }>(
      `SELECT area_id FROM public.avisos WHERE id = $1`,
      [data.id],
    );
    if (!existing) throw new Error("Aviso no encontrado");
    const restrict = caller.role
      ? (DEFAULT_LIMITS_BY_ROLE[caller.role]?.restrictToOwnArea ?? true)
      : true;
    if (restrict && existing.area_id !== caller.areaId) {
      throw new Error("No tienes permiso para modificar avisos de otra área");
    }
    await execute(`UPDATE public.avisos SET activo = $2 WHERE id = $1`, [data.id, data.activo]);
  });

export const deleteAviso = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), userId: z.string() }))
  .handler(async ({ data }) => {
    const caller = await getCallerContext(data.userId);
    const existing = await queryOne<{ area_id: string | null }>(
      `SELECT area_id FROM public.avisos WHERE id = $1`,
      [data.id],
    );
    if (!existing) return;
    const restrict = caller.role
      ? (DEFAULT_LIMITS_BY_ROLE[caller.role]?.restrictToOwnArea ?? true)
      : true;
    if (restrict && existing.area_id !== caller.areaId) {
      throw new Error("No tienes permiso para eliminar avisos de otra área");
    }
    await execute(`DELETE FROM public.avisos WHERE id = $1`, [data.id]);
  });
