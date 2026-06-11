import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/wfm/Topbar";
import { useWFM } from "@/lib/wfm/store";
import { shiftBreakdown, codeColor } from "@/lib/wfm/calc";
import { fmtDate } from "@/lib/wfm/date";
import {
  ChevronDown, Clock, TrendingUp, Banknote, CheckCircle2,
  Download, FileSpreadsheet, FileText,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import type { Shift, Area } from "@/lib/wfm/types";
import { useAuth } from "@/lib/auth";
import { fetchApprovals, upsertApproval } from "@/lib/wfm/db";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reportes · STC" }] }),
  component: ReportsPage,
});

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */
const NIGHT_START = 21;
const TARGET_CODES = ["HED", "HEN", "RN", "RDF", "HEDF"] as const;
type TargetCode = (typeof TARGET_CODES)[number];
type Period = "Semana" | "Mes" | "Trimestre";
type AprobacionStatus = "Pendiente" | "Aprobada" | "Rechazada" | "No aprobada";

const CHART_COLORS: Record<string, string> = {
  STD: "#555555",
  HED: "#ED5650",
  HEN: "#CF4741",
  RN:  "#3B82F6",
  RDF: "#F59E0B",
};

const APROBACION_STYLES: Record<string, string> = {
  Aprobada:       "text-[#1F8A5B] border-[#1F8A5B]/30 bg-[#1F8A5B]/10",
  Pendiente:      "text-[#9a6b00] border-[#C98A00]/30 bg-[#C98A00]/10",
  Rechazada:      "text-[#CF4741] border-[#ED5650]/30 bg-[#FFE7E6]",
  "No aprobada":  "text-[#CF4741] border-[#ED5650]/30 bg-[#FFE7E6]",
};

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
type NovRow = {
  rowId: string; isoDate: string; fecha: string; nombre: string;
  identificacion: string; area: string; cargo: string;
  horarioHabitual: string; horasTrabajadas: number;
  novedad: TargetCode; horaInicio: string; horaFin: string;
  horas: number; justificacion: string; lider: string;
};

