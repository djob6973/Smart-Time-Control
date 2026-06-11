import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/wfm/Topbar";
import { useWFM } from "@/lib/wfm/store";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { Building2, ChevronRight, Plus, Settings } from "lucide-react";
import type { Area } from "@/lib/wfm/types";

export const Route = createFileRoute("/_authenticated/areas")({
  head: () => ({ meta: [{ title: "Áreas · STC" }] }),
  component: AreasPage,
});

const DAYS = [
  { day: 1, label: "L" },
  { day: 2, label: "M" },
  { day: 3, label: "Mi" },
  { day: 4, label: "J" },
  { day: 5, label: "V" },
  { day: 6, label: "S" },
  { day: 0, label: "D" },
];

function coverageColor(pct: number) {
  if (pct >= 90)
    return {
      pill: "bg-[color-mix(in_srgb,#1F8A5B_14%,transparent)] text-[#1F8A5B]",
      bar: "#1F8A5B",
      label: "Ok",
    };
  if (pct >= 75)
    return {
      pill: "bg-[color-mix(in_srgb,#C98A00_14%,transparent)] text-[#C98A00]",
      bar: "#C98A00",
      label: "Alerta",
    };
  return {
    pill: "bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]",
    bar: "var(--color-primary)",
    label: "Bajo",
  };
}

