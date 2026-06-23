import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, CalendarCheck,
  Coffee, UtensilsCrossed, LogIn, LogOut,
  Clock, Sun, Moon, Umbrella, Lock,
} from "lucide-react";
import { Topbar } from "@/components/wfm/Topbar";
import { useWFM } from "@/lib/wfm/store";
import { useAuth } from "@/lib/auth";
import { useJornada } from "@/lib/jornada/store";
import type { Shift } from "@/lib/wfm/types";
import { TIPO_MOVIMIENTO_LABELS, ESTADO_COLORS, ESTADO_LABELS } from "@/lib/jornada/types";

export const Route = createFileRoute("/_authenticated/mi-horario")({
  head: () => ({ meta: [{ title: "Mi Horario · STC" }] }),
  component: MiHorarioPage,
});

type ViewMode = "day" | "week" | "month";

// ── Helpers ────────────────────────────────────────────────────────────────

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function startOfWeek(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return isoDate(d);
}

function weekDays(ws: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
}

function startOfMonth(dateStr: string) { return dateStr.slice(0, 7) + "-01"; }

function daysInMonth(dateStr: string) {
  const [y, m] = dateStr.slice(0, 7).split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) =>
    `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
  );
}

function fmtHour(h: number) { return String(h).padStart(2, "0") + ":00"; }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

const DOW_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DOW_FULL  = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS    = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                   "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const CONTRACT_LABELS: Record<string, string> = {
  indefinido: "Término indefinido",
  fijo:       "Término fijo",
  obra:       "Por prestación",
  aprendiz:   "Aprendiz SENA",
};

const CODE_LABEL: Record<string, string> = {
  STD: "Estándar", HED: "HE Diurna",  HEN: "HE Nocturna",
  HEDF: "HE Diurna Fest.", HENF: "HE Noct. Fest.",
  RN: "Rec. Nocturno", RDF: "Rec. Diurno Fest.", RNF: "Rec. Noct. Fest.",
  OFF: "Descanso", ABS: "Ausencia",
};

// ── Day View ───────────────────────────────────────────────────────────────

function DayView({ employeeId, date }: { employeeId: string; date: string }) {
  const { shifts } = useWFM();
  const { registros, getEstadoEmpleado } = useJornada();

  const shift        = shifts.find(s => s.employeeId === employeeId && s.date === date) ?? null;
  const estado       = getEstadoEmpleado(
    employeeId,
    date,
    shift && shift.code !== "OFF" && shift.code !== "ABS" ? shift.start : null,
  );
  const registrosHoy = [...registros.filter(r => r.employeeId === employeeId && r.fecha === date)]
    .sort((a, b) => new Date(a.horaExacta).getTime() - new Date(b.horaExacta).getTime());

  const isOff = shift?.code === "OFF";
  const isAbs = shift?.code === "ABS";
  const isWork = shift && !isOff && !isAbs;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">

      {/* Shift card */}
      <div
        className="rounded-card border p-5 shadow-card"
        style={{
          background: isOff ? "var(--color-secondary)" :
                      isAbs ? "color-mix(in srgb,#C98A00 8%,var(--color-card))" :
                      shift  ? "color-mix(in srgb,var(--color-primary) 6%,var(--color-card))" :
                      "var(--color-card)",
          borderColor: isOff ? "var(--color-border)" :
                       isAbs ? "color-mix(in srgb,#C98A00 35%,transparent)" :
                       shift  ? "color-mix(in srgb,var(--color-primary) 25%,transparent)" :
                       "var(--color-border)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mb-1"
              style={{ color: isOff ? "var(--color-muted-foreground)" :
                               isAbs ? "#C98A00" :
                               "var(--color-primary)" }}
            >
              Turno programado
            </p>
            {!shift && (
              <p className="text-sm text-muted-foreground italic">Sin programación</p>
            )}
            {isOff && (
              <div className="flex items-center gap-2">
                <Umbrella className="size-4 text-muted-foreground" />
                <span className="font-semibold">Día de descanso</span>
              </div>
            )}
            {isAbs && (
              <div className="flex items-center gap-2">
                <span style={{ color: "#C98A00" }} className="font-semibold">Ausencia programada</span>
              </div>
            )}
            {isWork && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {(shift.start >= 21 || shift.end <= 6) ? (
                    <Moon className="size-4" style={{ color: "var(--color-primary)" }} />
                  ) : (
                    <Sun className="size-4" style={{ color: "var(--color-primary)" }} />
                  )}
                  <span className="font-semibold text-base" style={{ color: "var(--color-primary)" }}>
                    {CODE_LABEL[shift.code] ?? shift.code}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-bold text-xl tabular-nums">{fmtHour(shift.start)}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                  <span className="font-mono font-bold text-xl tabular-nums">{fmtHour(shift.end)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {isWork && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Coffee className="size-3.5" />
                <span>{shift.breakMinutes} min break</span>
              </div>
            )}
            {isWork && shift.locked && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-pill"
                style={{ background: "var(--color-secondary)", color: "var(--color-muted-foreground)" }}
              >
                <Lock className="size-3" />
                Bloqueado
              </span>
            )}
          </div>
        </div>

        {/* Timeline bar */}
        {isWork && (
          <div>
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
              <span className="font-mono">{fmtHour(shift.start)}</span>
              <span className="text-xs text-muted-foreground">
                {shift.end - shift.start}h netas · {shift.breakMinutes} min break
              </span>
              <span className="font-mono">{fmtHour(shift.end)}</span>
            </div>
            <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb,var(--color-primary) 15%,transparent)" }}>
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: "var(--color-primary)", opacity: 0.55 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Estado actual */}
      <div className="rounded-card bg-card p-5 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Estado actual
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`px-3 py-1.5 rounded-pill text-sm font-semibold ${ESTADO_COLORS[estado.estado]}`}>
            {ESTADO_LABELS[estado.estado]}
          </span>
          {(estado.minutosEnJornada ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-3.5" />
              {Math.floor((estado.minutosEnJornada ?? 0) / 60)}h {(estado.minutosEnJornada ?? 0) % 60}m en jornada
            </div>
          )}
        </div>

        {((estado.tiempoEnBreakMin ?? 0) > 0 || (estado.tiempoEnAlmuerzoMin ?? 0) > 0) && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(estado.tiempoEnBreakMin ?? 0) > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2">
                <Coffee className="size-3.5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Break acum.</p>
                  <p className="text-xs font-semibold">{estado.tiempoEnBreakMin} min</p>
                </div>
              </div>
            )}
            {(estado.tiempoEnAlmuerzoMin ?? 0) > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2">
                <UtensilsCrossed className="size-3.5 text-blue-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Almuerzo acum.</p>
                  <p className="text-xs font-semibold">{estado.tiempoEnAlmuerzoMin} min</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Registros del día */}
      <div className="rounded-card bg-card p-5 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Registros del día
          </p>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-pill"
            style={{ background: "var(--color-secondary)", color: "var(--color-foreground)" }}
          >
            {registrosHoy.length}
          </span>
        </div>

        {registrosHoy.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Clock className="size-8 opacity-25" />
            <p className="text-sm">Sin registros para este día</p>
          </div>
        ) : (
          <div className="relative">
            <div
              className="absolute top-2 bottom-2 w-px"
              style={{ left: 19, background: "var(--color-border)" }}
            />
            <div className="space-y-2.5">
              {registrosHoy.map((r) => {
                const isEntrada  = r.tipoMovimiento === "entrada";
                const isSalida   = r.tipoMovimiento === "salida";
                const isAlmuerzo = r.tipoMovimiento.includes("almuerzo");
                const Icon = isEntrada ? LogIn : isSalida ? LogOut : isAlmuerzo ? UtensilsCrossed : Coffee;
                const dotBg = isEntrada
                  ? "color-mix(in srgb,#1F8A5B 14%,transparent)"
                  : isSalida
                  ? "color-mix(in srgb,var(--color-primary) 12%,transparent)"
                  : isAlmuerzo
                  ? "var(--color-secondary)"
                  : "color-mix(in srgb,#C98A00 16%,transparent)";
                const dotColor = isEntrada ? "#1F8A5B"
                  : isSalida ? "var(--color-primary)"
                  : isAlmuerzo ? "var(--color-foreground)"
                  : "#9a6b00";

                return (
                  <div key={r.id} className="flex items-center gap-3 pl-1">
                    <div
                      className="size-9 rounded-full flex items-center justify-center shrink-0 z-10"
                      style={{ background: dotBg, color: dotColor }}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div
                      className="flex-1 flex items-center justify-between rounded-xl px-3 py-2"
                      style={{ background: "var(--color-secondary)" }}
                    >
                      <span className="text-sm font-medium">{TIPO_MOVIMIENTO_LABELS[r.tipoMovimiento]}</span>
                      <div className="flex items-center gap-2">
                        {r.esModificacion && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-pill"
                            style={{ background: "color-mix(in srgb,#C98A00 16%,transparent)", color: "#9a6b00" }}
                          >
                            Modificado
                          </span>
                        )}
                        <span className="font-mono text-sm font-bold tabular-nums">{fmtTime(r.horaExacta)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Week View ──────────────────────────────────────────────────────────────

function WeekView({ employeeId, weekStart }: { employeeId: string; weekStart: string }) {
  const { shifts } = useWFM();
  const { registros, getEstadoEmpleado } = useJornada();
  const days  = weekDays(weekStart);
  const today = isoDate(new Date());

  const weekShifts = days.map(d => shifts.find(s => s.employeeId === employeeId && s.date === d) ?? null);
  const horasEst   = weekShifts
    .filter((s): s is Shift => !!s && s.code !== "OFF" && s.code !== "ABS")
    .reduce((acc, s) => acc + (s.end - s.start), 0);
  const turnos    = weekShifts.filter(s => s && s.code !== "OFF" && s.code !== "ABS").length;
  const descansos = weekShifts.filter(s => s?.code === "OFF").length;

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Horas estimadas", value: `${horasEst}h`, sub: "turno neto" },
          { label: "Turnos",          value: `${turnos}`,    sub: "días laborales" },
          { label: "Descansos",       value: `${descansos}`, sub: "días OFF" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-card bg-card p-4 shadow-card text-center">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Day rows */}
      <div className="space-y-2">
        {days.map((day, i) => {
          const shift   = weekShifts[i];
          const d       = new Date(day + "T00:00:00");
          const isToday = day === today;
          const isOff   = shift?.code === "OFF";
          const isAbs   = shift?.code === "ABS";
          const isWork  = shift && !isOff && !isAbs;
          const estado  = getEstadoEmpleado(
            employeeId,
            day,
            isWork ? shift!.start : null,
          );
          const hasMov  = registros.some(r => r.employeeId === employeeId && r.fecha === day);

          return (
            <div
              key={day}
              className="rounded-card border flex items-center gap-4 px-4 py-3.5 shadow-card"
              style={{
                borderColor: isToday ? "var(--color-primary)" : "var(--color-border)",
                background: isToday
                  ? "color-mix(in srgb,var(--color-primary) 4%,var(--color-card))"
                  : "var(--color-card)",
              }}
            >
              {/* Day badge */}
              <div
                className="shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center"
                style={{
                  background: isToday ? "var(--color-primary)" : "var(--color-secondary)",
                  color: isToday ? "var(--color-primary-foreground)" : "var(--color-foreground)",
                }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-75">
                  {DOW_SHORT[d.getDay()]}
                </span>
                <span className="text-lg font-bold leading-none">{d.getDate()}</span>
              </div>

              {/* Shift info */}
              <div className="flex-1 min-w-0">
                {!shift && (
                  <span className="text-sm text-muted-foreground italic">Sin programar</span>
                )}
                {isOff && (
                  <div className="flex items-center gap-2">
                    <Umbrella className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-muted-foreground">Día de descanso</span>
                  </div>
                )}
                {isAbs && (
                  <span className="text-sm font-medium" style={{ color: "#C98A00" }}>Ausencia programada</span>
                )}
                {isWork && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--color-primary)" }}
                      >
                        {CODE_LABEL[shift.code] ?? shift.code}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-mono font-bold">{fmtHour(shift.start)}</span>
                      <span className="text-muted-foreground text-xs">–</span>
                      <span className="font-mono font-bold">{fmtHour(shift.end)}</span>
                      <span className="text-muted-foreground text-xs ml-1">· {shift.end - shift.start}h</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Mini timeline + status */}
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                {isWork && (
                  <div
                    className="h-1.5 w-20 rounded-full overflow-hidden"
                    style={{ background: "color-mix(in srgb,var(--color-primary) 15%,transparent)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: "100%", background: "var(--color-primary)", opacity: 0.55 }}
                    />
                  </div>
                )}
                {hasMov ? (
                  <div className="flex items-center gap-1">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ background: estado.estado === "en_jornada" ? "#1F8A5B" : "var(--color-primary)" }}
                    />
                    <span className="text-[10px] text-muted-foreground">{ESTADO_LABELS[estado.estado]}</span>
                  </div>
                ) : isToday ? (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-pill"
                    style={{
                      background: "var(--color-primary)",
                      color: "var(--color-primary-foreground)",
                    }}
                  >
                    Hoy
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Month View ─────────────────────────────────────────────────────────────

function MonthView({ employeeId, monthStart }: { employeeId: string; monthStart: string }) {
  const { shifts } = useWFM();
  const days  = daysInMonth(monthStart);
  const today = isoDate(new Date());

  const firstDow   = new Date(monthStart + "T00:00:00").getDay();
  const pad        = firstDow === 0 ? 6 : firstDow - 1;
  const monthShifts = days.map(d => shifts.find(s => s.employeeId === employeeId && s.date === d) ?? null);
  const trabajados  = monthShifts.filter(s => s && s.code !== "OFF" && s.code !== "ABS").length;
  const horasEst    = monthShifts
    .filter((s): s is Shift => !!s && s.code !== "OFF" && s.code !== "ABS")
    .reduce((acc, s) => acc + (s.end - s.start), 0);
  const descansos = monthShifts.filter(s => s?.code === "OFF").length;

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Días trabajados", value: String(trabajados), sub: "este mes" },
          { label: "Horas estimadas", value: `${horasEst}h`,     sub: "turno neto" },
          { label: "Descansos",       value: String(descansos),  sub: "días OFF" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-card bg-card p-4 shadow-card text-center">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="rounded-card bg-card shadow-card overflow-hidden">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-border bg-secondary/40">
          {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
            <div key={d} className="py-2.5 text-center text-[11px] font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: pad }, (_, i) => (
            <div key={`p${i}`} className="h-[72px] border-b border-r border-border/40" />
          ))}
          {days.map((day, i) => {
            const shift   = monthShifts[i];
            const d       = new Date(day + "T00:00:00");
            const isToday = day === today;
            const colPos  = (pad + i) % 7;
            const isLastRow = i >= days.length - 7;
            const isOff  = shift?.code === "OFF";
            const isAbs  = shift?.code === "ABS";
            const isWork = shift && !isOff && !isAbs;

            return (
              <div
                key={day}
                className="h-[72px] border-r border-b border-border/40 p-1.5 flex flex-col gap-1 transition-colors hover:bg-secondary/20"
                style={{
                  borderRight:  colPos === 6 ? "none" : undefined,
                  borderBottom: isLastRow ? "none" : undefined,
                  background: isToday
                    ? "color-mix(in srgb,var(--color-primary) 6%,var(--color-card))"
                    : undefined,
                }}
              >
                <span
                  className="text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full shrink-0"
                  style={isToday ? {
                    background: "var(--color-primary)",
                    color: "var(--color-primary-foreground)",
                  } : {}}
                >
                  {d.getDate()}
                </span>
                {shift && (
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded leading-tight truncate"
                    style={{
                      background: isOff ? "var(--color-secondary)"
                        : isAbs ? "color-mix(in srgb,#C98A00 16%,transparent)"
                        : "color-mix(in srgb,var(--color-primary) 12%,transparent)",
                      color: isOff ? "var(--color-muted-foreground)"
                        : isAbs ? "#9a6b00"
                        : "var(--color-primary)",
                    }}
                  >
                    {isOff ? "OFF"
                      : isAbs ? "AUS"
                      : isWork ? `${fmtHour(shift.start).slice(0,5)}–${fmtHour(shift.end).slice(0,5)}`
                      : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {[
          {
            bg: "color-mix(in srgb,var(--color-primary) 12%,transparent)",
            border: "color-mix(in srgb,var(--color-primary) 25%,transparent)",
            label: "Turno laboral",
          },
          {
            bg: "var(--color-secondary)",
            border: "var(--color-border)",
            label: "Descanso (OFF)",
          },
          {
            bg: "color-mix(in srgb,#C98A00 16%,transparent)",
            border: "color-mix(in srgb,#C98A00 30%,transparent)",
            label: "Ausencia",
          },
          {
            bg: "color-mix(in srgb,var(--color-primary) 6%,var(--color-card))",
            border: "var(--color-primary)",
            label: "Hoy",
          },
        ].map(({ bg, border, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className="size-3 rounded"
              style={{ background: bg, border: `1px solid ${border}` }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

function MiHorarioPage() {
  const { profile } = useAuth();
  const { employees } = useWFM();
  const { initialized: jornadaInit, initFromDB: jornadaInitDB } = useJornada();

  useEffect(() => {
    if (!jornadaInit) jornadaInitDB();
  }, [jornadaInit, jornadaInitDB]);

  const today = isoDate(new Date());
  const [view,   setView]   = useState<ViewMode>("week");
  const [cursor, setCursor] = useState(today);

  const employeeId = profile?.employeeId ?? null;
  const employee   = useMemo(
    () => employees.find(e => e.id === employeeId) ?? null,
    [employees, employeeId],
  );

  const weekStart  = startOfWeek(cursor);
  const monthStart = startOfMonth(cursor);

  function prev() {
    if (view === "day")  { setCursor(c => addDays(c, -1)); return; }
    if (view === "week") { setCursor(c => addDays(startOfWeek(c), -7)); return; }
    const [y, m] = cursor.slice(0, 7).split("-").map(Number);
    setCursor(m === 1 ? `${y-1}-12-01` : `${y}-${String(m-1).padStart(2,"0")}-01`);
  }

  function next() {
    if (view === "day")  { setCursor(c => addDays(c, 1)); return; }
    if (view === "week") { setCursor(c => addDays(startOfWeek(c), 7)); return; }
    const [y, m] = cursor.slice(0, 7).split("-").map(Number);
    setCursor(m === 12 ? `${y+1}-01-01` : `${y}-${String(m+1).padStart(2,"0")}-01`);
  }

  function navLabel() {
    if (view === "day") {
      const d = new Date(cursor + "T00:00:00");
      return `${DOW_FULL[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
    }
    if (view === "week") {
      const ds = weekDays(weekStart);
      const s  = new Date(ds[0] + "T00:00:00");
      const e  = new Date(ds[6] + "T00:00:00");
      return `${s.getDate()} ${MONTHS[s.getMonth()].slice(0,3)} – ${e.getDate()} ${MONTHS[e.getMonth()].slice(0,3)} ${e.getFullYear()}`;
    }
    const [y, m] = monthStart.slice(0,7).split("-").map(Number);
    return `${MONTHS[m-1]} ${y}`;
  }

  // ── No employee linked ──────────────────────────────────────────────────
  if (!employeeId) {
    return (
      <>
        <Topbar title="Mi Horario" subtitle="Programación personal" />
        <div className="flex-1 flex items-center justify-center p-10">
          <div className="max-w-sm w-full">
            <div className="rounded-card border border-border bg-card p-8 text-center shadow-card space-y-4">
              <div
                className="size-14 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "color-mix(in srgb,var(--color-primary) 10%,transparent)" }}
              >
                <CalendarCheck className="size-7" style={{ color: "var(--color-primary)" }} />
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

  const initials = employee
    ? employee.fullName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <>
      <Topbar title="Mi Horario" subtitle="Programación personal" />

      {/* Identity strip */}
      {employee && (
        <div className="border-b border-border bg-card px-4 md:px-6 py-3.5 flex items-center gap-4">
          <div
            className="size-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{
              background: "color-mix(in srgb,var(--color-primary) 15%,transparent)",
              color: "var(--color-primary)",
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{employee.fullName}</p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground">{employee.position}</span>
              <span className="text-muted-foreground/40 text-xs">·</span>
              <span className="text-xs text-muted-foreground font-mono">{employee.documentId}</span>
              <span className="text-muted-foreground/40 text-xs">·</span>
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-pill"
                style={{ background: "var(--color-secondary)", color: "var(--color-muted-foreground)" }}
              >
                {CONTRACT_LABELS[employee.contractType] ?? employee.contractType}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div className="border-b border-border bg-card px-4 md:px-6 py-2.5 flex items-center gap-3 flex-wrap">
        {/* View switcher */}
        <div
          className="flex items-center rounded-pill border border-border p-0.5 text-xs"
          style={{ background: "var(--color-secondary)" }}
        >
          {(["day", "week", "month"] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3.5 py-1.5 rounded-pill transition-all font-medium"
              style={view === v ? {
                background: "var(--color-card)",
                color: "var(--color-foreground)",
                boxShadow: "0 1px 3px rgba(0,0,0,.08)",
              } : {
                color: "var(--color-muted-foreground)",
              }}
            >
              {v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1">
          <button
            onClick={prev}
            className="p-1.5 rounded-full border border-border bg-card hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span
            className="text-sm font-medium px-2 text-center capitalize"
            style={{ minWidth: 200 }}
          >
            {navLabel()}
          </span>
          <button
            onClick={next}
            className="p-1.5 rounded-full border border-border bg-card hover:bg-secondary transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <button
          onClick={() => setCursor(today)}
          className="ml-auto text-xs px-3 py-1.5 rounded-pill border border-border bg-card hover:bg-secondary font-medium transition-colors"
        >
          Hoy
        </button>
      </div>

      {/* View content */}
      <div className="flex-1 overflow-auto">
        {view === "day"   && <DayView   employeeId={employeeId} date={cursor} />}
        {view === "week"  && <WeekView  employeeId={employeeId} weekStart={weekStart} />}
        {view === "month" && <MonthView employeeId={employeeId} monthStart={monthStart} />}
      </div>
    </>
  );
}
