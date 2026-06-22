import React, { useRef, useState } from "react";
import { Upload, Trash2, ImageIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function LogoUpload() {
  const { organization, reloadRole } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const currentLogo = organization?.logo ?? null;
  const displaySrc = preview ?? currentLogo;

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
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    try {
      const r = await fetch("/api/settings/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoDataUrl: preview }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Error al guardar");
      setPreview(null);
      await reloadRole();
      toast.success("Logo actualizado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const r = await fetch("/api/settings/logo", { method: "DELETE" });
      if (!r.ok) throw new Error("Error al eliminar");
      setPreview(null);
      await reloadRole();
      toast.success("Logo eliminado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-sm">
      {/* Preview / drop zone */}
      <div
        className={cn(
          "flex items-center justify-center border-2 border-dashed rounded-xl h-40 transition-colors",
          displaySrc
            ? "border-border bg-card"
            : "border-border/50 bg-muted/20 cursor-pointer hover:border-primary/40 hover:bg-primary/5",
        )}
        onClick={() => !displaySrc && fileRef.current?.click()}
      >
        {displaySrc ? (
          <img src={displaySrc} alt="Logo" className="max-h-28 max-w-full object-contain p-2" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground select-none">
            <ImageIcon className="size-8 opacity-30" />
            <span className="text-sm">Haz clic para seleccionar imagen</span>
            <span className="text-xs opacity-60">PNG, JPG, SVG · máx 500 KB</span>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {preview ? (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Upload className="size-3.5" />
              {saving ? "Guardando…" : "Guardar logo"}
            </button>
            <button
              onClick={() => setPreview(null)}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              <Upload className="size-3.5" />
              {currentLogo ? "Cambiar logo" : "Seleccionar logo"}
            </button>
            {currentLogo && (
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/5 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="size-3.5" />
                {removing ? "Eliminando…" : "Eliminar"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
