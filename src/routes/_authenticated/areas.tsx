import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/wfm/Topbar";
import { useWFM } from "@/lib/wfm/store";
import { useAuth } from "@/lib/auth";
import React, { useState } from "react";
import { Building2, ChevronRight, Info, Plus, Settings, Trash2 } from "lucide-react";
import type { Area, CoverageRequirement } from "@/lib/wfm/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

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

const DAY_SHORT: Record<number, string> = { 0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb" };

function padH(h: number) { return String(h).padStart(2, "0"); }

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
  const { hasPermission, hasLimit, profile } = useAuth();
  const canEdit   = hasPermission("areas", "edit");
  const canDelete = hasLimit("canDeleteData");

  const ownArea = profile?.areaId ?? null;
  const visibleAreas = ownArea ? areas.filter(a => a.id === ownArea) : areas;

  const [editing, setEditing] = useState<string | null>(null);

  const todayDow = new Date().getDay();

  return (
    <>
      <Topbar
        title="Áreas y configuración"
        subtitle="Reglas operativas por área"
        right={
          canEdit && !ownArea ? (
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
        className="px-4 md:px-6 py-4 md:py-6 max-w-[1280px] mx-auto"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "1.25rem" }}
      >
        {visibleAreas.map(area => {
          const areaEmps   = employees.filter(e => e.areaId === area.id);
          const active     = areaEmps.filter(e => e.status === "active").length;
          const inactive   = areaEmps.length - active;
          // Sumar mínimos de todas las franjas del día (pueden ser varias por turno).
          const todayReqs  = area.coverageRequirements.filter(r => r.dayOfWeek === todayDow);
          const minCov     = todayReqs.reduce((sum, r) => sum + r.minWorkers, 0);
          const hasCovReq  = area.enableCoverageMode && minCov > 0;
          const pct        = hasCovReq ? Math.min(Math.round((active / minCov) * 100), 100) : null;
          const cc         = pct !== null ? coverageColor(pct) : null;

          return (
            <div
              key={area.id}
              className="rounded-card bg-card shadow-card p-5 flex flex-col gap-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="shrink-0 size-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Building2 style={{ width: 22, height: 22 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-medium text-lg truncate">{area.name}</h3>
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
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-secondary rounded-xl p-3 text-center">
                  <div className="font-display text-[2rem] font-medium tabular-nums leading-none">{active}</div>
                  <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Activos{inactive > 0 && <span className="opacity-60"> /{areaEmps.length}</span>}
                  </div>
                </div>
                <div className="bg-secondary rounded-xl p-3 text-center">
                  <div className="font-display text-[2rem] font-medium tabular-nums leading-none">{hasCovReq ? minCov : "—"}</div>
                  <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Mín. cobertura</div>
                </div>
                <div className="bg-secondary rounded-xl p-3 text-center">
                  <div className="font-display text-[2rem] font-medium tabular-nums leading-none">
                    {pct !== null
                      ? <>{pct}<span className="text-lg font-normal text-muted-foreground">%</span></>
                      : <span className="text-lg font-normal text-muted-foreground">—</span>
                    }
                  </div>
                  <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Cobertura</div>
                </div>
              </div>

              {/* Coverage bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Cobertura actual de hoy</span>
                  {cc ? (
                    <span className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-medium ${cc.pill}`}>
                      {cc.label}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-medium bg-secondary text-muted-foreground">
                      Sin requisito
                    </span>
                  )}
                </div>
                <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: pct !== null ? `${pct}%` : "0%", backgroundColor: cc?.bar ?? "transparent" }}
                  />
                </div>
              </div>


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

        {visibleAreas.length === 0 && (
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingSave, setConfirmingSave] = useState(false);
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
    holidaySchedule: { active: false, start: 8, end: 18 },
  });

  const [newReq, setNewReq] = useState({ startHour: 8, endHour: 16, minWorkers: 2, preferredWorkers: 3 });
  const [selectedDays, setSelectedDays] = useState<number[]>([1]);

  function set<K extends keyof Area>(k: K, v: Area[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function toggleNewDay(day: number) {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  function addReq() {
    if (newReq.endHour <= newReq.startHour) {
      toast.error("La hora de fin debe ser posterior a la hora de inicio.");
      return;
    }
    if (selectedDays.length === 0) {
      toast.error("Selecciona al menos un día.");
      return;
    }
    const toAdd: CoverageRequirement[] = [];
    const skipped: string[] = [];
    for (const day of selectedDays) {
      const isDuplicate = form.coverageRequirements.some(
        r => r.dayOfWeek === day && r.startHour === newReq.startHour && r.endHour === newReq.endHour
      );
      if (isDuplicate) skipped.push(DAY_SHORT[day]);
      else toAdd.push({ dayOfWeek: day, ...newReq });
    }
    if (toAdd.length > 0) set("coverageRequirements", [...form.coverageRequirements, ...toAdd]);
    if (skipped.length > 0) toast.warning(`Franja ya existente para: ${skipped.join(", ")}`);
  }

  function removeReq(req: CoverageRequirement) {
    set("coverageRequirements", form.coverageRequirements.filter(r =>
      !(r.dayOfWeek === req.dayOfWeek && r.startHour === req.startHour && r.endHour === req.endHour)
    ));
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
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <ToggleField label="Horas extras"     value={form.allowOvertime} onChange={v => set("allowOvertime", v)} />
              <ToggleField label="Trabajo dominical" value={form.allowSunday}   onChange={v => set("allowSunday", v)} />
            </div>

            {/* Modo cobertura — standalone con descripción */}
            <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 space-y-1.5">
              <ToggleField
                label="Modo cobertura"
                value={form.enableCoverageMode}
                onChange={v => set("enableCoverageMode", v)}
                tooltip={
                  <span>
                    <strong>Cómo funciona:</strong> define franjas horarias (ej. 06–14 y 14–22) y el scheduler distribuye a los empleados automáticamente entre turnos, rotándolos semana a semana. En la tabla de programación aparecen indicadores de cobertura por franja y día.
                  </span>
                }
              />
              <p className="text-xs text-muted-foreground leading-relaxed pl-11">
                Programa empleados por turnos y franjas horarias según la demanda real del área,
                en lugar de asignar un horario único a todos.
              </p>
            </div>
          </div>

          {/* Horario para días festivos */}
          <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 space-y-3">
            <ToggleField
              label="Horario especial para festivos"
              value={form.holidaySchedule?.active ?? false}
              onChange={v => set("holidaySchedule", { ...(form.holidaySchedule ?? { start: 8, end: 18 }), active: v })}
              tooltip={
                <span>
                  Cuando está activo, los días festivos (según el calendario colombiano) usarán
                  este horario en lugar del horario habitual del día de la semana. Aplica tanto
                  para la generación automática de turnos como para la validación manual.
                </span>
              }
            />
            {form.holidaySchedule?.active && (
              <div className="grid grid-cols-2 gap-3 pl-11">
                <Field label="Hora inicio festivo">
                  <input
                    type="number"
                    className="fi"
                    min={0}
                    max={23}
                    value={form.holidaySchedule.start}
                    onChange={e => set("holidaySchedule", { ...form.holidaySchedule, start: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Hora fin festivo">
                  <input
                    type="number"
                    className="fi"
                    min={1}
                    max={24}
                    value={form.holidaySchedule.end}
                    onChange={e => set("holidaySchedule", { ...form.holidaySchedule, end: Number(e.target.value) })}
                  />
                </Field>
                <p className="col-span-2 text-xs text-muted-foreground -mt-1">
                  Ejemplo: {padH(form.holidaySchedule.start)}:00 – {padH(form.holidaySchedule.end)}:00 en festivos,
                  en lugar de {padH(form.startHour)}:00 – {padH(form.endHour)}:00 habitual.
                </p>
              </div>
            )}
          </div>

          {/* Coverage requirements — solo visible cuando el modo cobertura está activo */}
          {form.enableCoverageMode && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Franjas de cobertura</span>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="size-3.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-72 leading-relaxed whitespace-normal text-left space-y-1 bg-popover text-popover-foreground border border-border shadow-md">
                        <p><strong>Día</strong> — día de la semana que aplica la franja.</p>
                        <p><strong>Desde / Hasta</strong> — horario del turno en horas (ej. 6 → 14).</p>
                        <p><strong>Mín.</strong> — trabajadores mínimos requeridos. Si no se alcanza, el scheduler lo marca como crítico.</p>
                        <p><strong>Pref.</strong> — trabajadores ideales. Si hay entre mínimo y preferido, se marca como alerta.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {form.coverageRequirements.length > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {form.coverageRequirements.length} franja{form.coverageRequirements.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Lista de requisitos existentes */}
              <div className="space-y-1.5">
                {form.coverageRequirements
                  .slice()
                  .sort((a, b) => a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.startHour - b.startHour)
                  .map((req, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2">
                      <span className="w-9 shrink-0 text-center text-[11px] font-semibold rounded-md bg-primary/10 text-primary py-0.5">
                        {DAY_SHORT[req.dayOfWeek]}
                      </span>
                      <span className="flex-1 tabular-nums text-sm">
                        {padH(req.startHour)}:00 – {padH(req.endHour)}:00
                      </span>
                      <span className="text-xs text-muted-foreground">
                        mín. <strong className="text-foreground">{req.minWorkers}</strong>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        pref. <strong className="text-foreground">{req.preferredWorkers ?? req.minWorkers}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeReq(req)}
                        className="ml-1 p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                {form.coverageRequirements.length === 0 && (
                  <p className="text-xs text-muted-foreground/60 py-2 text-center">Sin franjas definidas</p>
                )}
              </div>

              {/* Formulario para agregar nueva franja */}
              <div className="rounded-xl border border-dashed border-border p-3 space-y-2.5">
                <p className="text-xs font-medium text-muted-foreground">Nueva franja</p>

                {/* Selector de días */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Días</label>
                    <div className="flex gap-1">
                      {[
                        { label: "L–V", days: [1, 2, 3, 4, 5] },
                        { label: "L–S", days: [1, 2, 3, 4, 5, 6] },
                        { label: "Todos", days: [1, 2, 3, 4, 5, 6, 0] },
                      ].map(({ label, days }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setSelectedDays(days)}
                          className="text-[10px] px-2 py-0.5 rounded-full border border-border hover:border-primary/50 hover:text-primary text-muted-foreground transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAYS.map(({ day, label }) => {
                      const active = selectedDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleNewDay(day)}
                          className={`h-8 min-w-8 px-2 rounded-pill text-xs font-semibold transition-colors border ${
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

                {/* Horario y trabajadores */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Desde</label>
                    <input type="number" className="fi mt-0.5" min={0} max={23}
                      value={newReq.startHour}
                      onChange={e => setNewReq(r => ({ ...r, startHour: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Hasta</label>
                    <input type="number" className="fi mt-0.5" min={1} max={24}
                      value={newReq.endHour}
                      onChange={e => setNewReq(r => ({ ...r, endHour: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Mín.</label>
                    <input type="number" className="fi mt-0.5" min={1}
                      value={newReq.minWorkers}
                      onChange={e => setNewReq(r => ({ ...r, minWorkers: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Pref.</label>
                    <input type="number" className="fi mt-0.5" min={1}
                      value={newReq.preferredWorkers ?? newReq.minWorkers}
                      onChange={e => setNewReq(r => ({ ...r, preferredWorkers: Number(e.target.value) }))} />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addReq}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-pill bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                >
                  <Plus className="size-3.5" />
                  {selectedDays.length > 1 ? `Agregar ${selectedDays.length} franjas` : "Agregar franja"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center gap-2">
          {area && canDelete && (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-destructive font-medium">¿Eliminar esta área?</span>
                <button
                  onClick={() => onDelete(area.id)}
                  className="text-sm px-3 py-1.5 rounded-pill bg-destructive text-white hover:opacity-90 transition-opacity"
                >
                  Sí, eliminar
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="text-sm px-3 py-1.5 rounded-pill border border-border hover:bg-secondary"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="text-sm px-4 py-2 rounded-pill border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
              >
                Eliminar
              </button>
            )
          )}
          {!confirmingDelete && (
            <div className="ml-auto flex gap-2">
              {confirmingSave ? (
                <>
                  <span className="text-sm text-foreground font-medium self-center">
                    {area ? "¿Guardar cambios?" : "¿Crear el área?"}
                  </span>
                  <button
                    onClick={() => onSave(form)}
                    className="text-sm px-3 py-1.5 rounded-pill bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    {area ? "Sí, guardar" : "Sí, crear"}
                  </button>
                  <button
                    onClick={() => setConfirmingSave(false)}
                    className="text-sm px-3 py-1.5 rounded-pill border border-border hover:bg-secondary"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={onClose}
                    className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => setConfirmingSave(true)}
                    className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90"
                  >
                    {area ? "Guardar cambios" : "Crear área"}
                  </button>
                </>
              )}
            </div>
          )}
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

function ToggleField({ label, value, onChange, tooltip }: { label: string; value: boolean; onChange: (v: boolean) => void; tooltip?: React.ReactNode }) {
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
      {tooltip && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild onClick={e => e.preventDefault()}>
              <Info className="size-3.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-help shrink-0" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 leading-relaxed whitespace-normal text-left bg-popover text-popover-foreground border border-border shadow-md">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </label>
  );
}