type WorkerRow = {
  empId: string; nombre: string; area: string;
  STD: number; HED: number; HEN: number; RN: number; RDF: number;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
function computeRange(period: Period, month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  if (period === "Mes") {
    const last = new Date(y, m, 0).getDate();
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
  }
  if (period === "Semana") {
    const d = new Date(y, m - 1, 1);
    const dow = d.getDay();
    const back = dow === 0 ? 6 : dow - 1;
    const mon = new Date(d); mon.setDate(d.getDate() - back);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = (dt: Date) => dt.toISOString().split("T")[0];
    return { from: fmt(mon), to: fmt(sun) };
  }
  const q = Math.floor((m - 1) / 3);
  const qs = q * 3 + 1, qe = qs + 2;
  const lastQ = new Date(y, qe, 0).getDate();
  return {
    from: `${y}-${String(qs).padStart(2, "0")}-01`,
    to:   `${y}-${String(qe).padStart(2, "0")}-${String(lastQ).padStart(2, "0")}`,
  };
}

function ini(name: string): string {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function dlBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function expandNovedades(
  shift: Shift,
  bd: { HED: number; HEN: number; RN: number; RDF: number; HEDF: number; std: number; total: number },
  area: Area | undefined,
): Array<{ code: TargetCode; inicio: string; fin: string; horas: number }> {
  const maxStd = area?.maxHoursDay ?? 8;
  const breakH = shift.breakMinutes / 60;
  const effectiveH = Math.max(0, shift.end - shift.start - breakH);
  const stdH = Math.min(effectiveH, maxStd);
  const stdClockEnd = shift.start + stdH + breakH;
  const fh = (h: number) =>
    `${String(Math.floor(((h % 24) + 24) % 24)).padStart(2, "0")}:00`;
  const result: Array<{ code: TargetCode; inicio: string; fin: string; horas: number }> = [];
  if (bd.HED  > 0) result.push({ code: "HED",  inicio: fh(stdClockEnd), fin: fh(Math.min(NIGHT_START, shift.end)), horas: bd.HED });
  if (bd.HEN  > 0) result.push({ code: "HEN",  inicio: fh(Math.max(stdClockEnd, NIGHT_START)), fin: fh(shift.end), horas: bd.HEN });
  if (bd.RN   > 0) {
    const rnStart = Math.max(shift.start, NIGHT_START);
    const rnEnd   = stdH < effectiveH ? shift.start + stdH : shift.end;
    result.push({ code: "RN",   inicio: fh(rnStart), fin: fh(rnEnd), horas: bd.RN });
  }
  if (bd.RDF  > 0) {
    const rdfEnd = stdH < effectiveH ? shift.start + stdH : shift.end;
    result.push({ code: "RDF",  inicio: fh(shift.start), fin: fh(Math.min(NIGHT_START, rdfEnd)), horas: bd.RDF });
  }
  if (bd.HEDF > 0) result.push({ code: "HEDF", inicio: fh(stdClockEnd), fin: fh(Math.min(NIGHT_START, shift.end)), horas: bd.HEDF });
  return result;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */
function KpiCard({
  label, value, unit, footer, Icon, alert,
}: {
  label: string; value: string; unit: string; footer: string;
  Icon: ElementType; alert?: boolean;
}) {
  return (
    <div className={`rounded-[20px] shadow-sm p-5 flex flex-col gap-3 ${alert ? "bg-[#333333]" : "bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[11px] font-medium uppercase tracking-[0.04em] ${alert ? "text-white/70" : "text-muted-foreground"}`}>
          {label}
        </span>
        <span className={`w-[34px] h-[34px] rounded-lg grid place-items-center flex-none ${alert ? "bg-white/10" : "bg-secondary"}`}>
          <Icon className={`size-[18px] ${alert ? "text-white" : ""}`} />
        </span>
      </div>
      <div className={`font-display text-[2.5rem] leading-none tracking-[-0.01em] tabular-nums ${alert ? "text-white" : ""}`}>
        {value}
        {unit && (
          <span className={`text-[1.25rem] ml-1 ${alert ? "text-white/70" : "text-muted-foreground"}`}>{unit}</span>
        )}
      </div>
      <div className={`text-[11px] ${alert ? "text-white/70" : "text-muted-foreground"}`}>{footer}</div>
    </div>
  );
}

function DownloadMenu({
  onCSV, onExcel, onPDF,
}: { onCSV: () => void; onExcel: () => void; onPDF: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const items = [
    { label: "PDF",   Icon: FileText,       fn: onPDF   },
    { label: "CSV",   Icon: Download,        fn: onCSV   },
    { label: "Excel", Icon: FileSpreadsheet, fn: onExcel },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium hover:bg-secondary transition-colors"
      >
        <Download className="size-3.5" />
        Descargar
        <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] bg-card border border-border rounded-xl shadow-lg py-1 z-20 min-w-[156px]">
          {items.map(({ label, Icon, fn }) => (
            <button
              key={label}
              onClick={() => { fn(); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm hover:bg-secondary text-left transition-colors rounded-md"
            >
              <Icon className="size-3.5 text-muted-foreground" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */
function ReportsPage() {
  const { shifts, employees, areas, absences } = useWFM();
  const { hasLimit, profile } = useAuth();
  const canExport = hasLimit("canExportReports");
  const ownArea   = hasLimit("restrictToOwnArea") ? (profile?.areaId ?? null) : null;

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [period, setPeriod]             = useState<Period>("Mes");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [aprobaciones, setAprobaciones] = useState<Record<string, AprobacionStatus>>({});
  const [savingRows, setSavingRows]     = useState<Set<string>>(new Set());
  const [loadingApprovals, setLoadingApprovals] = useState(false);

  const { from, to } = useMemo(
    () => computeRange(period, selectedMonth || defaultMonth),
    [period, selectedMonth],
  );

  /* Effective area filter (RBAC takes precedence) */
  const filterAreaId: string | null =
    ownArea ?? (selectedArea !== "all" ? selectedArea : null);

  const loadAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    setLoadingApprovals(true);
    fetchApprovals(from, to)
      .then(map => { if (!ctrl.signal.aborted) setAprobaciones(map as Record<string, AprobacionStatus>); })
      .catch(() => { if (!ctrl.signal.aborted) toast.error("Error al cargar aprobaciones"); })
      .finally(() => { if (!ctrl.signal.aborted) setLoadingApprovals(false); });
    return () => ctrl.abort();
  }, [from, to]);

  /* ---------- KPIs ---------- */
  const { totalHours, extraHours, recargosHours, workerCount } = useMemo(() => {
    let total = 0, extra = 0, recargos = 0;
    const workers = new Set<string>();
    shifts.filter(s => s.date >= from && s.date <= to).forEach(s => {
      const emp = employees.find(e => e.id === s.employeeId);
      if (!emp || (filterAreaId && emp.areaId !== filterAreaId)) return;
      const area = areas.find(a => a.id === emp.areaId);
      const bd = shiftBreakdown(s, area);
      total   += bd.total;
      extra   += bd.HED + bd.HEN + bd.HEDF + bd.HENF;
      recargos += bd.RN + bd.RDF + bd.RNF;
      if (bd.total > 0) workers.add(s.employeeId);
    });
    return {
      totalHours:    Math.round(total),
      extraHours:    Math.round(extra),
      recargosHours: Math.round(recargos),
      workerCount:   workers.size,
    };
  }, [shifts, employees, areas, from, to, filterAreaId]);

  /* ---------- Chart data (per area) ---------- */
  const visibleAreas = ownArea ? areas.filter(a => a.id === ownArea) : areas;

  const areaChartData = useMemo(() =>
    visibleAreas.map(area => {
      let STD = 0, HED = 0, HEN = 0, RN = 0, RDF = 0;
      shifts.filter(s => s.date >= from && s.date <= to).forEach(s => {
        const emp = employees.find(e => e.id === s.employeeId);
        if (!emp || emp.areaId !== area.id) return;
        const bd = shiftBreakdown(s, area);
        STD += bd.std; HED += bd.HED + bd.HEDF;
        HEN += bd.HEN + bd.HENF; RN += bd.RN + bd.RNF; RDF += bd.RDF;
      });
      return { area: area.name, STD: Math.round(STD), HED: Math.round(HED), HEN: Math.round(HEN), RN: Math.round(RN), RDF: Math.round(RDF) };
    }),
  [shifts, employees, visibleAreas, from, to]);

  /* ---------- Breakdown bars ---------- */
  const breakdown = useMemo(() => {
    let std = 0, HED = 0, HEN = 0, RN = 0, RDF = 0;
    shifts.filter(s => s.date >= from && s.date <= to).forEach(s => {
      const emp = employees.find(e => e.id === s.employeeId);
      if (!emp || (filterAreaId && emp.areaId !== filterAreaId)) return;
      const area = areas.find(a => a.id === emp.areaId);
      const bd = shiftBreakdown(s, area);
      std += bd.std; HED += bd.HED + bd.HEDF;
      HEN += bd.HEN + bd.HENF; RN += bd.RN + bd.RNF; RDF += bd.RDF;
    });
    return [
      { label: "Estándar",    val: Math.round(std), color: CHART_COLORS.STD },
      { label: "Extra diur.", val: Math.round(HED), color: CHART_COLORS.HED },
      { label: "Extra noct.", val: Math.round(HEN), color: CHART_COLORS.HEN },
      { label: "Rec. noct.",  val: Math.round(RN),  color: CHART_COLORS.RN  },
      { label: "Rec. dom.",   val: Math.round(RDF), color: CHART_COLORS.RDF },
    ];
  }, [shifts, employees, areas, from, to, filterAreaId]);

  const breakdownMax = Math.max(...breakdown.map(b => b.val), 1);

  /* ---------- Table 1: Horas por trabajador ---------- */
  const workerRows: WorkerRow[] = useMemo(() => {
    const byEmp: Record<string, WorkerRow> = {};
    shifts.filter(s => s.date >= from && s.date <= to).forEach(s => {
      const emp = employees.find(e => e.id === s.employeeId);
      if (!emp || (filterAreaId && emp.areaId !== filterAreaId)) return;
      const area = areas.find(a => a.id === emp.areaId);
      const bd = shiftBreakdown(s, area);
      if (!byEmp[s.employeeId]) {
        byEmp[s.employeeId] = { empId: s.employeeId, nombre: emp.fullName, area: area?.name ?? "", STD: 0, HED: 0, HEN: 0, RN: 0, RDF: 0 };
      }
      const r = byEmp[s.employeeId];
      r.STD += bd.std; r.HED += bd.HED + bd.HEDF;
      r.HEN += bd.HEN + bd.HENF; r.RN += bd.RN + bd.RNF; r.RDF += bd.RDF;
    });
    return Object.values(byEmp)
      .map(r => ({ ...r, STD: Math.round(r.STD), HED: Math.round(r.HED), HEN: Math.round(r.HEN), RN: Math.round(r.RN), RDF: Math.round(r.RDF) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [shifts, employees, areas, from, to, filterAreaId]);

  /* ---------- Table 2: Novedades ---------- */
  const novedadRows: NovRow[] = useMemo(() => {
    const result: NovRow[] = [];
    shifts.filter(s => s.date >= from && s.date <= to).forEach(s => {
      const emp = employees.find(e => e.id === s.employeeId);
      if (!emp || (filterAreaId && emp.areaId !== filterAreaId)) return;
      const area = areas.find(a => a.id === emp.areaId);
      const bd = shiftBreakdown(s, area);
      const novs = expandNovedades(s, bd, area);
      if (!novs.length) return;
      const abs = absences.find(a => a.employeeId === s.employeeId && s.date >= a.startDate && s.date <= a.endDate);
      const horarioHabitual = area
        ? `${String(area.startHour).padStart(2, "0")}:00 - ${String(area.endHour).padStart(2, "0")}:00`
        : "—";
      novs.forEach(nr => {
        result.push({
          rowId: `${s.employeeId}-${s.date}-${nr.code}`,
          isoDate: s.date, fecha: fmtDate(s.date),
          nombre: emp.fullName, identificacion: emp.documentId ?? "",
          area: area?.name ?? "", cargo: emp.position ?? "",
          horarioHabitual, horasTrabajadas: bd.total,
          novedad: nr.code, horaInicio: nr.inicio, horaFin: nr.fin,
          horas: nr.horas,
          justificacion: abs?.reason ?? s.note ?? "",
          lider: emp.leader ?? "",
        });
      });
    });
    return result.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
  }, [shifts, employees, areas, absences, from, to, filterAreaId]);

  /* ---------- Approval handler ---------- */
  async function handleAprobacion(row: NovRow, status: AprobacionStatus) {
    const prev = aprobaciones[row.rowId] ?? "Pendiente";
    setAprobaciones(p => ({ ...p, [row.rowId]: status }));
    setSavingRows(p => new Set([...p, row.rowId]));
    try {
      await upsertApproval(row.rowId, row.isoDate, status);
    } catch {
      toast.error("Error al guardar la aprobación");
      setAprobaciones(p => ({ ...p, [row.rowId]: prev }));
    } finally {
      setSavingRows(p => { const n = new Set(p); n.delete(row.rowId); return n; });
    }
  }

  /* ---------- Export Table 1 ---------- */
  const H1 = ["Trabajador", "Área", "STD", "HED", "HEN", "RN", "RDF", "Total"];
  function rows1() {
    return workerRows.map(r => {
      const tot = r.STD + r.HED + r.HEN + r.RN + r.RDF;
      return [r.nombre, r.area, r.STD || "—", r.HED || "—", r.HEN || "—", r.RN || "—", r.RDF || "—", tot];
    });
  }
  function exp1CSV() {
    const csv = [H1.join(";"), ...rows1().map(r => r.join(";"))].join("\n");
    dlBlob(`horas-trabajador_${from}_${to}.csv`, "﻿" + csv, "text/csv;charset=utf-8;");
  }
  function exp1Excel() {
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${H1.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows1().map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    dlBlob(`horas-trabajador_${from}_${to}.xls`, "﻿" + html, "application/vnd.ms-excel;charset=utf-8;");
  }
  function exp1PDF() {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>Horas por trabajador</title><style>body{font-family:Arial;padding:20px}h2{font-size:14px;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ddd;padding:5px 8px}th{background:#f1f1f1;text-transform:uppercase;font-size:9px;text-align:left}td:nth-child(n+3){text-align:right}</style></head><body><h2>Horas por trabajador · ${from} — ${to}</h2><table><thead><tr>${H1.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows1().map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.print()<\/script></body></html>`);
    w.document.close();
  }

  /* ---------- Export Table 2 ---------- */
  const H2 = ["Fecha","Nombre","Identificación","Área","Cargo","Horario","Horas trab.","Novedad","Inicio","Fin","Horas","Justificación","Líder","Aprobación"];
  function rows2() {
    return novedadRows.map(r => [
      r.fecha, r.nombre, r.identificacion, r.area, r.cargo,
      r.horarioHabitual, `${r.horasTrabajadas}h`, r.novedad,
      r.horaInicio, r.horaFin, `${r.horas}h`,
      r.justificacion || "—", r.lider,
      aprobaciones[r.rowId] ?? "Pendiente",
    ]);
  }
  function exp2CSV() {
    const esc = (s: string | number) => { const v = String(s); return /[;",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const csv = [H2.join(";"), ...rows2().map(r => r.map(esc).join(";"))].join("\n");
    dlBlob(`novedades_${from}_${to}.csv`, "﻿" + csv, "text/csv;charset=utf-8;");
  }
  function exp2Excel() {
    const esc = (s: string | number) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${H2.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows2().map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    dlBlob(`novedades_${from}_${to}.xls`, "﻿" + html, "application/vnd.ms-excel;charset=utf-8;");
  }
  function exp2PDF() {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>Novedades</title><style>body{font-family:Arial;padding:20px}h2{font-size:13px;margin-bottom:10px}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#f1f1f1;text-transform:uppercase;font-size:8px}</style></head><body><h2>Novedades y aprobación · ${from} — ${to}</h2><table><thead><tr>${H2.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows2().map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.print()<\/script></body></html>`);
    w.document.close();
  }

  /* ---------- Period label ---------- */
  const periodLabel = period === "Mes"
    ? new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString("es-CO", { month: "long", year: "numeric" })
    : `${fmtDate(from)} — ${fmtDate(to)}`;

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <>
      <Topbar title="Reportes y analítica" subtitle="Horas, novedades y tendencias" />
      <div className="p-4 md:p-6 space-y-4">

        {/* ---- Toolbar ---- */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented period control */}
          <div className="flex items-center rounded-full border border-border bg-secondary/40 p-0.5 gap-0.5">
            {(["Semana", "Mes", "Trimestre"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-[#333333] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Area filter (hidden when RBAC restricts area) */}
          {!ownArea && (
            <select
              value={selectedArea}
              onChange={e => setSelectedArea(e.target.value)}
              className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm outline-none focus:border-primary cursor-pointer"
            >
              <option value="all">Todas las áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}

          {/* Month input */}
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm outline-none focus:border-primary"
          />

          {loadingApprovals && (
            <span className="ml-1 text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              Cargando…
            </span>
          )}
        </div>

        {/* ---- KPI cards ---- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Horas totales"
            value={totalHours.toLocaleString("es-CO")}
            unit="h"
            footer={`${periodLabel} · ${workerCount} trabajadores`}
            Icon={Clock}
          />
          <KpiCard
            label="Horas extra"
            value={String(extraHours)}
            unit="h"
            footer="HED + HEN + HEDF"
            Icon={TrendingUp}
            alert
          />
          <KpiCard
            label="Recargos"
            value={String(recargosHours)}
            unit="h"
            footer="RN + RDF"
            Icon={Banknote}
          />
          <KpiCard
            label="Puntualidad media"
            value="—"
            unit=""
            footer="Próximamente disponible"
            Icon={CheckCircle2}
          />
        </div>

        {/* ---- Chart + Breakdown grid ---- */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">

          {/* Stacked bar chart */}
          <div className="rounded-[20px] bg-card shadow-sm flex flex-col" style={{ paddingBottom: "1.25rem" }}>
            <div className="px-5 pt-5 pb-0">
              <div className="font-display font-medium text-base">Composición de horas por área</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{periodLabel} · por tipo de hora</div>
            </div>
            <div className="px-5 pt-4 flex-1 min-h-0">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={areaChartData} margin={{ top: 8, right: 8, bottom: 8, left: 24 }} barSize={56}>
                  <CartesianGrid vertical={false} stroke="var(--color-border,#e5e7eb)" strokeDasharray="3 4" />
                  <XAxis
                    dataKey="area"
                    tick={{ fontSize: 12, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <RTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    formatter={(val: number, name: string) => [`${val} h`, name]}
                  />
                  <Bar dataKey="STD" stackId="a" fill={CHART_COLORS.STD} />
                  <Bar dataKey="HED" stackId="a" fill={CHART_COLORS.HED} />
                  <Bar dataKey="HEN" stackId="a" fill={CHART_COLORS.HEN} />
                  <Bar dataKey="RN"  stackId="a" fill={CHART_COLORS.RN}  />
                  <Bar dataKey="RDF" stackId="a" fill={CHART_COLORS.RDF} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 pt-3">
              {Object.entries(CHART_COLORS).map(([key, color]) => (
                <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-sm flex-none inline-block" style={{ background: color }} />
                  {key}
                </span>
              ))}
            </div>
          </div>

          {/* Breakdown bars (right panel) */}
          <div className="rounded-[20px] bg-card shadow-sm p-5 flex flex-col gap-2">
            <div className="flex items-end gap-3 mb-1">
              <h2 className="font-display font-medium text-base">Distribución por tipo</h2>
              <span className="text-[11px] text-muted-foreground">Total del período</span>
            </div>

            {breakdown.map((b, i) => (
              <div
                key={b.label}
                className={`grid items-center gap-3 py-2 text-sm ${i > 0 ? "border-t border-border" : ""}`}
                style={{ gridTemplateColumns: "110px 1fr 56px" }}
              >
                <span className="text-muted-foreground text-[13px]">{b.label}</span>
                <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(b.val / breakdownMax) * 100}%`, background: b.color }}
                  />
                </div>
                <span className="font-mono tabular-nums text-right text-[13px]">{b.val} h</span>
              </div>
            ))}

            <hr className="border-border mt-1" />
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-muted-foreground">Total de horas del período</span>
              <span className="font-display text-xl font-medium tabular-nums">
                {totalHours.toLocaleString("es-CO")} h
              </span>
            </div>
          </div>
        </div>

        {/* ---- Table 1: Horas por trabajador ---- */}
        <div className="rounded-[20px] bg-card shadow-sm overflow-hidden">
          <div className="flex items-start gap-3 px-5 pt-5 pb-4">
            <div className="flex-1">
              <div className="font-display font-medium text-base">Horas por trabajador</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Desglose por tipo de hora del período</div>
            </div>
            {canExport && <DownloadMenu onCSV={exp1CSV} onExcel={exp1Excel} onPDF={exp1PDF} />}
          </div>

          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {H1.map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2.5 text-[10px] font-medium uppercase tracking-[0.04em] text-muted-foreground bg-secondary/70 whitespace-nowrap first:rounded-tl-lg last:rounded-tr-lg ${
                        i >= 2 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workerRows.map(r => {
                  const tot = r.STD + r.HED + r.HEN + r.RN + r.RDF;
                  return (
                    <tr key={r.empId} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-secondary grid place-items-center text-[11px] font-bold flex-none select-none">
                            {ini(r.nombre)}
                          </div>
                          <span className="font-medium whitespace-nowrap">{r.nombre}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.area}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.STD || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.HED || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.HEN || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.RN  || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.RDF || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold">{tot}</td>
                    </tr>
                  );
                })}
                {workerRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground text-sm">
                      Sin datos para el período seleccionado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- Table 2: Novedades y aprobación ---- */}
        <div className="rounded-[20px] bg-card shadow-sm overflow-hidden">
          <div className="flex items-start gap-3 px-5 pt-5 pb-4">
            <div className="flex-1">
              <div className="font-display font-medium text-base">Novedades y aprobación</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Recargos, horas extra y permisos · estado de aprobación
              </div>
            </div>
            {canExport && <DownloadMenu onCSV={exp2CSV} onExcel={exp2Excel} onPDF={exp2PDF} />}
          </div>

          <div className="overflow-x-auto px-5 pb-5 max-h-[60vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  {H2.map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2.5 text-[10px] font-medium uppercase tracking-[0.04em] text-muted-foreground bg-secondary/70 text-left whitespace-nowrap ${
                        i === 0 ? "rounded-tl-lg" : ""
                      } ${i === H2.length - 1 ? "rounded-tr-lg" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {novedadRows.map(r => {
                  const aprobacion = (aprobaciones[r.rowId] ?? "Pendiente") as AprobacionStatus;
                  const isSaving   = savingRows.has(r.rowId);
                  const { label: novedadLabel } = codeColor(r.novedad);
                  const aprStyle   = APROBACION_STYLES[aprobacion] ?? APROBACION_STYLES.Pendiente;

                  return (
                    <tr key={r.rowId} className="border-t border-border hover:bg-secondary/20">
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{r.fecha}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-secondary grid place-items-center text-[10px] font-bold flex-none select-none">
                            {ini(r.nombre)}
                          </div>
                          <span className="font-medium whitespace-nowrap">{r.nombre}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{r.identificacion}</td>
                      <td className="px-3 py-2">{r.area}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.cargo}</td>
                      <td className="px-3 py-2 font-mono">{r.horarioHabitual}</td>
                      <td className="px-3 py-2 font-bold">{r.horasTrabajadas ? `${r.horasTrabajadas}h` : "—"}</td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-[14px] text-[10px] font-medium whitespace-nowrap"
                          style={{ background: "var(--coral-1,#FFE7E6)", color: "var(--coral-7,#CF4741)" }}
                        >
                          {novedadLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">{r.horaInicio}</td>
                      <td className="px-3 py-2 font-mono">{r.horaFin}</td>
                      <td className="px-3 py-2 font-bold">{r.horas ? `${r.horas}h` : "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">
                        {r.justificacion || "—"}
                      </td>
                      <td className="px-3 py-2">{r.lider}</td>
                      <td className="px-3 py-2">
                        {loadingApprovals ? (
                          <span className="inline-block w-20 h-5 rounded bg-secondary animate-pulse" />
                        ) : (
                          <div className="relative">
                            <select
                              value={aprobacion === "No aprobada" ? "Rechazada" : aprobacion}
                              disabled={isSaving}
                              onChange={e => handleAprobacion(r, e.target.value as AprobacionStatus)}
                              className={`text-[11px] font-medium rounded-full border px-2.5 py-0.5 cursor-pointer outline-none appearance-none transition-opacity ${aprStyle} ${isSaving ? "opacity-50 cursor-wait" : ""}`}
                            >
                              <option value="Pendiente">Pendiente</option>
                              <option value="Aprobada">Aprobada</option>
                              <option value="Rechazada">Rechazada</option>
                            </select>
                            {isSaving && (
                              <span className="absolute -right-4 top-1/2 -translate-y-1/2 size-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {novedadRows.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-3 py-12 text-center text-muted-foreground">
                      Sin novedades (HED / HEN / RN / RDF / HEDF) para el período seleccionado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}
