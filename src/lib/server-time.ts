import { create } from "zustand";
import { createServerFn } from "@tanstack/react-start";

const _fetchServerTime = createServerFn({ method: "GET" }).handler(async () => {
  return { nowMs: Date.now() };
});

interface ServerClockState {
  offsetMs: number;
  synced: boolean;
  // Sincroniza una sola vez por sesión de navegador — llamadas repetidas son no-ops.
  sync: () => Promise<void>;
  // Hora actual corregida con el offset del servidor: usar en vez de `new Date()`
  // para cualquier "hoy"/"ahora" que decida qué mostrar (no solo cómo mostrarlo),
  // así el reloj del dispositivo del usuario no desincroniza la vista.
  now: () => Date;
}

export const useServerClock = create<ServerClockState>()((set, get) => ({
  offsetMs: 0,
  synced: false,
  sync: async () => {
    if (get().synced) return;
    try {
      const { nowMs } = await _fetchServerTime();
      set({ offsetMs: nowMs - Date.now(), synced: true });
    } catch {
      // Si falla, seguimos con offset 0 (reloj local) en vez de bloquear la UI.
    }
  },
  now: () => new Date(Date.now() + get().offsetMs),
}));
