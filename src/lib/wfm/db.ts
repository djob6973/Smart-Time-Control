import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query, execute } from "@/lib/db";
import type { Area, Employee, Absence, Shift, ShiftHistory } from "./types";

// ── Mappers camelCase ↔ snake_case ────────────────────────────

function areaFromDB(r: Record<string, unknown>): Area {
  return {
    id: r.id as string,
    name: r.name as string,
    leader: r.leader as string,
    startHour: r.start_hour as number,
    endHour: r.end_hour as number,
    workingDays: r.working_days as number[],
    maxHoursDay: r.max_hours_day as number,
    maxHoursWeek: r.max_hours_week as number,
    maxHoursMonth: r.max_hours_month as number,
    allowOvertime: r.allow_overtime as boolean,
    allowSunday: r.allow_sunday as boolean,
    minRestHours: r.min_rest_hours as number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coverageRequirements: (r.coverage_requirements as any[]) ?? [],
    enableCoverageMode: (r.enable_coverage_mode as boolean) ?? false,
  };
}

function employeeFromDB(r: Record<string, unknown>): Employee {
  return {
    id: r.id as string,
    fullName: r.full_name as string,
    documentId: r.document_id as string,
    position: r.position as string,
    areaId: r.area_id as string,
    leader: r.leader as string,
    status: r.status as Employee["status"],
    contractType: r.contract_type as Employee["contractType"],
    hireDate: r.hire_date as string,
    availability: (r.availability as Employee["availability"]) ?? {},
  };
}

function shiftFromDB(r: Record<string, unknown>): Shift {
  return {
    id: r.id as string,
    employeeId: r.employee_id as string,
    date: r.date as string,
    start: r.start_hour as number,
    end: r.end_hour as number,
    breakMinutes: r.break_minutes as number,
    code: r.code as Shift["code"],
    locked: (r.locked as boolean) ?? false,
    note: r.note as string | undefined,
  };
}

function absenceFromDB(r: Record<string, unknown>): Absence {
  return {
    id: r.id as string,
    employeeId: r.employee_id as string,
    type: r.type as Absence["type"],
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    startHour: r.start_hour != null ? (r.start_hour as number) : undefined,
    endHour: r.end_hour != null ? (r.end_hour as number) : undefined,
    reason: r.reason as string,
    status: (r.status as Absence["status"]) ?? "pendiente",
  };
}

// ── Server functions internas ─────────────────────────────────

const _fetchAreas = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await query("SELECT * FROM public.areas ORDER BY name");
  return rows.map(areaFromDB);
});

const _fetchEmployees = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await query("SELECT * FROM public.employees ORDER BY full_name");
  return rows.map(employeeFromDB);
});

const _fetchShifts = createServerFn({ method: "GET" })
  .inputValidator(z.object({ weekStart: z.string().optional(), weekEnd: z.string().optional() }))
  .handler(async ({ data }) => {
    const params: unknown[] = [];
    let sql = "SELECT * FROM public.shifts WHERE 1=1";
    if (data.weekStart) { sql += ` AND date >= $${params.push(data.weekStart)}`; }
    if (data.weekEnd)   { sql += ` AND date <= $${params.push(data.weekEnd)}`; }
    const rows = await query(sql, params);
    return rows.map(shiftFromDB);
  });

const _fetchAbsences = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await query("SELECT * FROM public.absences ORDER BY start_date");
  return rows.map(absenceFromDB);
});

