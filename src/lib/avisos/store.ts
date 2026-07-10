import { create } from "zustand";
import type { Aviso, AvisoInput } from "./types";
import {
  listAvisos,
  listAvisosActivos,
  createAviso,
  updateAviso,
  deleteAviso,
  toggleActivoAviso,
} from "./db";

interface AvisosState {
  avisos: Aviso[]; // todos los de la organización (pantalla de gestión)
  avisosActivos: Aviso[]; // vigentes ahora mismo, filtrados por área (widget flotante)
  loading: boolean;
  initialized: boolean;

  initFromDB: (organizationId: string) => Promise<void>;
  reloadActivos: (organizationId: string, areaId: string | null) => Promise<void>;

  crearAviso: (input: AvisoInput, userId: string) => Promise<void>;
  actualizarAviso: (id: string, input: AvisoInput, userId: string) => Promise<void>;
  eliminarAviso: (id: string, userId: string) => Promise<void>;
  toggleActivo: (id: string, activo: boolean, userId: string) => Promise<void>;
}

export const useAvisos = create<AvisosState>()((set, get) => ({
  avisos: [],
  avisosActivos: [],
  loading: false,
  initialized: false,

  initFromDB: async (organizationId) => {
    set({ loading: true });
    try {
      const avisos = await listAvisos({ data: { organizationId } });
      set({ avisos, initialized: true });
    } finally {
      set({ loading: false });
    }
  },

  reloadActivos: async (organizationId, areaId) => {
    const avisosActivos = await listAvisosActivos({ data: { organizationId, areaId } });
    set({ avisosActivos });
  },

  crearAviso: async (input, userId) => {
    await createAviso({ data: { ...input, userId } });
    set({ avisos: await listAvisos({ data: { organizationId: input.organizationId } }) });
  },

  actualizarAviso: async (id, input, userId) => {
    await updateAviso({ data: { id, ...input, userId } });
    set({ avisos: await listAvisos({ data: { organizationId: input.organizationId } }) });
  },

  eliminarAviso: async (id, userId) => {
    await deleteAviso({ data: { id, userId } });
    set((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) }));
  },

  toggleActivo: async (id, activo, userId) => {
    await toggleActivoAviso({ data: { id, activo, userId } });
    set((s) => ({ avisos: s.avisos.map((a) => (a.id === id ? { ...a, activo } : a)) }));
  },
}));
