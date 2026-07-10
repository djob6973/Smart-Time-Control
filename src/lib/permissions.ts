export type RoleName = "admin" | "supervisor" | "lider" | "gestor" | "consulta";

// ── Resources ─────────────────────────────────────────────────────
export type Resource =
  // Módulos principales (sidebar)
  | "dashboard"
  | "scheduler"
  | "employees"
  | "areas"
  | "absences"
  | "reports"
  // Vista personal de horario
  | "mi_horario"
  // Control de Jornada — módulo + 5 sub-tabs
  | "jornada"
  | "jornada_dashboard"
  | "jornada_registro"
  | "jornada_historial"
  | "jornada_reportes"
  | "jornada_configuracion"
  // Reporte personal de jornada (vista de empleado vinculado)
  | "mi_jornada_reportes"
  // Reporte general de jornada por área (asignable a roles)
  | "jornada_reporte_general"
  // Configuración — módulo + 3 sub-tabs
  | "settings"
  | "settings_roles"
  | "settings_users"
  | "settings_data"
  // Novedades del día — avisos flotantes por área
  | "avisos";

export type Action = "view" | "edit" | "full" | "create" | "delete";

// ── Permissions per role ──────────────────────────────────────────
const ROLE_PERMISSIONS: Record<RoleName, Partial<Record<Resource, Action[]>>> = {
  admin: {
    dashboard:            ["view", "edit", "full"],
    scheduler:            ["view", "edit", "full"],
    employees:            ["view", "edit", "full"],
    areas:                ["view", "edit", "full"],
    absences:             ["view", "edit", "full"],
    reports:              ["view", "edit", "full"],
    mi_horario:           ["view"],
    jornada:              ["view", "edit", "full"],
    jornada_dashboard:    ["view", "edit", "full"],
    jornada_registro:     ["view", "edit", "full"],
    jornada_historial:    ["view", "edit", "full"],
    jornada_reportes:         ["view", "edit", "full"],
    jornada_configuracion:    ["view", "edit", "full"],
    mi_jornada_reportes:      ["view"],
    jornada_reporte_general:  ["view", "edit", "full"],
    settings:                 ["view", "edit", "full"],
    settings_roles:       ["view", "edit", "full"],
    settings_users:       ["view", "edit", "full"],
    settings_data:        ["view", "edit", "full"],
    avisos:               ["view", "edit", "create", "delete"],
  },
  supervisor: {
    dashboard:            ["view"],
    scheduler:            ["view", "edit"],
    employees:            ["view", "edit"],
    areas:                ["view"],
    absences:             ["view", "edit"],
    reports:              ["view"],
    mi_horario:           ["view"],
    jornada:              ["view", "edit"],
    jornada_dashboard:    ["view"],
    jornada_registro:     ["view", "edit"],
    jornada_historial:    ["view", "edit"],
    jornada_reportes:        ["view"],
    jornada_configuracion:   [],
    mi_jornada_reportes:     ["view"],
    jornada_reporte_general: ["view"],
    settings:                ["view"],
    settings_roles:       [],
    settings_users:       [],
    settings_data:        [],
    avisos:               ["view", "edit", "create"],
  },
  lider: {
    dashboard:            ["view"],
    scheduler:            ["view", "edit"],
    employees:            ["view"],
    areas:                ["view"],
    absences:             ["view", "edit"],
    reports:              ["view"],
    mi_horario:           ["view"],
    jornada:              ["view", "edit"],
    jornada_dashboard:    ["view"],
    jornada_registro:     ["view", "edit"],
    jornada_historial:    ["view"],
    jornada_reportes:        ["view"],
    jornada_configuracion:   [],
    mi_jornada_reportes:     ["view"],
    jornada_reporte_general: ["view"],
    settings:                [],
    settings_roles:          [],
    settings_users:          [],
    settings_data:           [],
    avisos:                  ["view", "edit", "create"],
  },
  gestor: {
    dashboard:            ["view"],
    scheduler:            ["view", "edit"],
    employees:            ["view"],
    areas:                ["view"],
    absences:             ["view"],
    reports:              ["view"],
    mi_horario:           ["view"],
    jornada:              ["view", "edit"],
    jornada_dashboard:    ["view"],
    jornada_registro:     ["view", "edit"],
    jornada_historial:    ["view"],
    jornada_reportes:        [],
    jornada_configuracion:   [],
    mi_jornada_reportes:     ["view"],
    jornada_reporte_general: [],
    settings:                [],
    settings_roles:          [],
    settings_users:          [],
    settings_data:           [],
    avisos:                  [],
  },
  consulta: {
    dashboard:            ["view"],
    scheduler:            ["view"],
    employees:            ["view"],
    areas:                ["view"],
    absences:             ["view"],
    reports:              ["view"],
    mi_horario:           ["view"],
    jornada:              ["view"],
    jornada_dashboard:    ["view"],
    jornada_registro:     [],
    jornada_historial:    ["view"],
    jornada_reportes:        [],
    jornada_configuracion:   [],
    mi_jornada_reportes:     ["view"],
    jornada_reporte_general: [],
    settings:                [],
    settings_roles:          [],
    settings_users:          [],
    settings_data:           [],
    avisos:                  [],
  },
};

export function hasPermission(
  role: RoleName | null | undefined,
  resource: Resource,
  action: Action,
): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  return ROLE_PERMISSIONS[role]?.[resource]?.includes(action) ?? false;
}

export function canAccess(role: RoleName | null | undefined, resource: Resource): boolean {
  return hasPermission(role, resource, "view");
}

// ── Access Limits ─────────────────────────────────────────────────
export interface AccessLimits {
  restrictToOwnArea:  boolean;
  canApproveAbsences: boolean;
  canGenerateShifts:  boolean;
  canExportReports:   boolean;
  canManageRoles:     boolean;
  canDeleteData:      boolean;
}

export const DEFAULT_LIMITS: AccessLimits = {
  restrictToOwnArea: false, canApproveAbsences: false, canGenerateShifts: false,
  canExportReports: false,  canManageRoles: false,     canDeleteData: false,
};

export const DEFAULT_LIMITS_BY_ROLE: Record<string, AccessLimits> = {
  admin:      { restrictToOwnArea: false, canApproveAbsences: true,  canGenerateShifts: true,  canExportReports: true,  canManageRoles: true,  canDeleteData: true  },
  supervisor: { restrictToOwnArea: true,  canApproveAbsences: true,  canGenerateShifts: true,  canExportReports: true,  canManageRoles: false, canDeleteData: false },
  lider:      { restrictToOwnArea: true,  canApproveAbsences: false, canGenerateShifts: false, canExportReports: false, canManageRoles: false, canDeleteData: false },
  gestor:     { restrictToOwnArea: false, canApproveAbsences: false, canGenerateShifts: false, canExportReports: false, canManageRoles: false, canDeleteData: false },
  consulta:   { restrictToOwnArea: false, canApproveAbsences: false, canGenerateShifts: false, canExportReports: false, canManageRoles: false, canDeleteData: false },
};