const _upsertArea = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as Area)
  .handler(async ({ data: a }) => {
    await execute(
      `INSERT INTO public.areas
         (id, name, leader, start_hour, end_hour, working_days, max_hours_day,
          max_hours_week, max_hours_month, allow_overtime, allow_sunday,
          min_rest_hours, coverage_requirements, enable_coverage_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         name=$2, leader=$3, start_hour=$4, end_hour=$5, working_days=$6,
         max_hours_day=$7, max_hours_week=$8, max_hours_month=$9,
         allow_overtime=$10, allow_sunday=$11, min_rest_hours=$12,
         coverage_requirements=$13, enable_coverage_mode=$14`,
      [
        a.id, a.name, a.leader, a.startHour, a.endHour,
        a.workingDays, a.maxHoursDay, a.maxHoursWeek, a.maxHoursMonth,
        a.allowOvertime, a.allowSunday, a.minRestHours,
        JSON.stringify(a.coverageRequirements), a.enableCoverageMode,
      ],
    );
  });

const _upsertEmployee = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as Employee)
  .handler(async ({ data: e }) => {
    await execute(
      `INSERT INTO public.employees
         (id, full_name, document_id, position, area_id, leader, status, contract_type, hire_date, availability)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         full_name=$2, document_id=$3, position=$4, area_id=$5, leader=$6,
         status=$7, contract_type=$8, hire_date=$9, availability=$10`,
      [
        e.id, e.fullName, e.documentId, e.position, e.areaId ?? null,
        e.leader, e.status, e.contractType, e.hireDate, JSON.stringify(e.availability),
      ],
    );
  });

const _upsertShift = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { shift: Shift; userId?: string | null })
  .handler(async ({ data: { shift: s, userId } }) => {
    await execute(
      `INSERT INTO public.shifts
         (id, employee_id, date, start_hour, end_hour, break_minutes, code, locked, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (employee_id, date) DO UPDATE SET
         id=$1, start_hour=$4, end_hour=$5, break_minutes=$6, code=$7, locked=$8, note=$9`,
      [s.id, s.employeeId, s.date, s.start, s.end, s.breakMinutes, s.code, s.locked ?? false, s.note ?? null],
    );
    await execute(
      `INSERT INTO public.shift_history
         (shift_id, employee_id, date, changed_by, start_hour, end_hour, break_minutes, code, locked, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [s.id, s.employeeId, s.date, userId ?? null, s.start, s.end, s.breakMinutes, s.code, s.locked ?? false, s.note ?? null],
    ).catch((err: unknown) => console.error("shift_history insert failed:", err));
  });

const _upsertShiftsBatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { shifts: Shift[]; userId?: string | null })
  .handler(async ({ data: { shifts, userId } }) => {
    for (const s of shifts) {
      await execute(
        `INSERT INTO public.shifts
           (id, employee_id, date, start_hour, end_hour, break_minutes, code, locked, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (employee_id, date) DO UPDATE SET
           id=$1, start_hour=$4, end_hour=$5, break_minutes=$6, code=$7, locked=$8, note=$9`,
        [s.id, s.employeeId, s.date, s.start, s.end, s.breakMinutes, s.code, s.locked ?? false, s.note ?? null],
      );
    }
    for (const s of shifts) {
      await execute(
        `INSERT INTO public.shift_history
           (shift_id, employee_id, date, changed_by, start_hour, end_hour, break_minutes, code, locked, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [s.id, s.employeeId, s.date, userId ?? null, s.start, s.end, s.breakMinutes, s.code, s.locked ?? false, s.note ?? null],
      ).catch((err: unknown) => console.error("shift_history batch insert failed:", err));
    }
  });

const _fetchShiftHistory = createServerFn({ method: "GET" })
  .inputValidator(z.object({ employeeId: z.string(), date: z.string() }))
  .handler(async ({ data }) => {
    const rows = await query(
      `SELECT sh.*, up.nombre as changed_by_name
       FROM public.shift_history sh
       LEFT JOIN public.user_profiles up ON up.id = sh.changed_by
       WHERE sh.employee_id = $1 AND sh.date = $2
       ORDER BY sh.changed_at DESC`,
      [data.employeeId, data.date],
    );
    return rows.map(
      (r): ShiftHistory => ({
        id:            r.id as string,
        shiftId:       r.shift_id as string,
        employeeId:    r.employee_id as string,
        date:          r.date as string,
        changedBy:     r.changed_by as string | null,
        changedByName: r.changed_by_name as string | null,
        changedAt:     r.changed_at as string,
        startHour:     r.start_hour as number,
        endHour:       r.end_hour as number,
        breakMinutes:  r.break_minutes as number,
        code:          r.code as Shift["code"],
        locked:        r.locked as boolean,
        note:          r.note as string | null,
      }),
    );
  });

const _upsertAbsence = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as Absence)
  .handler(async ({ data: a }) => {
    await execute(
      `INSERT INTO public.absences
         (id, employee_id, type, start_date, end_date, start_hour, end_hour, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         employee_id=$2, type=$3, start_date=$4, end_date=$5,
         start_hour=$6, end_hour=$7, reason=$8, status=$9`,
      [
        a.id, a.employeeId, a.type, a.startDate, a.endDate,
        a.startHour ?? null, a.endHour ?? null, a.reason, a.status ?? "pendiente",
      ],
    );
  });