function AreasPage() {
  const { areas, employees, upsertArea, removeArea } = useWFM();
  const { hasPermission, hasLimit } = useAuth();
  const canEdit   = hasPermission("areas", "edit");
  const canDelete = hasLimit("canDeleteData");

  const [editing, setEditing] = useState<string | null>(null);

  const todayDow = new Date().getDay();

  return (
    <>
      <Topbar
        title="Áreas y configuración"
        subtitle="Reglas operativas por área"
        right={
          canEdit ? (
            <button
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-2 rounded-pill bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nueva área</span>
            </button>
          ) : undefined
        }
      />

      <div
        className="p-4 md:p-6"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "1.25rem" }}
      >
        {areas.map(area => {
          const areaEmps = employees.filter(e => e.areaId === area.id);
          const active   = areaEmps.filter(e => e.status === "active").length;
          const todayReq = area.coverageRequirements.find(r => r.dayOfWeek === todayDow);
          const minCov   = todayReq?.minWorkers ?? 0;
          const pct      = minCov > 0 ? Math.min(Math.round((active / minCov) * 100), 100) : (active > 0 ? 100 : 0);
          const cc       = coverageColor(pct);

          return (
            <div
              key={area.id}
              className="rounded-card border border-border bg-card shadow-card p-5 flex flex-col gap-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="shrink-0 size-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Building2 style={{ width: 22, height: 22 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base truncate">{area.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {area.startHour}:00 – {area.endHour}:00
                  </p>
                </div>
                {canEdit && (
                  <button
                    onClick={() => setEditing(area.id)}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Settings className="size-4" />
                  </button>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 py-1">
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums leading-none">{areaEmps.length}</div>
                  <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empleados</div>
                </div>
                <div className="text-center border-x border-border">
                  <div className="text-2xl font-bold tabular-nums leading-none">{minCov}</div>
                  <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Mín. cobertura</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums leading-none">
                    {pct}<span className="text-base font-normal text-muted-foreground">%</span>
                  </div>
                  <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Cobertura</div>
                </div>
              </div>

              {/* Coverage bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Cobertura actual de hoy</span>
                  <span className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-medium ${cc.pill}`}>
                    {cc.label}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: cc.bar }}
                  />
                </div>
              </div>

              <hr className="border-border" />

              {/* Footer */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  <span>Horas extras: </span>
                  <span className="text-foreground font-medium">{area.allowOvertime ? "Sí" : "No"}</span>
                  <span className="mx-1.5">·</span>
                  <span>Descanso: </span>
                  <span className="text-foreground font-medium">{area.minRestHours}h</span>
                </p>
                <button
                  onClick={() => setEditing(area.id)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Ver detalle
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {areas.length === 0 && (
          <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
            Sin áreas configuradas
          </div>
        )}
      </div>

      {editing && (
        <AreaModal
          area={editing === "new" ? null : (areas.find(a => a.id === editing) ?? null)}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
          onSave={area => { upsertArea(area); setEditing(null); }}
          onDelete={id => { removeArea(id); setEditing(null); }}
        />
      )}
    </>
  );
}

function AreaModal({
  area,
  canDelete,
  onClose,
  onSave,
  onDelete,
}: {
  area: Area | null;
  canDelete: boolean;
  onClose: () => void;
  onSave: (a: Area) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState<Area>(() => area ?? {
    id: `area-${Date.now()}`,
    name: "",
    leader: "",
    startHour: 8,
    endHour: 18,
    workingDays: [1, 2, 3, 4, 5],
    maxHoursDay: 8,
    maxHoursWeek: 46,
    maxHoursMonth: 192,
    allowOvertime: false,
    allowSunday: false,
    minRestHours: 12,
    coverageRequirements: [],
    enableCoverageMode: false,
  });

  function set<K extends keyof Area>(k: K, v: Area[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function toggleDay(day: number) {
    const days = form.workingDays.includes(day)
      ? form.workingDays.filter(d => d !== day)
      : [...form.workingDays, day].sort((a, b) => a - b);
    set("workingDays", days);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-card shadow-card w-full my-4 sm:my-8"
        style={{ maxWidth: 560 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-border">
          <h3 className="font-semibold text-base">
            {area ? "Configurar área" : "Nueva área"}
          </h3>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "68vh" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre del área">
              <input
                className="fi"
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="Ej. Cocina, Servicio..."
              />
            </Field>
            <Field label="Líder">
              <input
                className="fi"
                value={form.leader}
                onChange={e => set("leader", e.target.value)}
                placeholder="Nombre del responsable"
              />
            </Field>
            <Field label="Hora inicio">
              <input
                type="number"
                className="fi"
                min={0}
                max={23}
                value={form.startHour}
                onChange={e => set("startHour", Number(e.target.value))}
              />
            </Field>
            <Field label="Hora fin">
              <input
                type="number"
                className="fi"
                min={1}
                max={24}
                value={form.endHour}
                onChange={e => set("endHour", Number(e.target.value))}
              />
            </Field>
            <Field label="Máx. horas / día">
              <input
                type="number"
                className="fi"
                value={form.maxHoursDay}
                onChange={e => set("maxHoursDay", Number(e.target.value))}
              />
            </Field>
            <Field label="Máx. horas / semana">
              <input
                type="number"
                className="fi"
                value={form.maxHoursWeek}
                onChange={e => set("maxHoursWeek", Number(e.target.value))}
              />
            </Field>
            <Field label="Máx. horas / mes">
              <input
                type="number"
                className="fi"
                value={form.maxHoursMonth}
                onChange={e => set("maxHoursMonth", Number(e.target.value))}
              />
            </Field>
            <Field label="Descanso mínimo (h)">
              <input
                type="number"
                className="fi"
                value={form.minRestHours}
                onChange={e => set("minRestHours", Number(e.target.value))}
              />
            </Field>
          </div>

          {/* Working days */}
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Días laborales
            </span>
            <div className="mt-2 flex gap-2 flex-wrap">
              {DAYS.map(({ day, label }) => {
                const active = form.workingDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`h-9 min-w-9 px-2.5 rounded-pill text-sm font-medium transition-colors border ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ToggleField label="Horas extras"      value={form.allowOvertime}      onChange={v => set("allowOvertime", v)} />
            <ToggleField label="Trabajo dominical"  value={form.allowSunday}        onChange={v => set("allowSunday", v)} />
            <ToggleField label="Modo cobertura"     value={form.enableCoverageMode} onChange={v => set("enableCoverageMode", v)} />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center gap-2">
          {area && canDelete && (
            <button
              onClick={() => onDelete(area.id)}
              className="text-sm px-4 py-2 rounded-pill border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
            >
              Eliminar
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={() => onSave(form)}
              className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90"
            >
              {area ? "Guardar cambios" : "Crear área"}
            </button>
          </div>
        </div>

        <style>{`.fi{width:100%;border:1px solid var(--color-input);border-radius:999px;padding:.5rem .875rem;font-size:.875rem;background:var(--color-card);outline:none}.fi:focus{border-color:color-mix(in srgb,var(--color-primary) 40%,transparent)}`}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition ${value ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${value ? "left-4" : "left-0.5"}`} />
      </button>
      <span className="text-muted-foreground">{label}</span>
    </label>
  );
}
