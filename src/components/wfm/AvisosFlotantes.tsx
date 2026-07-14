import { useEffect, useRef, useState } from "react";
import { Megaphone, X, ImageIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAvisos } from "@/lib/avisos/store";
import type { Aviso } from "@/lib/avisos/types";
import { MarkdownContent } from "@/components/ui/markdown-content";

const SEEN_KEY_PREFIX = "stc_avisos_vistos_";

function loadSeen(userId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY_PREFIX + userId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSeen(userId: string, seen: Record<string, string>) {
  try {
    localStorage.setItem(SEEN_KEY_PREFIX + userId, JSON.stringify(seen));
  } catch {
    // localStorage no disponible (modo privado, etc.) — el widget sigue funcionando sin recordar "vistos"
  }
}

export function AvisosFlotantes() {
  const { user, profile, organization } = useAuth();
  const { avisosActivos, reloadActivos } = useAvisos();
  const [open, setOpen] = useState(false);
  const [detalle, setDetalle] = useState<Aviso | null>(null);
  const autoOpened = useRef(false);

  const orgId = organization?.id;
  const areaId = profile?.areaId ?? null;

  useEffect(() => {
    if (!orgId) return;
    reloadActivos(orgId, areaId);
    const interval = setInterval(() => reloadActivos(orgId, areaId), 60_000);
    return () => clearInterval(interval);
  }, [orgId, areaId, reloadActivos]);

  const seen = user?.id ? loadSeen(user.id) : {};
  const nuevos = avisosActivos.filter((a) => seen[a.id] !== a.updatedAt);

  // Auto-abre una vez por carga de página si hay avisos nuevos no vistos.
  useEffect(() => {
    if (!autoOpened.current && nuevos.length > 0) {
      autoOpened.current = true;
      setOpen(true);
    }
  }, [nuevos.length]);

  function handleOpen() {
    setOpen((o) => {
      const next = !o;
      if (next && user?.id) {
        const updated = { ...seen };
        avisosActivos.forEach((a) => {
          updated[a.id] = a.updatedAt;
        });
        saveSeen(user.id, updated);
      }
      return next;
    });
  }

  if (!orgId) return null;

  return (
    <>
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-40 flex items-center justify-center size-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
        title="Novedades del día"
      >
        <Megaphone className="size-5" />
        {nuevos.length > 0 && !open && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center size-5 rounded-full bg-destructive text-white text-[10px] font-bold">
            {nuevos.length > 9 ? "9+" : nuevos.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-[min(30rem,calc(100vw-2rem))] max-h-[80vh] flex flex-col rounded-card bg-card shadow-card border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <span className="font-semibold text-base flex items-center gap-2">
              <Megaphone className="size-5 text-primary" />
              Novedades del día
            </span>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="overflow-y-auto p-4 space-y-3.5">
            {avisosActivos.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-muted-foreground">
                <Megaphone className="size-6 opacity-30" />
                <span className="text-sm">Sin novedades activas</span>
              </div>
            ) : (
              avisosActivos.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setDetalle(a)}
                  className="block w-full text-left rounded-xl border border-border overflow-hidden bg-secondary/20 hover:border-primary/40 transition-colors"
                >
                  {a.imagenData ? (
                    <img
                      src={a.imagenData}
                      alt={a.titulo}
                      className="h-40 w-full object-contain bg-secondary/30"
                    />
                  ) : (
                    <div className="h-20 w-full flex items-center justify-center text-muted-foreground/30 bg-secondary/40">
                      <ImageIcon className="size-6" />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-base font-semibold leading-tight">{a.titulo}</p>
                    {a.subtitulo && (
                      <p className="text-sm text-muted-foreground mt-0.5">{a.subtitulo}</p>
                    )}
                    <MarkdownContent
                      content={a.descripcion}
                      className="text-sm text-foreground/80 mt-1 max-h-24 overflow-hidden"
                    />
                    <p className="text-xs text-muted-foreground/70 mt-2.5">
                      Vigente hasta {new Date(a.fechaVencimiento).toLocaleString()}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {detalle && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDetalle(null)}
        >
          <div
            className="w-[min(36rem,calc(100vw-2rem))] max-h-[85vh] flex flex-col rounded-card bg-card shadow-card overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative shrink-0">
              <button
                onClick={() => setDetalle(null)}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/40 text-white hover:bg-black/60"
              >
                <X className="size-5" />
              </button>
              {detalle.imagenData ? (
                <img
                  src={detalle.imagenData}
                  alt={detalle.titulo}
                  className="h-64 w-full object-contain bg-secondary/20"
                />
              ) : (
                <div className="h-32 w-full flex items-center justify-center text-muted-foreground/30 bg-secondary/40">
                  <ImageIcon className="size-8" />
                </div>
              )}
            </div>
            <div className="p-6 overflow-y-auto">
              <p className="text-xl font-semibold leading-tight">{detalle.titulo}</p>
              {detalle.subtitulo && (
                <p className="text-base text-muted-foreground mt-1">{detalle.subtitulo}</p>
              )}
              <MarkdownContent
                content={detalle.descripcion}
                className="text-base text-foreground/80 mt-3"
              />
              <p className="text-xs text-muted-foreground/70 mt-4 pt-3 border-t border-border">
                Vigente hasta {new Date(detalle.fechaVencimiento).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