const _removeArea = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await execute("DELETE FROM public.areas WHERE id = $1", [data.id]);
  });

const _removeEmployee = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await execute("DELETE FROM public.employees WHERE id = $1", [data.id]);
  });

const _removeShift = createServerFn({ method: "POST" })
  .inputValidator(z.object({ employeeId: z.string(), date: z.string() }))
  .handler(async ({ data }) => {
    await execute(
      "DELETE FROM public.shifts WHERE employee_id = $1 AND date = $2",
      [data.employeeId, data.date],
    );
  });

const _removeShiftsBatch = createServerFn({ method: "POST" })
  .inputValidator(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ data }) => {
    if (!data.ids.length) return;
    const placeholders = data.ids.map((_, i) => `$${i + 1}`).join(",");
    await execute(`DELETE FROM public.shifts WHERE id IN (${placeholders})`, data.ids);
  });

const _removeAbsence = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await execute("DELETE FROM public.absences WHERE id = $1", [data.id]);
  });

const _fetchApprovals = createServerFn({ method: "GET" })
  .inputValidator(z.object({ from: z.string(), to: z.string() }))
  .handler(async ({ data }) => {
    const rows = await query(
      `SELECT row_id, status, changed_by FROM public.report_approvals
       WHERE date >= $1 AND date <= $2`,
      [data.from, data.to],
    );
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.changed_by != null) map[r.row_id as string] = r.status as string;
    });
    return map;
  });

const _upsertApproval = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ rowId: z.string(), isoDate: z.string(), status: z.string(), userId: z.string().nullable().optional() }),
  )
  .handler(async ({ data }) => {
    await execute(
      `INSERT INTO public.report_approvals (row_id, date, status, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (row_id) DO UPDATE SET
         status=$3, changed_by=$4, changed_at=NOW()`,
      [data.rowId, data.isoDate, data.status, data.userId ?? null],
    );
  });

const _clearAllData = createServerFn({ method: "POST" }).handler(async () => {
  await execute("DELETE FROM public.shifts");
  await execute("DELETE FROM public.absences");
  await execute("DELETE FROM public.employees");
  await execute("DELETE FROM public.areas");
});

