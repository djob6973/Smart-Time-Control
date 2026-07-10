import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Megaphone, Plus, Trash2, Pencil, Power, PowerOff, ImageIcon, Upload } from "lucide-react";
import { toast } from "sonner";
import { Topbar } from "@/components/wfm/Topbar";
import { useAuth } from "@/lib/auth";
import { useWFM } from "@/lib/wfm/store";
import { useAvisos } from "@/lib/avisos/store";
import {
  estadoAviso,
  ESTADO_AVISO_LABELS,
  ESTADO_AVISO_COLORS,
  type Aviso,
  type AvisoInput,
} from "@/lib/avisos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/avisos")({
  head: () => ({ meta: [{ title: "Novedades del día · STC" }] }),
  component: AvisosPage,
});

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

function nowLocalInput(): string {
  return toLocalInput(new Date().toISOString());
}

function AvisosPage() {
  const { profile, role, organization, hasPermission, user } = useAuth();
  const { areas } = useWFM();
  const {
    avisos,
    initialized,
    initFromDB,
    crearAviso,
    actualizarAviso,
    eliminarAviso,
    toggleActivo,
  } = useAvisos();

  const canCreate = hasPermission("avisos", "create");
  const restrictedToOwnArea = role === "supervisor" || role === "lider";
  const ownAreaId = profile?.areaId ?? null;

  useEffect(() => {
    if (organization?.id && !initialized) initFromDB(organization.id);
  }, [organization?.id, initialized, initFromDB]);

  const [editing, setEditing] = useState<"new" | Aviso | null>(null);

  const visibleAvisos = restrictedToOwnArea ? avisos.filter((a) => a.areaId === ownAreaId) : avisos;

  function areaName(areaId: string | null) {
    if (!areaId) return "Todas las áreas";
    return areas.find((a) => a.id === areaId)?.name ?? areaId;
  }

  async function handleSave(input: AvisoInput, id?: string) {
    if (!user?.id) return;
    try {
      if (id) await actualizarAviso(id, input, user.id);
      else await crearAviso(input, user.id);
      toast.success(id ? "Aviso actualizado" : "Aviso creado");
      setEditing(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar el aviso");
    }
  }

  async function handleDelete(id: string) {
    if (!user?.id) return;
    try {
      await eliminarAviso(id, user.id);
      toast.success("Aviso eliminado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar el aviso");
    }
  }

  async function handleToggle(a: Aviso) {
    if (!user?.id) return;
    try {
      await toggleActivo(a.id, !a.activo, user.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar el aviso");
    }
  }

  return (
    <>
      <Topbar
        title="Novedades del día"
        subtitle="Avisos flotantes por área para tu equipo"
        right={
          canCreate ? (
            <button
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-2 rounded-pill bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nuevo aviso</span>
            </button>
          ) : undefined
        }
      />

      <div
        className="px-4 md:px-6 py-4 md:py-6 max-w-[1280px] mx-auto"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {visibleAvisos.map((a) => {
          const estado = estadoAviso(a);
          return (
            <div
              key={a.id}
              className="rounded-card bg-card shadow-card overflow-hidden flex flex-col"
            >
              {a.imagenData ? (
                <img src={a.imagenData} alt={a.titulo} className="h-32 w-full object-cover" />
              ) : (
                <div className="h-32 w-full bg-secondary/50 flex items-center justify-center text-muted-foreground/40">
                  <ImageIcon className="size-8" />
                </div>
              )}
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display font-medium text-base leading-tight">{a.titulo}</h3>
                  <span
                    className={cn(
                      "shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium",
                      ESTADO_AVISO_COLORS[estado],
                    )}
                  >
                    {ESTADO_AVISO_LABELS[estado]}
                  </span>
                </div>
                {a.subtitulo && <p className="text-sm text-muted-foreground">{a.subtitulo}</p>}
                <p className="text-sm text-foreground/80 line-clamp-3">{a.descripcion}</p>
                <div className="mt-auto pt-2 text-xs text-muted-foreground space-y-0.5">
                  <div>
                    Área: <span className="text-foreground">{areaName(a.areaId)}</span>
                  </div>
                  <div>
                    Vigencia: {new Date(a.fechaActivacion).toLocaleString()} →{" "}
                    {new Date(a.fechaVencimiento).toLocaleString()}
                  </div>
                  {a.creadoPorNombre && (
                    <div>
                      Creado por {a.creadoPorNombre} el {new Date(a.createdAt).toLocaleString()}
                    </div>
                  )}
                </div>
                {(!restrictedToOwnArea || a.areaId === ownAreaId) && canCreate && (
                  <div className="flex items-center gap-1.5 pt-2 border-t border-border mt-2">
                    <button
                      onClick={() => setEditing(a)}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Editar"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleToggle(a)}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title={a.activo ? "Desactivar" : "Activar"}
                    >
                      {a.activo ? (
                        <PowerOff className="size-3.5" />
                      ) : (
                        <Power className="size-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="ml-auto p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {visibleAvisos.length === 0 && (
          <div className="col-span-full py-16 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Megaphone className="size-6 opacity-30" />
            Sin avisos registrados
          </div>
        )}
      </div>

      {editing && (
        <AvisoModal
          aviso={editing === "new" ? null : editing}
          areas={areas}
          restrictedToOwnArea={restrictedToOwnArea}
          ownAreaId={ownAreaId}
          organizationId={organization?.id ?? ""}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}

function AvisoModal({
  aviso,
  areas,
  restrictedToOwnArea,
  ownAreaId,
  organizationId,
  onClose,
  onSave,
}: {
  aviso: Aviso | null;
  areas: { id: string; name: string }[];
  restrictedToOwnArea: boolean;
  ownAreaId: string | null;
  organizationId: string;
  onClose: () => void;
  onSave: (input: AvisoInput, id?: string) => void;
}) {
  const [titulo, setTitulo] = useState(aviso?.titulo ?? "");
  const [subtitulo, setSubtitulo] = useState(aviso?.subtitulo ?? "");
  const [descripcion, setDescripcion] = useState(aviso?.descripcion ?? "");
  const [areaId, setAreaId] = useState<string | null>(
    aviso ? aviso.areaId : restrictedToOwnArea ? ownAreaId : null,
  );
  const [imagenData, setImagenData] = useState<string | null>(aviso?.imagenData ?? null);
  const [fechaActivacion, setFechaActivacion] = useState(
    aviso ? toLocalInput(aviso.fechaActivacion) : nowLocalInput(),
  );
  const [fechaVencimiento, setFechaVencimiento] = useState(
    aviso ? toLocalInput(aviso.fechaVencimiento) : "",
  );
  const [saving, setSaving] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten archivos de imagen");
      return;
    }
    if (file.size > 500_000) {
      toast.error("La imagen no puede superar 500 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setImagenData(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleSubmit() {
    if (!titulo.trim() || !descripcion.trim()) {
      toast.error("Título y descripción son obligatorios");
      return;
    }
    if (!fechaVencimiento) {
      toast.error("La fecha de vencimiento es obligatoria");
      return;
    }
    const activacionISO = fromLocalInput(fechaActivacion);
    const vencimientoISO = fromLocalInput(fechaVencimiento);
    if (new Date(vencimientoISO) <= new Date(activacionISO)) {
      toast.error("La fecha de vencimiento debe ser posterior a la de activación");
      return;
    }
    setSaving(true);
    try {
      await onSave(
        {
          organizationId,
          areaId,
          titulo: titulo.trim(),
          subtitulo: subtitulo.trim() || undefined,
          descripcion: descripcion.trim(),
          imagenData,
          fechaActivacion: activacionISO,
          fechaVencimiento: vencimientoISO,
          activo: aviso?.activo ?? true,
        },
        aviso?.id,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-card shadow-card w-full my-4 sm:my-8"
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border">
          <h3 className="font-semibold text-base">{aviso ? "Editar aviso" : "Nuevo aviso"}</h3>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "68vh" }}>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Título
            </span>
            <input
              className="fi mt-1"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Cambio de horario mañana"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Subtítulo
            </span>
            <input
              className="fi mt-1"
              value={subtitulo}
              onChange={(e) => setSubtitulo(e.target.value)}
              placeholder="Opcional"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Descripción
            </span>
            <textarea
              className="fi mt-1"
              style={{ borderRadius: 16, minHeight: 90 }}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle de la novedad"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Área
            </span>
            {restrictedToOwnArea ? (
              <input
                className="fi mt-1"
                disabled
                value={areas.find((a) => a.id === ownAreaId)?.name ?? "Tu área"}
              />
            ) : (
              <select
                className="fi mt-1"
                value={areaId ?? ""}
                onChange={(e) => setAreaId(e.target.value || null)}
              >
                <option value="">Todas las áreas</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Activación
              </span>
              <input
                type="datetime-local"
                className="fi mt-1"
                value={fechaActivacion}
                onChange={(e) => setFechaActivacion(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Vencimiento
              </span>
              <input
                type="datetime-local"
                className="fi mt-1"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
              />
            </label>
          </div>

          {aviso && (
            <p className="text-xs text-muted-foreground">
              Creado el {new Date(aviso.createdAt).toLocaleString()}
            </p>
          )}

          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Imagen
            </span>
            <div
              className={cn(
                "mt-1 flex items-center justify-center border-2 border-dashed rounded-xl h-32 transition-colors cursor-pointer",
                imagenData
                  ? "border-border bg-secondary/20"
                  : "border-border/50 bg-muted/20 hover:border-primary/40 hover:bg-primary/5",
              )}
              onClick={() => document.getElementById("aviso-img-input")?.click()}
            >
              {imagenData ? (
                <img
                  src={imagenData}
                  alt="Imagen del aviso"
                  className="max-h-28 max-w-full object-contain p-2"
                />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground select-none">
                  <Upload className="size-6" />
                  <span className="text-xs">Haz clic para seleccionar imagen</span>
                  <span className="text-[10px] opacity-60">PNG, JPG · máx 500 KB</span>
                </div>
              )}
            </div>
            <input
              id="aviso-img-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {imagenData && (
              <button
                type="button"
                onClick={() => setImagenData(null)}
                className="mt-1.5 text-xs text-destructive hover:underline"
              >
                Quitar imagen
              </button>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border flex items-center gap-2">
          <div className="ml-auto flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Guardando…" : aviso ? "Guardar" : "Crear"}
            </button>
          </div>
        </div>

        <style>{`.fi{width:100%;border:1px solid var(--color-input);border-radius:999px;padding:.5rem .875rem;font-size:.875rem;background:var(--color-card);outline:none}.fi:focus{border-color:color-mix(in srgb,var(--color-primary) 40%,transparent)}`}</style>
      </div>
    </div>
  );
}
