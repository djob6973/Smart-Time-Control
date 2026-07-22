import type { JornadaConfiguracion, TipoMovimiento } from "./types";

// Resuelve la configuración de jornada aplicable a un área: prioriza la config
// propia del área (si existe) y cae a la config global (areaId vacío) en su defecto.
export function resolveJornadaConfig(
  configuracion: JornadaConfiguracion[],
  areaId?: string | null,
): JornadaConfiguracion | undefined {
  if (areaId) {
    const propia = configuracion.find((c) => c.areaId === areaId);
    if (propia) return propia;
  }
  return configuracion.find((c) => !c.areaId) ?? configuracion[0];
}

// Transiciones válidas: qué movimiento previo habilita cada tipo de registro.
export const FLUJO_VALIDO: Record<string, TipoMovimiento[]> = {
  entrada: [],
  salida_break1: ["entrada", "regreso_break1", "regreso_break2", "regreso_almuerzo"],
  regreso_break1: ["salida_break1"],
  salida_break2: ["entrada", "regreso_break1", "regreso_break2", "regreso_almuerzo"],
  regreso_break2: ["salida_break2"],
  salida_almuerzo: ["entrada", "regreso_break1", "regreso_break2", "regreso_almuerzo"],
  regreso_almuerzo: ["salida_almuerzo"],
  salida: ["entrada", "regreso_break1", "regreso_break2", "regreso_almuerzo"],
};

// Colombia no observa horario de verano: el offset UTC-5 es fijo todo el año.
// Se calcula a partir de un instante absoluto (epoch ms) para no depender del
// reloj ni de la zona horaria configurada en el sistema donde corre (servidor).
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

export function bogotaParts(epochMs: number) {
  const b = new Date(epochMs - BOGOTA_OFFSET_MS);
  const y = b.getUTCFullYear();
  const m = String(b.getUTCMonth() + 1).padStart(2, "0");
  const d = String(b.getUTCDate()).padStart(2, "0");
  const hh = String(b.getUTCHours()).padStart(2, "0");
  const mi = String(b.getUTCMinutes()).padStart(2, "0");
  return {
    fecha: `${y}-${m}-${d}`,
    horaExacta: new Date(epochMs).toISOString(),
    hhmm: `${hh}:${mi}`,
    dow: b.getUTCDay(),
  };
}