const _seedAllData = createServerFn({ method: "POST" })
  .inputValidator(
    (d: unknown) => d as { areas: Area[]; employees: Employee[]; absences: Absence[]; shifts: Shift[] },
  )
  .handler(async ({ data }) => {
    for (const a of data.areas) {
      await execute(
        `INSERT INTO public.areas
           (id, name, leader, start_hour, end_hour, working_days, max_hours_day,
            max_hours_week, max_hours_month, allow_overtime, allow_sunday,
            min_rest_hours, coverage_requirements, enable_coverage_mode)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO NOTHING`,
        [
          a.id, a.name, a.leader, a.startHour, a.endHour, a.workingDays,
          a.maxHoursDay, a.maxHoursWeek, a.maxHoursMonth, a.allowOvertime,
          a.allowSunday, a.minRestHours, JSON.stringify(a.coverageRequirements), a.enableCoverageMode,
        ],
      );
    }
    for (const e of data.employees) {
      await execute(
        `INSERT INTO public.employees
           (id, full_name, document_id, position, area_id, leader, status, contract_type, hire_date, availability)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [e.id, e.fullName, e.documentId, e.position, e.areaId ?? null, e.leader, e.status, e.contractType, e.hireDate, JSON.stringify(e.availability)],
      );
    }
    for (const a of data.absences) {
      await execute(
        `INSERT INTO public.absences
           (id, employee_id, type, start_date, end_date, start_hour, end_hour, reason, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO NOTHING`,
        [a.id, a.employeeId, a.type, a.startDate, a.endDate, a.startHour ?? null, a.endHour ?? null, a.reason, a.status ?? "pendiente"],
      );
    }
    for (const s of data.shifts) {
      await execute(
        `INSERT INTO public.shifts
           (id, employee_id, date, start_hour, end_hour, break_minutes, code, locked, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.employeeId, s.date, s.start, s.end, s.breakMinutes, s.code, s.locked ?? false, s.note ?? null],
      );
    }
  });

// ── Exports públicos con la misma firma que antes ─────────────

export async function fetchAreas(): Promise<Area[]> {
  return _fetchAreas();
}

export async function fetchEmployees(): Promise<Employee[]> {
  return _fetchEmployees();
}

export async function fetchShifts(weekStart?: string, weekEnd?: string): Promise<Shift[]> {
  return _fetchShifts({ data: { weekStart, weekEnd } });
}

export async function fetchAbsences(): Promise<Absence[]> {
  return _fetchAbsences();
}

export async function upsertArea(a: Area): Promise<void> {
  await _upsertArea({ data: a });
}

export async function upsertEmployee(e: Employee): Promise<void> {
  await _upsertEmployee({ data: e });
}

export async function upsertShift(s: Shift, userId?: string | null): Promise<void> {
  await _upsertShift({ data: { shift: s, userId } });
}

export async function upsertShiftsBatch(shifts: Shift[], userId?: string | null): Promise<void> {
  if (!shifts.length) return;
  await _upsertShiftsBatch({ data: { shifts, userId } });
}

export async function fetchShiftHistory(employeeId: string, date: string): Promise<ShiftHistory[]> {
  return _fetchShiftHistory({ data: { employeeId, date } });
}

export async function upsertAbsence(a: Absence): Promise<void> {
  await _upsertAbsence({ data: a });
}

export async function removeArea(id: string): Promise<void> {
  await _removeArea({ data: { id } });
}

export async function removeEmployee(id: string): Promise<void> {
  await _removeEmployee({ data: { id } });
}

export async function removeShift(employeeId: string, date: string): Promise<void> {
  await _removeShift({ data: { employeeId, date } });
}

export async function removeShiftsBatch(ids: string[]): Promise<void> {
  await _removeShiftsBatch({ data: { ids } });
}

export async function removeAbsence(id: string): Promise<void> {
  await _removeAbsence({ data: { id } });
}

export async function fetchApprovals(from: string, to: string): Promise<Record<string, string>> {
  return _fetchApprovals({ data: { from, to } });
}

export async function upsertApproval(
  rowId: string,
  isoDate: string,
  status: string,
  userId?: string | null,
): Promise<void> {
  await _upsertApproval({ data: { rowId, isoDate, status, userId } });
}

export async function clearAllData(): Promise<void> {
  await _clearAllData();
}

export async function seedAllData(
  areas: Area[],
  employees: Employee[],
  absences: Absence[],
  shifts: Shift[],
): Promise<void> {
  await _seedAllData({ data: { areas, employees, absences, shifts } });
}
