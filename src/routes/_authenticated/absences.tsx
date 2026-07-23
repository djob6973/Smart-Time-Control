import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/wfm/Topbar";
import { useWFM } from "@/lib/wfm/store";
import { parseAbsNote } from "@/lib/wfm/calc";
import { startOfWeek, toISO } from "@/lib/wfm/date";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import { useState, useMemo, useEffect, type ElementType } from "react";
import { dispatchAbsenceEvent } from "@/lib/notifications/dispatch";
import { Plus, CalendarX2, Clock, CheckCircle2, Calendar, PencilLine, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import type { AbsenceStatus, AbsenceType, Absence } from "@/lib/wfm/types";

type Period = "dia" | "semana" | "mes";

export const Route = createFileRoute("/_authenticated/absences")({
  head: () => ({ meta: [{ title: "Ausencias · STC" }] }),
  component: AbsencesPage,
});

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */
const TYPE_META: Record<AbsenceType, { color: string }> = {
  vacaciones:    { color: "#1d6e85" },
  incapacidad:   { color: "#ED5650" },
  licencia:      { color: "#8b5cf6" },
  permiso:       { color: "#1F8A5B" },
  no_remunerada: { color: "#C98A00" },
  compensatorio: { color: "#6366f1" },
};

const TYPE_LABEL_KEYS: Record<AbsenceType, TranslationKey> = {
  vacaciones:    "abs_type_vacaciones",
  incapacidad:   "abs_type_incapacidad",
  licencia:      "abs_type_licencia",
  permiso:       "abs_type_permiso",
  no_remunerada: "abs_type_no_remunerada",
  compensatorio: "abs_type_compensatorio",
};

const STATUS_META: Record<AbsenceStatus, { bg: string; text: string }> = {
  pendiente: { bg: "bg-[color-mix(in_srgb,#C98A00_15%,transparent)]", text: "text-[#9a6b00]" },
  aprobada:  { bg: "bg-[color-mix(in_srgb,#1F8A5B_14%,transparent)]", text: "text-[#1F8A5B]" },
  rechazada: { bg: "bg-primary/10",                                    text: "text-[var(--brand-coral)]" },
};

const STATUS_LABEL_KEYS: Record<AbsenceStatus, TranslationKey> = {
  pendiente: "absences_status_pending",
  aprobada:  "absences_status_approved",
  rechazada: "absences_status_rejected",
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
  label, value, unit, foot, icon: Icon, alert, active, onClick,
}: {
  label: string; value: number; unit?: string; foot: string;
  icon: ElementType; alert?: boolean; active?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={[
        "rounded-card p-5 flex flex-col gap-3 transition-all",
        onClick ? "cursor-pointer hover:-translate-y-0.5" : "",
        active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
        alert
          ? "bg-foreground text-background dark:bg-primary/10 dark:text-foreground dark:border dark:border-primary/25"
          : "bg-card shadow-card",
      ].join(" ")}
    >
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
  const { t } = useI18n();
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[11px] font-medium ${m.bg} ${m.text}`}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {t(STATUS_LABEL_KEYS[status])}
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
  const { t } = useI18n();
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
              <span className="text-xs text-muted-foreground">{t(TYPE_LABEL_KEYS[absence.type])}</span>
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
              [t("absences_detail_period"), fmtPeriod(absence)],
              [t("absences_col_days"),      `${days % 1 === 0 ? days : days.toFixed(1)} ${days === 1 ? t("absences_detail_day") : t("absences_detail_days")}`],
              [t("absences_col_status"),    null as null],
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
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{t("absences_detail_notes")}</div>
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
                {status === "aprobada" ? t("absences_detail_approval") : t("absences_detail_rejection")}
              </div>
              <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {absence.decidedBy && (
                  <div className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground text-xs">
                      {status === "aprobada" ? t("absences_detail_approved_by") : t("absences_detail_rejected_by")}
                    </span>
                    <span className="font-medium text-xs">{absence.decidedBy}</span>
                  </div>
                )}
                {absence.decidedAt && (
                  <div className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground text-xs">{t("absences_detail_decision_date")}</span>
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
                    {status === "aprobada" ? t("absences_detail_note_label") : t("absences_detail_reject_note")}
                  </span>
                  {absence.decisionNote}
                </div>
              )}
            </div>
          )}

          {/* Confirm approve */}
          {step === "approving" && (
            <div className="rounded-lg border border-[#1F8A5B]/30 bg-[color-mix(in_srgb,#1F8A5B_8%,transparent)] px-4 py-3">
              <p className="text-sm font-medium text-[#1F8A5B]">{t("absences_confirm_approve_msg")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("absences_confirm_approve_hint")}
              </p>
            </div>
          )}

          {/* Reject reason (required) */}
          {step === "rejecting" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                {t("absences_detail_reject_note")} <span className="normal-case font-normal text-[var(--brand-coral)]">*&nbsp;{t("required")}</span>
              </label>
              <textarea
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                rows={3}
                placeholder={t("absences_reject_placeholder")}
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                autoFocus
              />
              {rejectNote.trim() === "" && (
                <p className="text-xs text-[var(--brand-coral)] mt-1">{t("absences_reject_required")}</p>
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
                {t("edit")}
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
                  {t("absences_btn_reject")}
                </button>
                <button
                  onClick={() => setStep("approving")}
                  className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  {t("absences_btn_approve_request")}
                </button>
              </>
            ) : step === "approving" ? (
              <>
                <button
                  onClick={() => setStep("view")}
                  className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary transition-colors"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={() => { onDecide(absence.id, "aprobada"); onClose(); }}
                  className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  {t("absences_btn_confirm_approve")}
                </button>
              </>
            ) : step === "rejecting" ? (
              <>
                <button
                  onClick={() => { setStep("view"); setRejectNote(""); }}
                  className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary transition-colors"
                >
                  {t("cancel")}
                </button>
                <button
                  disabled={rejectNote.trim() === ""}
                  onClick={() => { onDecide(absence.id, "rechazada", rejectNote.trim()); onClose(); }}
                  className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("absences_btn_confirm_reject")}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary transition-colors"
              >
                {t("close")}
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
  const { t } = useI18n();
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
            {isEdit ? t("absences_modal_edit") : t("absences_new_title")}
          </h3>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto" style={{ maxHeight: "68vh" }}>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("absences_field_employee")}</span>
            <select className={`${field} mt-1`} value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("absences_field_type_label")}</span>
            <select className={`${field} mt-1`} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as AbsenceType })}>
              {(Object.keys(TYPE_META) as AbsenceType[]).map(k => (
                <option key={k} value={k}>{t(TYPE_LABEL_KEYS[k])}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("absences_field_start_date")}</span>
              <input
                type="date" className={`${field} mt-1`} value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("absences_field_end_date")}</span>
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
            <span className="text-sm font-medium">{t("absences_partial")}</span>
          </label>

          {form.partial && (
            <div className="grid grid-cols-2 gap-3 pl-5 border-l-2 border-amber-300">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("absences_field_start_time")}</span>
                <input type="time" step="3600" className={`${field} mt-1`} value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("absences_field_end_time")}</span>
                <input type="time" step="3600" className={`${field} mt-1`} value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("absences_field_reason")}</span>
            <textarea
              className={`${field} mt-1 min-h-[80px] resize-none rounded-lg`}
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
            />
          </label>
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-pill border border-border hover:bg-secondary">{t("cancel")}</button>
          <button onClick={handleSave} className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90">
            {isEdit ? t("absences_save_changes") : t("save")}
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
  const { absences, employees, areas, shifts, upsertAbsence, decideAbsence, removeAbsence, clearShift, setShift } = useWFM();
  const { hasPermission, hasLimit, profile } = useAuth();
  const { t } = useI18n();

  const canCreate  = hasPermission("absences", "edit");
  const canApprove = hasLimit("canApproveAbsences");
  const ownArea    = profile?.areaId ?? null;

  const [period,         setPeriod]         = useState<Period>("mes");
  const [dateOffset,     setDateOffset]     = useState(0);
  const [statusFilter,   setStatusFilter]   = useState<AbsenceStatus | null>(null);
  const [typeFilter,     setTypeFilter]     = useState<"all" | AbsenceType>("all");
  const [selectedArea,   setSelectedArea]   = useState<string>(ownArea ?? "all");
  const [detailId,       setDetailId]       = useState<string | null>(null);
  const [detailStep,     setDetailStep]     = useState<DetailStep>("view");
  const [createOpen,     setCreateOpen]     = useState(false);
  const [editAbsence,    setEditAbsence]    = useState<Absence | null>(null);
  const [deleteAbsence,  setDeleteAbsence]  = useState<Absence | null>(null);

  useEffect(() => { setDateOffset(0); }, [period]);

  const dateRange = useMemo((): [string, string] => {
    const now = new Date();
    if (period === "dia") {
      const d = new Date(now);
      d.setDate(d.getDate() + dateOffset);
      const iso = toISO(d);
      return [iso, iso];
    }
    if (period === "semana") {
      const ws = startOfWeek(now);
      ws.setDate(ws.getDate() + dateOffset * 7);
      const end = new Date(ws);
      end.setDate(end.getDate() + 6);
      return [toISO(ws), toISO(end)];
    }
    const d = new Date(now.getFullYear(), now.getMonth() + dateOffset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + dateOffset + 1, 0);
    return [toISO(d), toISO(last)];
  }, [period, dateOffset]);

  const dateLabelText = useMemo(() => {
    const now = new Date();
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    if (period === "dia") {
      const d = new Date(now);
      d.setDate(d.getDate() + dateOffset);
      return cap(d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }));
    }
    if (period === "semana") {
      const ws = startOfWeek(now);
      ws.setDate(ws.getDate() + dateOffset * 7);
      const end = new Date(ws);
      end.setDate(end.getDate() + 6);
      return `Semana del ${ws.getDate()}/${ws.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}`;
    }
    const d = new Date(now.getFullYear(), now.getMonth() + dateOffset, 1);
    return cap(d.toLocaleDateString("es-CO", { month: "long", year: "numeric" }));
  }, [period, dateOffset]);

  function openDetail(id: string, step: DetailStep = "view") {
    setDetailId(id);
    setDetailStep(step);
  }

  const visibleAbsences = useMemo(() => {
    if (!canApprove) {
      return absences.filter(a => a.employeeId === profile?.employeeId);
    }
    const areaId = ownArea ?? (selectedArea !== "all" ? selectedArea : null);
    return areaId
      ? absences.filter(a => employees.find(e => e.id === a.employeeId)?.areaId === areaId)
      : absences;
  }, [absences, employees, ownArea, selectedArea, canApprove, profile?.employeeId]);

  const periodAbsences = useMemo(() =>
    visibleAbsences.filter(a => a.startDate <= dateRange[1] && a.endDate >= dateRange[0]),
    [visibleAbsences, dateRange],
  );

  const filtered = useMemo(() =>
    periodAbsences.filter(a => {
      const s: AbsenceStatus = a.status ?? "pendiente";
      const statusOk = statusFilter === null || s === statusFilter;
      const typeOk   = typeFilter === "all" || a.type === typeFilter;
      return statusOk && typeOk;
    }),
    [periodAbsences, statusFilter, typeFilter],
  );

  /* KPIs */
  const pendingCount  = periodAbsences.filter(a => (a.status ?? "pendiente") === "pendiente").length;
  const approvedCount = periodAbsences.filter(a => (a.status ?? "pendiente") === "aprobada").length;
  const approvedDays  = periodAbsences
    .filter(a => (a.status ?? "pendiente") === "aprobada")
    .reduce((s, a) => s + countDays(a), 0);

  async function handleDecide(id: string, status: AbsenceStatus, note?: string) {
    const a = absences.find(ab => ab.id === id);
    if (!a) return;
    if (status !== "aprobada" && status !== "rechazada") return;
    // decidedBy/decidedAt los calcula el servidor (sesión + reloj real), y la
    // decisión solo se aplica si la ausencia sigue "pendiente" — evita que dos
    // supervisores decidiendo casi al mismo tiempo se pisen sin darse cuenta.
    const result = await decideAbsence(id, status, note);
    if (!result.ok) return;
    const emp = employees.find(e => e.id === a.employeeId);
    dispatchAbsenceEvent({ data: {
      event: status === "aprobada" ? "absence_approved" : "absence_rejected",
      employeeId: a.employeeId,
      employeeName: emp?.fullName ?? "",
      absenceType: a.type,
      startDate: a.startDate,
      endDate: a.endDate,
      ...(note ? { note } : {}),
    }}).catch(e => console.error("[notif:absence]", e?.message ?? e));
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

  const visibleEmployees = canApprove
    ? (ownArea
        ? employees.filter(e => e.areaId === ownArea)
        : (selectedArea !== "all" ? employees.filter(e => e.areaId === selectedArea) : employees))
    : employees.filter(e => e.id === profile?.employeeId);

  if (!profile?.employeeId && !canApprove) {
    return (
      <>
        <Topbar title={t("absences_title")} subtitle="" />
        <div className="flex-1 flex items-center justify-center p-10">
          <div className="max-w-sm w-full">
            <div className="rounded-card bg-card p-8 text-center shadow-card space-y-4">
              <div
                className="size-14 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "color-mix(in srgb,var(--color-primary) 10%,transparent)" }}
              >
                <CalendarX2 className="size-7" style={{ color: "var(--color-primary)" }} />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Sin empleado vinculado</h2>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Tu cuenta de usuario no está vinculada a ningún registro de empleado.
                </p>
              </div>
              <div className="rounded-xl bg-secondary/50 border border-border p-4 text-left space-y-2">
                <p className="text-xs font-semibold">Cómo vincularla:</p>
                <ol className="text-xs text-muted-foreground space-y-1.5">
                  {[
                    "Un administrador debe ir a Configuración → Usuarios",
                    "Editar tu usuario y seleccionar tu número de identificación",
                    "Guardar cambios y recargar la página",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        className="size-4 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5"
                        style={{
                          background: "color-mix(in srgb,var(--color-primary) 20%,transparent)",
                          color: "var(--color-primary)",
                        }}
                      >
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={t("absences_title")}
        subtitle=""
        right={
          canCreate ? (
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-pill bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">{t("absences_new")}</span>
            </button>
          ) : undefined
        }
      />

      <div className="px-4 md:px-6 py-4 md:py-6 max-w-[1280px] mx-auto space-y-5">
        {/* KPI cards — clickables como filtro de estado */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            label={t("absences_kpi_all")}
            value={periodAbsences.length}
            foot={dateLabelText}
            icon={CalendarX2}
            active={statusFilter === null}
            onClick={() => setStatusFilter(null)}
          />
          <KpiCard
            label={t("absences_filter_pending")}
            value={pendingCount}
            foot={t("absences_kpi_review")}
            icon={Clock}
            alert={pendingCount > 0}
            active={statusFilter === "pendiente"}
            onClick={() => setStatusFilter(f => f === "pendiente" ? null : "pendiente")}
          />
          <KpiCard
            label={t("absences_filter_approved")}
            value={approvedCount}
            foot={dateLabelText}
            icon={CheckCircle2}
            active={statusFilter === "aprobada"}
            onClick={() => setStatusFilter(f => f === "aprobada" ? null : "aprobada")}
          />
          <KpiCard
            label={t("absences_kpi_days")}
            value={approvedDays}
            unit="d"
            foot={t("absences_kpi_approved_days")}
            icon={Calendar}
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented — período */}
          <div className="flex items-center bg-secondary border border-border rounded-full p-[3px] gap-[3px] text-sm">
            {(["dia", "semana", "mes"] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`h-[34px] px-4 rounded-full font-medium inline-flex items-center transition-colors ${
                  period === p
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "dia" ? t("absences_period_today") : p === "semana" ? t("absences_period_week") : t("absences_period_month")}
              </button>
            ))}
          </div>

          {/* Date stepper */}
          <div className="flex items-center h-10 rounded-full border border-border bg-card overflow-hidden">
            <button
              onClick={() => setDateOffset(o => o - 1)}
              className="size-10 flex items-center justify-center hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="size-[18px]" />
            </button>
            <span className="px-3.5 text-sm border-x border-border h-full flex items-center min-w-[172px] text-center tabular-nums select-none justify-center">
              {dateLabelText}
            </span>
            <button
              onClick={() => setDateOffset(o => o + 1)}
              className="size-10 flex items-center justify-center hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="size-[18px]" />
            </button>
          </div>

          {/* Type filter */}
          <select
            className="h-10 rounded-full border border-border bg-card px-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 text-muted-foreground"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as "all" | AbsenceType)}
          >
            <option value="all">{t("absences_all_types")}</option>
            {(Object.keys(TYPE_META) as AbsenceType[]).map(k => (
              <option key={k} value={k}>{t(TYPE_LABEL_KEYS[k])}</option>
            ))}
          </select>

          {/* Area filter — solo visible para admin/gestor sin área propia */}
          {canApprove && !ownArea && (
            <select
              className="h-10 rounded-full border border-border bg-card px-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 text-muted-foreground"
              value={selectedArea}
              onChange={e => setSelectedArea(e.target.value)}
            >
              <option value="all">Todas las áreas</option>
              {areas.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Table */}
        <div className="rounded-card bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left">
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
                    <tr key={a.id} className="border-t border-border/60 hover:bg-secondary/60 transition-colors">
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
                          <span className="text-muted-foreground">{t(TYPE_LABEL_KEYS[a.type])}</span>
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
                          {canCreate && status === "pendiente" && (
                            <button
                              onClick={() => setEditAbsence(a)}
                              title="Editar ausencia"
                              className="size-7 rounded-full flex items-center justify-center hover:bg-secondary text-muted-foreground transition-colors"
                            >
                              <PencilLine className="size-3.5" />
                            </button>
                          )}
                          {(canApprove || (canCreate && status === "pendiente")) && (
                            <button
                              onClick={() => setDeleteAbsence(a)}
                              title="Eliminar ausencia"
                              className="size-7 rounded-full flex items-center justify-center hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-14 text-muted-foreground">
                      No hay ausencias para el período seleccionado.
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
          onEdit={canCreate && (detailAbsence.status ?? "pendiente") === "pendiente" ? () => { setEditAbsence(detailAbsence); setDetailId(null); } : undefined}
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
              absenceType: a.type,
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
                    {emp?.fullName ?? "Empleado"} · {t(TYPE_LABEL_KEYS[deleteAbsence.type])} · {fmtPeriod(deleteAbsence)}
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
