import { supabase } from "@/lib/supabase";
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
    coverageRequirements: (r.coverage_requirements as any[]) ?? [],
    enableCoverageMode: (r.enable_coverage_mode as boolean) ?? false,
  };
}

function areaToDB(a: Area) {
  return {
    id: a.id,
    name: a.name,
    leader: a.leader,
    start_hour: a.startHour,
    end_hour: a.endHour,
    working_days: a.workingDays,
    max_hours_day: a.maxHoursDay,
    max_hours_week: a.maxHoursWeek,
    max_hours_month: a.maxHoursMonth,
    allow_overtime: a.allowOvertime,
    allow_sunday: a.allowSunday,
    min_rest_hours: a.minRestHours,
    coverage_requirements: a.coverageRequirements,
    enable_coverage_mode: a.enableCoverageMode,
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

function employeeToDB(e: Employee) {
  return {
    id: e.id,
    full_name: e.fullName,
    document_id: e.documentId,
    position: e.position,
    area_id: e.areaId,
    leader: e.leader,
    status: e.status,
    contract_type: e.contractType,
    hire_date: e.hireDate,
    availability: e.availability,
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

function shiftToDB(s: Shift) {
  return {
    id: s.id,
    employee_id: s.employeeId,
    date: s.date,
    start_hour: s.start,
    end_hour: s.end,
    break_minutes: s.breakMinutes,
    code: s.code,
    locked: s.locked ?? false,
    note: s.note ?? null,
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

function absenceToDB(a: Absence) {
  return {
    id: a.id,
    employee_id: a.employeeId,
    type: a.type,
    start_date: a.startDate,
    end_date: a.endDate,
    start_hour: a.startHour ?? null,
    end_hour: a.endHour ?? null,
    reason: a.reason,
    status: a.status ?? "pendiente",
  };
}

// ── Fetch all ─────────────────────────────────────────────────

export async function fetchAreas(): Promise<Area[]> {
  const { data, error } = await supabase.from("areas").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map(areaFromDB);
}

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase.from("employees").select("*").order("full_name");
  if (error) throw error;
  return (data ?? []).map(employeeFromDB);
}

export async function fetchShifts(weekStart?: string, weekEnd?: string): Promise<Shift[]> {
  let query = supabase.from("shifts").select("*");
  if (weekStart) query = query.gte("date", weekStart);
  if (weekEnd) query = query.lte("date", weekEnd);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(shiftFromDB);
}

export async function fetchAbsences(): Promise<Absence[]> {
  const { data, error } = await supabase.from("absences").select("*").order("start_date");
  if (error) throw error;
  return (data ?? []).map(absenceFromDB);
}

// ── Upserts ───────────────────────────────────────────────────

export async function upsertArea(a: Area): Promise<void> {
  const { error } = await supabase.from("areas").upsert(areaToDB(a));
  if (error) throw error;
}

export async function upsertEmployee(e: Employee): Promise<void> {
  const { error } = await supabase.from("employees").upsert(employeeToDB(e));
  if (error) throw error;
}

async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

function shiftHistoryRow(s: Shift, userId: string | null) {
  return {
    shift_id:      s.id,
    employee_id:   s.employeeId,
    date:          s.date,
    changed_by:    userId,
    start_hour:    s.start,
    end_hour:      s.end,
    break_minutes: s.breakMinutes,
    code:          s.code,
    locked:        s.locked ?? false,
    note:          s.note ?? null,
  };
}

export async function upsertShift(s: Shift): Promise<void> {
  const { error } = await supabase.from("shifts").upsert(shiftToDB(s));
  if (error) throw error;
  const userId = await currentUserId();
  const { error: histErr } = await supabase
    .from("shift_history")
    .insert(shiftHistoryRow(s, userId));
  if (histErr) console.error("shift_history insert failed:", histErr);
}

export async function upsertShiftsBatch(shifts: Shift[]): Promise<void> {
  if (shifts.length === 0) return;
  const { error } = await supabase.from("shifts").upsert(shifts.map(shiftToDB));
  if (error) throw error;
  const userId = await currentUserId();
  const { error: histErr } = await supabase
    .from("shift_history")
    .insert(shifts.map(s => shiftHistoryRow(s, userId)));
  if (histErr) console.error("shift_history batch insert failed:", histErr);
}

export async function fetchShiftHistory(employeeId: string, date: string): Promise<ShiftHistory[]> {
  const { data, error } = await supabase
    .from("shift_history")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("date", date)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];

  const userIds = [...new Set(rows.map((r: any) => r.changed_by).filter(Boolean))];
  const nameMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, nombre")
      .in("id", userIds);
    (profiles ?? []).forEach((p: any) => { nameMap[p.id] = p.nombre; });
  }

  return rows.map((r: any) => ({
    id:            r.id as string,
    shiftId:       r.shift_id as string,
    employeeId:    r.employee_id as string,
    date:          r.date as string,
    changedBy:     r.changed_by as string | null,
    changedByName: r.changed_by ? (nameMap[r.changed_by] ?? null) : null,
    changedAt:     r.changed_at as string,
    startHour:     r.start_hour as number,
    endHour:       r.end_hour as number,
    breakMinutes:  r.break_minutes as number,
    code:          r.code as Shift["code"],
    locked:        r.locked as boolean,
    note:          r.note as string | null,
  }));
}

export async function upsertAbsence(a: Absence): Promise<void> {
  const { error } = await supabase.from("absences").upsert(absenceToDB(a));
  if (error) throw error;
}

// ── Deletes ───────────────────────────────────────────────────

export async function removeArea(id: string): Promise<void> {
  const { error } = await supabase.from("areas").delete().eq("id", id);
  if (error) throw error;
}

export async function removeEmployee(id: string): Promise<void> {
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw error;
}

export async function removeShift(employeeId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from("shifts")
    .delete()
    .eq("employee_id", employeeId)
    .eq("date", date);
  if (error) throw error;
}

export async function removeShiftsBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("shifts").delete().in("id", ids);
  if (error) throw error;
}

export async function removeAbsence(id: string): Promise<void> {
  const { error } = await supabase.from("absences").delete().eq("id", id);
  if (error) throw error;
}

// ── Report approvals ─────────────────────────────────────────

export async function fetchApprovals(
  from: string,
  to: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("report_approvals")
    .select("row_id, status")
    .gte("date", from)
    .lte("date", to);
  if (error) throw error;
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: any) => { map[r.row_id] = r.status; });
  return map;
}

export async function upsertApproval(
  rowId: string,
  isoDate: string,
  status: string,
): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from("report_approvals").upsert(
    { row_id: rowId, date: isoDate, status, changed_by: userId, changed_at: new Date().toISOString() },
    { onConflict: "row_id" },
  );
  if (error) throw error;
}

// ── Reset (para desarrollo) ───────────────────────────────────

export async function clearAllData(): Promise<void> {
  await supabase.from("shifts").delete().neq("id", "");
  await supabase.from("absences").delete().neq("id", "");
  await supabase.from("employees").delete().neq("id", "");
  await supabase.from("areas").delete().neq("id", "");
}

export async function seedAllData(
  areas: Area[],
  employees: Employee[],
  absences: Absence[],
  shifts: Shift[],
): Promise<void> {
  await supabase.from("areas").upsert(areas.map(areaToDB));
  await supabase.from("employees").upsert(employees.map(employeeToDB));
  await supabase.from("absences").upsert(absences.map(absenceToDB));
  await supabase.from("shifts").upsert(shifts.map(shiftToDB));
}
