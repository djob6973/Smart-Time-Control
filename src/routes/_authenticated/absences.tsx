import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/wfm/Topbar";
import { useWFM } from "@/lib/wfm/store";
import { parseAbsNote } from "@/lib/wfm/calc";
import { useAuth } from "@/lib/auth";
import { useState, useMemo, type ElementType } from "react";
import { dispatchAbsenceEvent } from "@/lib/notifications/dispatch";
import { Plus, CalendarX2, Clock, CheckCircle2, Calendar, PencilLine, Trash2 } from "lucide-react";
import type { AbsenceStatus, AbsenceType, Absence } from "@/lib/wfm/types";

export const Route = createFileRoute("/_authenticated/absences")({
  head: () => ({ meta: [{ title: "Ausencias · STC" }] }),
  component: AbsencesPage,
});

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */
const TYPE_META: Record<AbsenceType, { label: string; color: string }> = {
  vacaciones:    { label: "Vacaciones",    color: "#1d6e85" },
  incapacidad:   { label: "Incapacidad",   color: "#ED5650" },
  licencia:      { label: "Licencia",      color: "#8b5cf6" },
  permiso:       { label: "Permiso",       color: "#1F8A5B" },
  no_remunerada: { label: "No remunerada", color: "#C98A00" },
  compensatorio: { label: "Compensatorio", color: "#6366f1" },
};

type StatusFilter = "todas" | AbsenceStatus;

const STATUS_META: Record<AbsenceStatus, { label: string; bg: string; text: string }> = {
  pendiente: { label: "Pendiente", bg: "bg-[color-mix(in_srgb,#C98A00_15%,transparent)]", text: "text-[#9a6b00]" },
  aprobada:  { label: "Aprobada",  bg: "bg-[color-mix(in_srgb,#1F8A5B_14%,transparent)]", text: "text-[#1F8A5B]" },
  rechazada: { label: "Rechazada", bg: "bg-primary/10",                                    text: "text-[var(--brand-coral)]" },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
function ini(name: string): string {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function countDays(a: Absence): number {
  if (a.startHour !== undefined && a.endHour !== undefined) {
    return Math.max(0, a.endHour - a.startHour) / 8;
  }
  const s = new Date(a.startDate + "T00:00:00");
  const e = new Date(a.endDate + "T00:00:00");
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

const MONTH_SHORT = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

function fmtShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(d)} ${MONTH_SHORT[parseInt(m) - 1]}`;
}

function fmtPeriod(a: Absence): string {
  if (a.startHour !== undefined && a.endHour !== undefined) {
    const from = fmtShort(a.startDate);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${from} · ${pad(a.startHour)}:00 – ${pad(a.endHour)}:00`;
  }
  const from = fmtShort(a.startDate);
  const to   = fmtShort(a.endDate);
  return a.startDate === a.endDate ? from : `${from} – ${to}`;
}

function fmtDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */
function KpiCard({
  label, value, unit, foot, icon: Icon, alert,
}: {
  label: string; value: number; unit?: string; foot: string;
  icon: ElementType; alert?: boolean;
}) {
  return (
    <div className={`rounded-card p-5 flex flex-col gap-3 ${
      alert
        ? "bg-foreground text-background dark:bg-primary/10 dark:text-foreground dark:border dark:border-primary/25"
        : "bg-card border border-border shadow-card"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[13px] font-medium leading-snug ${alert ? "text-background/70 dark:text-muted-foreground" : "text-muted-foreground"}`}>
          {label}
        </span>
        <span className={`p-1.5 rounded-lg ${alert ? "bg-background/10 dark:bg-primary/20" : "bg-secondary"}`}>
          <Icon className={`size-4 ${alert ? "text-background/80 dark:text-primary/70" : "text-muted-foreground"}`} />
        </span>
      </div>
      <div className={`text-[32px] font-semibold leading-none tracking-tight ${alert ? "text-background dark:text-foreground" : "text-foreground"}`}>
        {value}
        {unit && <span className={`text-base font-medium ml-1 ${alert ? "text-background/60 dark:text-muted-foreground" : "text-muted-foreground"}`}>{unit}</span>}
      </div>
      <div className={`text-xs ${alert ? "text-background/60 dark:text-muted-foreground" : "text-muted-foreground"}`}>{foot}</div>
    </div>
  );
}

