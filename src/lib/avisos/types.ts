export interface Aviso {
  id: string;
  organizationId: string;
  areaId: string | null; // null = todas las áreas
  titulo: string;
  subtitulo?: string;
  descripcion: string;
  imagenData?: string | null; // data:image/...;base64,...
  fechaActivacion: string; // ISO datetime
  fechaVencimiento: string; // ISO datetime
  activo: boolean; // override manual del autor
  creadoPor?: string;
  creadoPorNombre?: string;
  createdAt: string;
  updatedAt: string;
}

export type AvisoInput = Omit<
  Aviso,
  "id" | "createdAt" | "updatedAt" | "creadoPor" | "creadoPorNombre"
>;

export type EstadoAviso = "programado" | "activo" | "vencido" | "desactivado";

export const ESTADO_AVISO_LABELS: Record<EstadoAviso, string> = {
  programado: "Programado",
  activo: "Activo",
  vencido: "Vencido",
  desactivado: "Desactivado",
};

export const ESTADO_AVISO_COLORS: Record<EstadoAviso, string> = {
  programado: "bg-primary/12 text-primary",
  activo: "bg-[color-mix(in_srgb,#1F8A5B_14%,transparent)] text-[#1F8A5B]",
  vencido: "bg-secondary text-muted-foreground",
  desactivado: "bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] text-destructive",
};

export function estadoAviso(
  a: Pick<Aviso, "activo" | "fechaActivacion" | "fechaVencimiento">,
  now: Date = new Date(),
): EstadoAviso {
  if (!a.activo) return "desactivado";
  const t = now.getTime();
  if (t < new Date(a.fechaActivacion).getTime()) return "programado";
  if (t >= new Date(a.fechaVencimiento).getTime()) return "vencido";
  return "activo";
}