function StatusPill({ status }: { status: AbsenceStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[11px] font-medium ${m.bg} ${m.text}`}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {m.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail / Approval modal                                             */
/* ------------------------------------------------------------------ */
type DetailStep = "view" | "approving" | "rejecting";

function DetailModal({
  absence, empName, onClose, onDecide, onEdit, canApprove, initialStep,
}: {
  absence: Absence;
  empName: string;
  onClose: () => void;
  onDecide: (id: string, status: AbsenceStatus, note?: string) => void;
  onEdit?: () => void;
  canApprove: boolean;
  initialStep?: DetailStep;
}) {
  const [step, setStep] = useState<DetailStep>(initialStep ?? "view");
  const [rejectNote, setRejectNote] = useState("");
  const status: AbsenceStatus = absence.status ?? "pendiente";
  const tm = TYPE_META[absence.type];
  const days = countDays(absence);
  const isPending = status === "pendiente" && canApprove;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-card shadow-card max-w-[440px] w-full my-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="size-9 rounded-lg flex items-center justify-center bg-secondary">
            <CalendarX2 className="size-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{empName}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="size-2 rounded-full flex-shrink-0"
                style={{ background: tm.color }}
              />
              <span className="text-xs text-muted-foreground">{tm.label}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-full flex items-center justify-center hover:bg-secondary text-muted-foreground"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "68vh" }}>
          {/* KV list */}
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {[
              ["Período",  fmtPeriod(absence)],
              ["Días",     `${days % 1 === 0 ? days : days.toFixed(1)} ${days === 1 ? "día" : "días"}`],
              ["Estado",   null as null],
            ].map(([k, v]) => (
              <div key={k as string} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <span className="text-muted-foreground text-xs">{k}</span>
                {v !== null
                  ? <span className="font-medium text-xs">{v}</span>
                  : <StatusPill status={status} />
                }
              </div>
            ))}
          </div>

          {/* Reason */}
          {absence.reason && (
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Motivo de la solicitud</div>
              <div className="rounded-lg bg-secondary/60 px-3 py-2.5 text-sm text-foreground leading-relaxed">
                {absence.reason}
              </div>
            </div>
          )}

          {/* Decision details — visible to everyone once decided */}
          {(status === "aprobada" || status === "rechazada") && (absence.decidedBy || absence.decisionNote) && (
            <div>
              <div className={`text-xs font-medium uppercase tracking-wider mb-1.5 ${
                status === "aprobada" ? "text-[#1F8A5B]" : "text-[var(--brand-coral)]"
              }`}>
                {status === "aprobada" ? "Aprobación" : "Rechazo"}
              </div>
              <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {absence.decidedBy && (
                  <div className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground text-xs">
                      {status === "aprobada" ? "Aprobado por" : "Rechazado por"}
                    </span>
                    <span className="font-medium text-xs">{absence.decidedBy}</span>
                  </div>
                )}
                {absence.decidedAt && (
                  <div className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground text-xs">Fecha de decisión</span>
                    <span className="font-medium text-xs">{fmtDatetime(absence.decidedAt)}</span>
                  </div>
                )}
              </div>
              {absence.decisionNote && (
                <div className={`mt-2 rounded-lg px-3 py-2.5 text-sm leading-relaxed ${
                  status === "aprobada"
                    ? "bg-[color-mix(in_srgb,#1F8A5B_8%,transparent)] text-[#1F8A5B]"
                    : "bg-primary/5 text-foreground"
                }`}>
                  <span className="text-[11px] font-medium uppercase tracking-wider block mb-1 opacity-70">
                    {status === "aprobada" ? "Nota" : "Motivo del rechazo"}
                  </span>
                  {absence.decisionNote}
                </div>
              )}
            </div>
          )}

          {/* Confirm approve */}
          {step === "approving" && (
            <div className="rounded-lg border border-[#1F8A5B]/30 bg-[color-mix(in_srgb,#1F8A5B_8%,transparent)] px-4 py-3">
              <p className="text-sm font-medium text-[#1F8A5B]">¿Confirmas que deseas aprobar esta solicitud?</p>
              <p className="text-xs text-muted-foreground mt-1">
                El trabajador recibirá una notificación con la decisión.
              </p>
            </div>
          )}

          {/* Reject reason (required) */}
          {step === "rejecting" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Motivo del rechazo <span className="normal-case font-normal text-[var(--brand-coral)]">*&nbsp;obligatorio</span>
              </label>
              <textarea
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                rows={3}
                placeholder="Indica el motivo por el que se rechaza la solicitud…"
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                autoFocus
              />
              {rejectNote.trim() === "" && (
                <p className="text-xs text-[var(--brand-coral)] mt-1">Debes ingresar un motivo para rechazar.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-2">
          <div>
            {step === "view" && onEdit && (
              <button
                onClick={() => { onClose(); onEdit(); }}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary text-muted-foreground transition-colors"
              >
                <PencilLine className="size-3.5" />
                Editar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "view" && isPending ? (
              <>
                <button
                  onClick={() => setStep("rejecting")}
                  className="text-sm px-4 py-2 rounded-pill border border-[var(--brand-coral)] text-[var(--brand-coral)] hover:bg-primary/8 transition-colors"
                >
                  Rechazar
                </button>
                <button
                  onClick={() => setStep("approving")}
                  className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Aprobar solicitud
                </button>
              </>
            ) : step === "approving" ? (
              <>
                <button
                  onClick={() => setStep("view")}
                  className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { onDecide(absence.id, "aprobada"); onClose(); }}
                  className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Confirmar aprobación
                </button>
              </>
            ) : step === "rejecting" ? (
              <>
                <button
                  onClick={() => { setStep("view"); setRejectNote(""); }}
                  className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary transition-colors"
                >
                  Cancelar
                </button>
                <button
                  disabled={rejectNote.trim() === ""}
                  onClick={() => { onDecide(absence.id, "rechazada", rejectNote.trim()); onClose(); }}
                  className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirmar rechazo
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary transition-colors"
              >
                Cerrar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Create / Edit modal                                                 */
/* ------------------------------------------------------------------ */
function AbsenceFormModal({ employees, initial, onClose, onSave }: {
  employees: { id: string; fullName: string }[];
  initial?: Absence;
  onClose: () => void;
  onSave: (a: Absence) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = !!initial;
  const [form, setForm] = useState({
    employeeId: initial?.employeeId ?? employees[0]?.id ?? "",
    type:       initial?.type ?? ("vacaciones" as AbsenceType),
    startDate:  initial?.startDate ?? today,
    endDate:    initial?.endDate   ?? today,
    reason:     initial?.reason    ?? "",
    partial:    initial?.startHour !== undefined && initial?.endHour !== undefined,
    startTime:  initial?.startHour !== undefined
      ? `${String(initial.startHour).padStart(2, "0")}:00`
      : "08:00",
    endTime:    initial?.endHour !== undefined
      ? `${String(initial.endHour).padStart(2, "0")}:00`
      : "17:00",
  });

  function handleSave() {
    const absence: Absence = {
      id:         initial?.id ?? `a-${Date.now()}`,
      employeeId: form.employeeId,
      type:       form.type,
      startDate:  form.startDate,
      endDate:    form.endDate,
      reason:     form.reason,
      status:     initial?.status ?? "pendiente",
    };
    if (form.partial) {
      absence.startHour = parseInt(form.startTime.split(":")[0], 10);
      absence.endHour   = parseInt(form.endTime.split(":")[0], 10);
    }
    onSave(absence);
  }

  const field = "w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-primary/40";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div className="bg-card rounded-card shadow-card max-w-lg w-full my-4" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-sm">
            {isEdit ? "Editar ausencia" : "Nueva solicitud de ausencia"}
          </h3>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto" style={{ maxHeight: "68vh" }}>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Empleado</span>
            <select className={`${field} mt-1`} value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</span>
            <select className={`${field} mt-1`} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as AbsenceType })}>
              {(Object.keys(TYPE_META) as AbsenceType[]).map(k => (
                <option key={k} value={k}>{TYPE_META[k].label}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha inicio</span>
              <input
                type="date" className={`${field} mt-1`} value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha fin</span>
              <input
                type="date" className={`${field} mt-1`} value={form.endDate} min={form.startDate}
                onChange={e => setForm({ ...form, endDate: e.target.value })}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none py-0.5">
            <input
              type="checkbox" className="rounded" checked={form.partial}
              onChange={e => setForm({ ...form, partial: e.target.checked })}
            />
            <span className="text-sm font-medium">Ausencia parcial (por horas)</span>
          </label>

          {form.partial && (
            <div className="grid grid-cols-2 gap-3 pl-5 border-l-2 border-amber-300">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hora inicio</span>
                <input type="time" step="3600" className={`${field} mt-1`} value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hora fin</span>
                <input type="time" step="3600" className={`${field} mt-1`} value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Motivo</span>
            <textarea
              className={`${field} mt-1 min-h-[80px] resize-none rounded-lg`}
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
            />
          </label>
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary">Cancelar</button>
          <button onClick={handleSave} className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90">
            {isEdit ? "Guardar cambios" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */
function AbsencesPage() {
  const { absences, employees, shifts, upsertAbsence, removeAbsence, clearShift, setShift } = useWFM();
  const { hasPermission, hasLimit, profile } = useAuth();

  const canCreate  = hasPermission("absences", "edit");
  const canApprove = hasLimit("canApproveAbsences");
  const ownArea    = profile?.areaId ?? null;

  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>("todas");
  const [typeFilter,     setTypeFilter]     = useState<"all" | AbsenceType>("all");
  const [detailId,       setDetailId]       = useState<string | null>(null);
  const [detailStep,     setDetailStep]     = useState<DetailStep>("view");
  const [createOpen,     setCreateOpen]     = useState(false);
  const [editAbsence,    setEditAbsence]    = useState<Absence | null>(null);
  const [deleteAbsence,  setDeleteAbsence]  = useState<Absence | null>(null);

  function openDetail(id: string, step: DetailStep = "view") {
    setDetailId(id);
    setDetailStep(step);
  }

  const visibleAbsences = useMemo(() =>
    ownArea
      ? absences.filter(a => employees.find(e => e.id === a.employeeId)?.areaId === ownArea)
      : absences,
    [absences, employees, ownArea],
  );

  const filtered = useMemo(() =>
    visibleAbsences.filter(a => {
      const s: AbsenceStatus = a.status ?? "pendiente";
      const statusOk = statusFilter === "todas" || s === statusFilter;
      const typeOk   = typeFilter === "all" || a.type === typeFilter;
      return statusOk && typeOk;
    }),
    [visibleAbsences, statusFilter, typeFilter],
  );

  /* KPIs */
  const pendingCount  = visibleAbsences.filter(a => (a.status ?? "pendiente") === "pendiente").length;
  const approvedCount = visibleAbsences.filter(a => (a.status ?? "pendiente") === "aprobada").length;
  const approvedDays  = visibleAbsences
    .filter(a => (a.status ?? "pendiente") === "aprobada")
    .reduce((s, a) => s + countDays(a), 0);

  const chipCounts: Record<StatusFilter, number> = {
    todas:     visibleAbsences.length,
    pendiente: pendingCount,
    aprobada:  approvedCount,
    rechazada: visibleAbsences.filter(a => (a.status ?? "pendiente") === "rechazada").length,
  };

  const CHIPS: { key: StatusFilter; label: string }[] = [
    { key: "todas",     label: "Todas" },
    { key: "pendiente", label: "Pendientes" },
    { key: "aprobada",  label: "Aprobadas" },
    { key: "rechazada", label: "Rechazadas" },
  ];

  function handleDecide(id: string, status: AbsenceStatus, note?: string) {
    const a = absences.find(ab => ab.id === id);
    if (!a) return;
    upsertAbsence({
      ...a,
      status,
      decisionNote: note ?? undefined,
      decidedBy: profile?.fullName ?? undefined,
      decidedAt: new Date().toISOString(),
    });
    if (status === "aprobada" || status === "rechazada") {
      const emp = employees.find(e => e.id === a.employeeId);
      dispatchAbsenceEvent({ data: {
        event: status === "aprobada" ? "absence_approved" : "absence_rejected",
        employeeId: a.employeeId,
        employeeName: emp?.fullName ?? "",
        absenceType: TYPE_META[a.type]?.label ?? a.type,
        startDate: a.startDate,
        endDate: a.endDate,
        ...(note ? { note } : {}),
      }}).catch(e => console.error("[notif:absence]", e?.message ?? e));
    }
  }

  // Sync ABS shift records when an absence is edited or deleted.
  // oldAbs: the absence before the change.
  // newAbs: the updated absence (undefined = delete).
  function syncAbsShifts(oldAbs: Absence, newAbs?: Absence) {
    const matching = shifts.filter(s =>
      s.employeeId === oldAbs.employeeId &&
      s.code === "ABS" &&
      s.date >= oldAbs.startDate &&
      s.date <= oldAbs.endDate &&
      parseAbsNote(s.note)?.type === oldAbs.type,
    );
    for (const s of matching) {
      const inNewRange =
        newAbs &&
        s.employeeId === newAbs.employeeId &&
        s.date >= newAbs.startDate &&
        s.date <= newAbs.endDate;

      if (!inNewRange) {
        clearShift(s.employeeId, s.date);
      } else {
        const newNote =
          newAbs!.startHour !== undefined && newAbs!.endHour !== undefined
            ? `abs:${newAbs!.type}:${newAbs!.startHour}:${newAbs!.endHour}`
            : `abs:${newAbs!.type}`;
        setShift(s.employeeId, s.date, { note: newNote });
      }
    }
  }

  const detailAbsence = detailId ? absences.find(a => a.id === detailId) : null;
  const detailEmp     = detailAbsence ? employees.find(e => e.id === detailAbsence.employeeId) : null;

  const visibleEmployees = ownArea ? employees.filter(e => e.areaId === ownArea) : employees;

  return (
    <>
      <Topbar
        title="Ausencias"
        subtitle="Solicitudes y aprobaciones"
        right={
          canCreate ? (
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-pill bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nueva solicitud</span>
            </button>
          ) : undefined
        }
      />

      <div className="p-4 md:p-6 space-y-5">
        {/* KPI cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            label="Solicitudes"
            value={visibleAbsences.length}
            foot="Este mes"
            icon={CalendarX2}
          />
          <KpiCard
            label="Pendientes"
            value={pendingCount}
            foot="Requieren revisión"
            icon={Clock}
            alert={pendingCount > 0}
          />
          <KpiCard
            label="Aprobadas"
            value={approvedCount}
            foot="Este mes"
            icon={CheckCircle2}
          />
          <KpiCard
            label="Días de ausencia"
            value={approvedDays}
            unit="d"
            foot="Aprobados"
            icon={Calendar}
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Chip tabs */}
          <div className="flex items-center gap-1 bg-secondary rounded-pill p-1">
            {CHIPS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-medium transition-colors ${
                  statusFilter === key
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                <span className={`text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${
                  statusFilter === key
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-muted-foreground"
                }`}>
                  {chipCounts[key]}
                </span>
              </button>
            ))}
          </div>

          {/* Type filter */}
          <select
            className="rounded-pill border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 text-muted-foreground"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as "all" | AbsenceType)}
          >
            <option value="all">Todos los tipos</option>
            {(Object.keys(TYPE_META) as AbsenceType[]).map(k => (
              <option key={k} value={k}>{TYPE_META[k].label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="rounded-card border border-border bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Trabajador</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Tipo</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Período</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground text-right">Días</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const emp    = employees.find(e => e.id === a.employeeId);
                  const tm     = TYPE_META[a.type];
                  const status: AbsenceStatus = a.status ?? "pendiente";
                  const days   = countDays(a);

                  return (
                    <tr key={a.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                      {/* Trabajador */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="size-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                            {ini(emp?.fullName ?? "?")}
                          </div>
                          <span className="font-medium">{emp?.fullName ?? "—"}</span>
                        </div>
                      </td>

                      {/* Tipo */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full flex-shrink-0"
                            style={{ background: tm.color }}
                          />
                          <span className="text-muted-foreground">{tm.label}</span>
                        </div>
                      </td>

                      {/* Período */}
                      <td className="px-4 py-3 text-muted-foreground">{fmtPeriod(a)}</td>

                      {/* Días */}
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {days % 1 === 0 ? days : days.toFixed(1)}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        <StatusPill status={status} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {status === "pendiente" && canApprove ? (
                            <>
                              <button
                                onClick={() => openDetail(a.id, "view")}
                                className="text-[12px] px-2.5 py-1 rounded-pill hover:bg-secondary text-muted-foreground transition-colors"
                              >
                                Ver detalle
                              </button>
                              <button
                                onClick={() => openDetail(a.id, "rejecting")}
                                className="text-[12px] px-2.5 py-1 rounded-pill border border-[var(--brand-coral)] text-[var(--brand-coral)] hover:bg-primary/8 transition-colors"
                              >
                                Rechazar
                              </button>
                              <button
                                onClick={() => openDetail(a.id, "approving")}
                                className="text-[12px] px-2.5 py-1 rounded-pill bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                              >
                                Aprobar
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => openDetail(a.id)}
                              className="text-[12px] px-2.5 py-1 rounded-pill hover:bg-secondary text-muted-foreground transition-colors"
                            >
                              Ver detalle
                            </button>
                          )}
                          {canCreate && (
                            <>
                              <button
                                onClick={() => setEditAbsence(a)}
                                title="Editar ausencia"
                                className="size-7 rounded-full flex items-center justify-center hover:bg-secondary text-muted-foreground transition-colors"
                              >
                                <PencilLine className="size-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteAbsence(a)}
                                title="Eliminar ausencia"
                                className="size-7 rounded-full flex items-center justify-center hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-14 text-muted-foreground">
                      No hay solicitudes en este estado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {detailAbsence && detailEmp && (
        <DetailModal
          absence={detailAbsence}
          empName={detailEmp.fullName}
          onClose={() => { setDetailId(null); setDetailStep("view"); }}
          onDecide={handleDecide}
          canApprove={canApprove}
          initialStep={detailStep}
          onEdit={canCreate ? () => { setEditAbsence(detailAbsence); setDetailId(null); } : undefined}
        />
      )}

      {/* Create modal */}
      {createOpen && (
        <AbsenceFormModal
          employees={visibleEmployees}
          onClose={() => setCreateOpen(false)}
          onSave={a => {
            upsertAbsence(a);
            setCreateOpen(false);
            const emp = employees.find(e => e.id === a.employeeId);
            dispatchAbsenceEvent({ data: {
              event: "absence_created",
              employeeId: a.employeeId,
              employeeName: emp?.fullName ?? "",
              absenceType: TYPE_META[a.type as AbsenceType]?.label ?? a.type,
              startDate: a.startDate,
              endDate: a.endDate,
              areaId: emp?.areaId ?? null,
            }}).catch(e => console.error("[notif:absence]", e?.message ?? e));
          }}
        />
      )}

      {/* Edit modal */}
      {editAbsence && (
        <AbsenceFormModal
          employees={visibleEmployees}
          initial={editAbsence}
          onClose={() => setEditAbsence(null)}
          onSave={a => {
            syncAbsShifts(editAbsence, a);
            upsertAbsence(a);
            setEditAbsence(null);
          }}
        />
      )}

      {/* Delete confirm */}
      {deleteAbsence && (() => {
        const emp = employees.find(e => e.id === deleteAbsence.employeeId);
        return (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setDeleteAbsence(null)}
          >
            <div
              className="bg-card rounded-card shadow-card max-w-sm w-full p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="size-4 text-red-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Eliminar ausencia</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {emp?.fullName ?? "Empleado"} · {TYPE_META[deleteAbsence.type].label} · {fmtPeriod(deleteAbsence)}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Esta acción no se puede deshacer. ¿Confirmas que deseas eliminar esta ausencia?
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setDeleteAbsence(null)}
                  className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { syncAbsShifts(deleteAbsence); removeAbsence(deleteAbsence.id); setDeleteAbsence(null); }}
                  className="text-sm px-4 py-2 rounded-pill bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
