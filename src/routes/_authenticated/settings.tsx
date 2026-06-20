import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { Topbar } from "@/components/wfm/Topbar";
import { useWFM } from "@/lib/wfm/store";
import { useAuth } from "@/lib/auth";
import {
  adminListUsers, adminCreateUser, adminUpdateUser, adminResetPassword,
  adminLoadRoles, adminUpdateRole, adminCreateRole, adminDeleteRole,
  adminListOrgMembers, adminUpdateOrg, adminCreateOrg, adminAddOrgMember, adminRemoveOrgMember,
  type AppUser, type DbRole, type OrgMember,
} from "@/lib/auth/admin.server";
import {
  RefreshCw, Shield, Trash2, Check, X,
  CalendarDays, UserCog, FileX, BarChart3, Settings2,
  Clock, LayoutDashboard, Building2, CalendarCheck,
  Search, Key, Users, Plus, UserPlus, PencilLine,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────

type PermLevel = "none" | "view" | "edit" | "full";

interface RolePermissions {
  dashboard: PermLevel; scheduler: PermLevel; mi_horario: PermLevel;
  employees: PermLevel; areas: PermLevel; absences: PermLevel; reports: PermLevel;
  jornada: PermLevel; jornada_dashboard: PermLevel; jornada_registro: PermLevel;
  jornada_historial: PermLevel; jornada_reportes: PermLevel; jornada_configuracion: PermLevel;
  mi_jornada_reportes: PermLevel; settings: PermLevel; settings_roles: PermLevel;
  settings_users: PermLevel; settings_data: PermLevel;
}

interface AccessLimits {
  restrictToOwnArea: boolean; canApproveAbsences: boolean; canGenerateShifts: boolean;
  canExportReports: boolean; canManageRoles: boolean; canDeleteData: boolean;
}

interface Role {
  id: string; dbId?: string; name: string; color: string; bgColor: string;
  description: string; permissions: RolePermissions; limits: AccessLimits; isSystem?: boolean;
}

// ── Matrix data ───────────────────────────────────────────────────────────

const MATRIX_ROLES = ["admin", "supervisor", "lider", "gestor", "consulta"] as const;
type MatrixRole = typeof MATRIX_ROLES[number];

const MAIN_MODULES: { key: keyof RolePermissions; label: string; indent?: boolean }[] = [
  { key: "dashboard",             label: "Dashboard" },
  { key: "scheduler",             label: "Programación" },
  { key: "mi_horario",            label: "Mi Horario" },
  { key: "jornada",               label: "Control de Jornada" },
  { key: "jornada_dashboard",     label: "Dashboard",      indent: true },
  { key: "jornada_registro",      label: "Registro",       indent: true },
  { key: "jornada_historial",     label: "Historial",      indent: true },
  { key: "jornada_reportes",      label: "Reportes",       indent: true },
  { key: "jornada_configuracion", label: "Configuración",  indent: true },
  { key: "employees",             label: "Trabajadores" },
  { key: "areas",                 label: "Áreas" },
  { key: "absences",             label: "Ausencias" },
  { key: "reports",               label: "Reportes" },
  { key: "settings",              label: "Configuración" },
];

const MATRIX_LIMITS: { key: keyof AccessLimits; label: string }[] = [
  { key: "restrictToOwnArea",  label: "Restringir a su propia área" },
  { key: "canGenerateShifts",  label: "Generar turnos automáticos" },
  { key: "canApproveAbsences", label: "Aprobar ausencias" },
  { key: "canExportReports",   label: "Exportar reportes" },
  { key: "canManageRoles",     label: "Gestionar roles" },
  { key: "canDeleteData",      label: "Eliminar datos" },
];

const NAV_ITEMS: { label: string; icon: React.FC<{ className?: string }>; permKey: keyof RolePermissions }[] = [
  { label: "Dashboard",          icon: LayoutDashboard, permKey: "dashboard" },
  { label: "Programación",       icon: CalendarDays,    permKey: "scheduler" },
  { label: "Mi Horario",         icon: CalendarCheck,   permKey: "mi_horario" },
  { label: "Control de Jornada", icon: Clock,           permKey: "jornada" },
  { label: "Trabajadores",       icon: UserCog,         permKey: "employees" },
  { label: "Áreas",              icon: Building2,       permKey: "areas" },
  { label: "Ausencias",          icon: FileX,           permKey: "absences" },
  { label: "Reportes",           icon: BarChart3,       permKey: "reports" },
  { label: "Configuración",      icon: Settings2,       permKey: "settings" },
];

// ── Role definitions ──────────────────────────────────────────────────────

const INITIAL_ROLES: Role[] = [
  {
    id: "admin", name: "Administrador", color: "text-primary", bgColor: "bg-primary/10",
    description: "Acceso total al sistema sin restricciones.",
    permissions: {
      dashboard:"full", scheduler:"full", mi_horario:"view", employees:"full", areas:"full", absences:"full", reports:"full",
      jornada:"full", jornada_dashboard:"full", jornada_registro:"full", jornada_historial:"full", jornada_reportes:"full", jornada_configuracion:"full", mi_jornada_reportes:"view",
      settings:"full", settings_roles:"full", settings_users:"full", settings_data:"full",
    },
    limits: { restrictToOwnArea:false, canApproveAbsences:true, canGenerateShifts:true, canExportReports:true, canManageRoles:true, canDeleteData:true },
    isSystem: true,
  },
  {
    id: "supervisor", name: "Supervisor", color: "text-purple-700", bgColor: "bg-purple-100",
    description: "Gestiona programación y reportes de su área.",
    permissions: {
      dashboard:"view", scheduler:"edit", mi_horario:"view", employees:"view", areas:"view", absences:"edit", reports:"view",
      jornada:"edit", jornada_dashboard:"view", jornada_registro:"edit", jornada_historial:"edit", jornada_reportes:"view", jornada_configuracion:"none", mi_jornada_reportes:"view",
      settings:"none", settings_roles:"none", settings_users:"none", settings_data:"none",
    },
    limits: { restrictToOwnArea:true, canApproveAbsences:true, canGenerateShifts:true, canExportReports:true, canManageRoles:false, canDeleteData:false },
  },
  {
    id: "lider", name: "Líder", color: "text-blue-700", bgColor: "bg-blue-100",
    description: "Supervisa turnos y disponibilidad de su área asignada.",
    permissions: {
      dashboard:"view", scheduler:"view", mi_horario:"view", employees:"view", areas:"view", absences:"view", reports:"none",
      jornada:"edit", jornada_dashboard:"view", jornada_registro:"edit", jornada_historial:"view", jornada_reportes:"view", jornada_configuracion:"none", mi_jornada_reportes:"view",
      settings:"none", settings_roles:"none", settings_users:"none", settings_data:"none",
    },
    limits: { restrictToOwnArea:true, canApproveAbsences:false, canGenerateShifts:false, canExportReports:false, canManageRoles:false, canDeleteData:false },
  },
  {
    id: "gestor", name: "Gestor", color: "text-amber-700", bgColor: "bg-amber-100",
    description: "Crea ausencias y edita datos de empleados.",
    permissions: {
      dashboard:"view", scheduler:"view", mi_horario:"view", employees:"edit", areas:"none", absences:"edit", reports:"view",
      jornada:"edit", jornada_dashboard:"view", jornada_registro:"edit", jornada_historial:"view", jornada_reportes:"none", jornada_configuracion:"none", mi_jornada_reportes:"view",
      settings:"none", settings_roles:"none", settings_users:"none", settings_data:"none",
    },
    limits: { restrictToOwnArea:false, canApproveAbsences:false, canGenerateShifts:false, canExportReports:false, canManageRoles:false, canDeleteData:false },
  },
  {
    id: "consulta", name: "Consulta", color: "text-muted-foreground", bgColor: "bg-muted",
    description: "Solo puede visualizar información del sistema.",
    permissions: {
      dashboard:"view", scheduler:"view", mi_horario:"view", employees:"view", areas:"view", absences:"view", reports:"view",
      jornada:"view", jornada_dashboard:"view", jornada_registro:"none", jornada_historial:"view", jornada_reportes:"none", jornada_configuracion:"none", mi_jornada_reportes:"view",
      settings:"none", settings_roles:"none", settings_users:"none", settings_data:"none",
    },
    limits: { restrictToOwnArea:false, canApproveAbsences:false, canGenerateShifts:false, canExportReports:false, canManageRoles:false, canDeleteData:false },
  },
];

const ALL_PERMS_NONE: RolePermissions = {
  dashboard: "none", scheduler: "none", mi_horario: "none",
  employees: "none", areas: "none", absences: "none", reports: "none",
  jornada: "none", jornada_dashboard: "none", jornada_registro: "none",
  jornada_historial: "none", jornada_reportes: "none", jornada_configuracion: "none",
  mi_jornada_reportes: "none",
  settings: "none", settings_roles: "none", settings_users: "none", settings_data: "none",
};
const ALL_LIMITS_FALSE: AccessLimits = {
  restrictToOwnArea: false, canApproveAbsences: false, canGenerateShifts: false,
  canExportReports: false, canManageRoles: false, canDeleteData: false,
};

export const ROLE_MAP: Record<string, Pick<Role, "name" | "color" | "bgColor">> = {
  admin:      { name: "Administrador", color: "text-primary",          bgColor: "bg-primary/10" },
  supervisor: { name: "Supervisor",    color: "text-purple-700",       bgColor: "bg-purple-100" },
  lider:      { name: "Líder",         color: "text-blue-700",         bgColor: "bg-blue-100" },
  gestor:     { name: "Gestor",        color: "text-amber-700",        bgColor: "bg-amber-100" },
  consulta:   { name: "Consulta",      color: "text-muted-foreground", bgColor: "bg-muted" },
};

// ── Route ─────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configuración · STC" }] }),
  component: SettingsPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase() || "?";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  <  1) return "Ahora";
  if (mins  < 60) return `Hace ${mins} min`;
  if (hours < 24) return `Hace ${hours} h`;
  if (days  <  7) return `Hace ${days} día${days > 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

const ROLE_SEL_STYLE: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  border: "1px solid var(--color-border)",
  background: "var(--color-card)",
  borderRadius: "999px",
  padding: "4px 28px 4px 10px",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--color-foreground)",
  cursor: "pointer",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='1.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
};

function PermLvl({ perm }: { perm: PermLevel }) {
  if (perm === "edit" || perm === "full") {
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium"
        style={{ background: "color-mix(in srgb, #ED5650 12%, transparent)", color: "#ED5650" }}
      >
        Editar
      </span>
    );
  }
  if (perm === "view") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium bg-secondary text-muted-foreground">
        Ver
      </span>
    );
  }
  return <span className="text-muted-foreground/30 text-base leading-none select-none">—</span>;
}

function LimitYN({ yes }: { yes: boolean }) {
  return yes
    ? <Check className="size-4 mx-auto" style={{ color: "#ED5650" }} />
    : <X className="size-4 text-muted-foreground/30 mx-auto" />;
}

const PERM_CYCLE: PermLevel[] = ["none", "view", "edit", "full"];
function cycleLevel(cur: PermLevel): PermLevel {
  return PERM_CYCLE[(PERM_CYCLE.indexOf(cur) + 1) % PERM_CYCLE.length];
}

function pickPermsFromDB(p: Record<string, any>): Partial<RolePermissions> {
  const keys: (keyof RolePermissions)[] = [
    "dashboard","scheduler","mi_horario","employees","areas","absences","reports",
    "jornada","jornada_dashboard","jornada_registro","jornada_historial",
    "jornada_reportes","jornada_configuracion","mi_jornada_reportes",
    "settings","settings_roles","settings_users","settings_data",
  ];
  const out: any = {};
  keys.forEach(k => { if (k in p) out[k] = p[k]; });
  return out;
}

function pickLimitsFromDB(p: Record<string, any>): Partial<AccessLimits> {
  const keys: (keyof AccessLimits)[] = [
    "restrictToOwnArea","canApproveAbsences","canGenerateShifts",
    "canExportReports","canManageRoles","canDeleteData",
  ];
  const out: any = {};
  keys.forEach(k => { if (k in p) out[k] = p[k]; });
  return out;
}

// ── Page ──────────────────────────────────────────────────────────────────

function SettingsPage() {
  const { resetAll, areas, employees } = useWFM();
  const { role: authRole, user, organization, organizations, switchOrg } = useAuth();
  const isAdmin = authRole === "admin";

  const [tab, setTab] = useState<"users" | "roles" | "org">("users");

  // Users tab state
  const [users, setUsers]               = useState<AppUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError]     = useState<string | null>(null);
  const [userSearch, setUserSearch]     = useState("");

  // Create user modal state
  const [createUserOpen, setCreateUserOpen]     = useState(false);
  const [createUserForm, setCreateUserForm]     = useState({ email: "", password: "", fullName: "", roleId: "", areaId: "" });
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [createUserError, setCreateUserError]   = useState<string | null>(null);

  // Password reset modal state
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [newPass, setNewPass]         = useState("");
  const [passError, setPassError]     = useState<string | null>(null);
  const [passLoading, setPassLoading] = useState(false);

  // Roles tab state
  const [menuRole, setMenuRole] = useState<MatrixRole>("admin");
  const [localRoles, setLocalRoles]       = useState<Role[]>(INITIAL_ROLES);
  const [dirtyRoleIds, setDirtyRoleIds]   = useState<Set<string>>(new Set());
  const [rolesLoading, setRolesLoading]   = useState(false);
  const [rolesError, setRolesError]       = useState<string | null>(null);
  const [rolesSaving, setRolesSaving]     = useState(false);
  const [saveSuccess, setSaveSuccess]     = useState(false);

  // Org tab state
  const [resetting, setResetting] = useState(false);

  // Org edit state
  const [editOrgNombre, setEditOrgNombre] = useState(organization?.nombre ?? "");
  const [editOrgPlan, setEditOrgPlan]     = useState(organization?.plan ?? "free");
  const [orgSaving, setOrgSaving]         = useState(false);
  const [orgSaveError, setOrgSaveError]   = useState<string | null>(null);
  const [orgSaveSuccess, setOrgSaveSuccess] = useState(false);

  // Members state
  const [orgMembers, setOrgMembers]           = useState<OrgMember[]>([]);
  const [membersLoading, setMembersLoading]   = useState(false);
  const [addMemberEmail, setAddMemberEmail]   = useState("");
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addMemberError, setAddMemberError]   = useState<string | null>(null);

  // Create org state
  const [newOrgNombre, setNewOrgNombre]         = useState("");
  const [newOrgPlan, setNewOrgPlan]             = useState("free");
  const [createOrgLoading, setCreateOrgLoading] = useState(false);
  const [createOrgError, setCreateOrgError]     = useState<string | null>(null);
  const [createOrgSuccess, setCreateOrgSuccess] = useState(false);

  async function fetchUsers() {
    setUsersLoading(true);
    setUsersError(null);
    try { setUsers(await adminListUsers()); }
    catch (e: any) { setUsersError(e.message ?? "Error cargando usuarios"); }
    finally { setUsersLoading(false); }
  }

  useEffect(() => {
    if (tab === "users" && isAdmin) fetchUsers();
    if (tab === "roles" && isAdmin) loadRoles();
    if (tab === "org" && organization?.id) loadOrgMembers();
  }, [tab, isAdmin, organization?.id]);

  useEffect(() => {
    if (organization) {
      setEditOrgNombre(organization.nombre);
      setEditOrgPlan(organization.plan);
    }
  }, [organization?.id]);

  async function loadRoles() {
    setRolesLoading(true);
    setRolesError(null);
    try {
      const dbRoles = await adminLoadRoles();
      setLocalRoles(
        INITIAL_ROLES.map(role => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = dbRoles.find((r: any) => r.nombre === role.id);
          if (!db) return role;
          const p = db.permisos as Record<string, any>;
          return {
            ...role,
            dbId: db.id,
            // DB es fuente de verdad: lo que no esté en DB = "none"/false
            permissions: { ...ALL_PERMS_NONE, ...pickPermsFromDB(p) },
            limits: { ...ALL_LIMITS_FALSE, ...pickLimitsFromDB(p) },
          };
        })
      );
      setDirtyRoleIds(new Set());
    } catch (e: any) {
      setRolesError(e.message ?? "Error cargando roles");
    } finally {
      setRolesLoading(false);
    }
  }

  function updatePermission(roleId: string, key: keyof RolePermissions, value: PermLevel) {
    if (!isAdmin) return;
    setLocalRoles(prev =>
      prev.map(r => r.id === roleId ? { ...r, permissions: { ...r.permissions, [key]: value } } : r)
    );
    setDirtyRoleIds(prev => new Set([...prev, roleId]));
    setSaveSuccess(false);
  }

  function updateLimit(roleId: string, key: keyof AccessLimits, value: boolean) {
    if (!isAdmin) return;
    setLocalRoles(prev =>
      prev.map(r => r.id === roleId ? { ...r, limits: { ...r.limits, [key]: value } } : r)
    );
    setDirtyRoleIds(prev => new Set([...prev, roleId]));
    setSaveSuccess(false);
  }

  async function saveRoles() {
    setRolesSaving(true);
    setRolesError(null);
    try {
      for (const roleId of dirtyRoleIds) {
        const role = localRoles.find(r => r.id === roleId);
        if (!role?.dbId) continue;
        await adminUpdateRole({
          data: { id: role.dbId, permisos: { ...role.permissions, ...role.limits } },
        });
      }
      setDirtyRoleIds(new Set());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (e: any) {
      setRolesError(e.message ?? "Error al guardar roles");
    } finally {
      setRolesSaving(false);
    }
  }

  async function handleRoleChange(userId: string, newRoleId: string) {
    try {
      await adminUpdateUser({ data: { id: userId, roleId: newRoleId } });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, roleId: newRoleId } : u));
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  }

  async function handleAreaChange(userId: string, newAreaId: string) {
    const areaId = newAreaId || null;
    const areaName = areaId ? (areas.find(a => a.id === areaId)?.name ?? null) : null;
    try {
      await adminUpdateUser({ data: { id: userId, areaId } });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, areaId, areaName } : u));
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  }

  // ── Org handlers ─────────────────────────────────────────────────

  async function loadOrgMembers() {
    if (!organization?.id) return;
    setMembersLoading(true);
    try {
      const members = await adminListOrgMembers({ data: { orgId: organization.id } });
      setOrgMembers(members);
    } catch (e: any) { console.error(e); }
    finally { setMembersLoading(false); }
  }

  async function handleSaveOrg() {
    if (!organization?.id || !isAdmin) return;
    const nombre = (editOrgNombre.trim() || organization.nombre).trim();
    if (!nombre) return;
    setOrgSaving(true);
    setOrgSaveError(null);
    try {
      await adminUpdateOrg({ data: { id: organization.id, nombre, plan: editOrgPlan } });
      setOrgSaveSuccess(true);
      setTimeout(() => { setOrgSaveSuccess(false); window.location.reload(); }, 1200);
    } catch (e: any) {
      setOrgSaveError(e.message ?? "Error al guardar");
    } finally { setOrgSaving(false); }
  }

  async function handleAddMember() {
    if (!organization?.id || !addMemberEmail.trim()) return;
    setAddMemberLoading(true);
    setAddMemberError(null);
    try {
      await adminAddOrgMember({ data: { orgId: organization.id, email: addMemberEmail.trim() } });
      setAddMemberEmail("");
      await loadOrgMembers();
    } catch (e: any) {
      setAddMemberError(e.message ?? "Error al agregar miembro");
    } finally { setAddMemberLoading(false); }
  }

  async function handleRemoveMember(userId: string) {
    if (!organization?.id) return;
    if (!confirm("¿Quitar a este miembro de la organización?")) return;
    try {
      await adminRemoveOrgMember({ data: { orgId: organization.id, userId } });
      setOrgMembers(prev => prev.filter(m => m.userId !== userId));
    } catch (e: any) { alert(`Error: ${e.message}`); }
  }

  async function handleCreateOrg() {
    if (!user?.id || !newOrgNombre.trim()) return;
    setCreateOrgLoading(true);
    setCreateOrgError(null);
    try {
      await adminCreateOrg({ data: { nombre: newOrgNombre.trim(), plan: newOrgPlan, userId: user.id } });
      setNewOrgNombre("");
      setNewOrgPlan("free");
      setCreateOrgSuccess(true);
      setTimeout(() => { setCreateOrgSuccess(false); window.location.reload(); }, 1500);
    } catch (e: any) {
      setCreateOrgError(e.message ?? "Error al crear organización");
    } finally { setCreateOrgLoading(false); }
  }

  async function handleCreateUser() {
    if (!createUserForm.email.trim() || !createUserForm.password || !createUserForm.fullName.trim()) {
      setCreateUserError("Correo, contraseña y nombre son obligatorios.");
      return;
    }
    if (createUserForm.password.length < 8) {
      setCreateUserError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setCreateUserLoading(true);
    setCreateUserError(null);
    try {
      await adminCreateUser({
        data: {
          email: createUserForm.email.trim().toLowerCase(),
          password: createUserForm.password,
          fullName: createUserForm.fullName.trim(),
          roleId: createUserForm.roleId,
          areaId: createUserForm.areaId || null,
        },
      });
      setCreateUserOpen(false);
      setCreateUserForm({ email: "", password: "", fullName: "", roleId: "", areaId: "" });
      await fetchUsers();
    } catch (e: any) {
      setCreateUserError(e.message ?? "Error al crear el usuario");
    } finally {
      setCreateUserLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!resetTarget || !newPass || newPass.length < 8) return;
    setPassLoading(true);
    setPassError(null);
    try {
      await adminResetPassword({ data: { id: resetTarget.id, newPassword: newPass } });
      setResetTarget(null);
      setNewPass("");
    } catch (e: any) {
      setPassError(e.message ?? "Error al restablecer contraseña");
    } finally {
      setPassLoading(false);
    }
  }

  function closeResetModal() {
    setResetTarget(null);
    setNewPass("");
    setPassError(null);
  }

  async function handleReset() {
    if (!window.confirm("¿Borrar TODOS los datos? Esta acción no se puede deshacer.")) return;
    setResetting(true);
    try { await resetAll(); } finally { setResetting(false); }
  }


  const filteredUsers = users.filter(u => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (u.fullName ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const activeCount = users.filter(u => u.isActive).length;

  const TABS = [
    { key: "users" as const, label: "Usuarios",         Icon: Users },
    { key: "roles" as const, label: "Roles y permisos", Icon: Shield },
    { key: "org"   as const, label: "Organización",     Icon: Building2 },
  ];

  return (
    <>
      <Topbar title="Configuración" subtitle="Usuarios, roles y organización" />

      {/* Tab bar */}
      <div className="border-b border-border px-6">
        <div className="flex gap-1">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6">

        {/* ── Usuarios ──────────────────────────────────────────────────── */}
        {tab === "users" && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Buscar usuario…"
                  className="w-full rounded-pill border border-border bg-card pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <span className="text-sm text-muted-foreground ml-auto">
                <strong className="font-semibold text-foreground">{activeCount}</strong> usuarios activos
              </span>
              <button
                onClick={fetchUsers}
                disabled={usersLoading}
                className="p-2 rounded-full border border-border bg-card hover:bg-secondary disabled:opacity-50 transition-colors"
                title="Actualizar"
              >
                <RefreshCw className={`size-4 ${usersLoading ? "animate-spin" : ""}`} />
              </button>
              {isAdmin && (
                <button
                  onClick={() => { setCreateUserOpen(true); setCreateUserError(null); }}
                  className="inline-flex items-center gap-2 rounded-pill bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <UserPlus className="size-4" />
                  Nuevo usuario
                </button>
              )}
            </div>

            {usersError && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {usersError}
              </div>
            )}

            <div className="rounded-card border border-border bg-card shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Usuario</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Correo</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Rol</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Área</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Estado</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">Último acceso</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {usersLoading && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">Cargando usuarios…</td>
                      </tr>
                    )}
                    {!usersLoading && filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">
                          {userSearch ? "Sin resultados para la búsqueda" : "Sin usuarios registrados"}
                        </td>
                      </tr>
                    )}
                    {!usersLoading && filteredUsers.map(u => (
                      <tr key={u.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                        {/* Avatar + name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="size-8 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0">
                              {initials(u.fullName || u.email)}
                            </div>
                            <span className="font-medium">{u.fullName || "—"}</span>
                          </div>
                        </td>
                        {/* Email */}
                        <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                        {/* Role dropdown */}
                        <td className="px-4 py-3">
                          <select
                            value={u.roleId ?? ""}
                            onChange={e => handleRoleChange(u.id, e.target.value)}
                            style={ROLE_SEL_STYLE}
                          >
                            <option value="">Sin rol asignado</option>
                            {Object.entries(ROLE_MAP).map(([id, r]) => (
                              <option key={id} value={id}>{r.name}</option>
                            ))}
                          </select>
                        </td>
                        {/* Area dropdown */}
                        <td className="px-4 py-3">
                          <select
                            value={u.areaId ?? ""}
                            onChange={e => handleAreaChange(u.id, e.target.value)}
                            style={ROLE_SEL_STYLE}
                          >
                            <option value="">Todas las áreas</option>
                            {areas.map(a => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        </td>
                        {/* Status pill */}
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[11px] font-medium tracking-[0.02em]"
                            style={u.isActive
                              ? { background: "color-mix(in srgb, #1F8A5B 14%, transparent)", color: "#1F8A5B" }
                              : { background: "var(--color-secondary)", color: "var(--color-muted-foreground)" }}
                          >
                            <span className={`size-1.5 rounded-full ${u.isActive ? "bg-[#1F8A5B]" : "bg-muted-foreground/40"}`} />
                            {u.isActive ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        {/* Last access */}
                        <td className="px-4 py-3 text-muted-foreground text-xs">{relativeTime(u.lastSignIn)}</td>
                        {/* Reset password */}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => { setResetTarget(u); setNewPass(""); setPassError(null); }}
                            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-pill border border-border bg-card hover:bg-secondary transition-colors whitespace-nowrap"
                          >
                            <Key className="size-3.5" /> Restablecer clave
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Roles y permisos ──────────────────────────────────────────── */}
        {tab === "roles" && (
          <div className="space-y-4">

            {rolesError && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2">
                <X className="size-4 shrink-0" /> {rolesError}
              </div>
            )}

            {saveSuccess && (
              <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
                style={{ background: "color-mix(in srgb,#1F8A5B 8%,transparent)", color: "#1F8A5B", border: "1px solid color-mix(in srgb,#1F8A5B 25%,transparent)" }}>
                <Check className="size-4 shrink-0" /> Cambios guardados correctamente
              </div>
            )}

            {/* Permission matrix */}
            <div className="rounded-card border border-border bg-card shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-sm">Matriz de permisos por módulo</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Clic en una celda para cambiar · <span className="tabular-nums">none → ver → editar → full</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rolesLoading && <RefreshCw className="size-4 text-muted-foreground animate-spin" />}
                  <button onClick={loadRoles} disabled={rolesLoading} className="p-1.5 rounded-full border border-border bg-card hover:bg-secondary disabled:opacity-50 transition-colors" title="Recargar desde BD">
                    <RefreshCw className={`size-3.5 ${rolesLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto px-5 pt-4">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left pb-3 pr-6 font-medium text-[11px] uppercase tracking-[0.03em] text-muted-foreground sticky left-0 bg-card w-36">
                        Módulo
                      </th>
                      {MATRIX_ROLES.map(rId => (
                        <th key={rId} className="pb-3 px-2 text-center font-medium text-[11px] uppercase tracking-[0.03em] text-muted-foreground bg-secondary/50 min-w-[100px]">
                          <div className="inline-flex items-center justify-center gap-1.5">
                            {ROLE_MAP[rId].name}
                            {dirtyRoleIds.has(rId) && (
                              <span className="size-1.5 rounded-full bg-primary shrink-0" title="Cambios pendientes" />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MAIN_MODULES.map(({ key, label, indent }) => (
                      <tr key={key} className="border-t border-border/60">
                        <td className={`py-2 pr-6 sticky left-0 bg-card text-sm ${indent ? "pl-6 text-muted-foreground font-normal" : "font-medium"}`}>
                          {indent && <span className="mr-1 opacity-40">↳</span>}{label}
                        </td>
                        {MATRIX_ROLES.map(rId => {
                          const role = localRoles.find(x => x.id === rId);
                          const perm = role ? role.permissions[key] : "none";
                          return (
                            <td key={rId} className="py-1 px-2 text-center">
                              <button
                                onClick={() => updatePermission(rId, key, cycleLevel(perm))}
                                className="w-full flex justify-center items-center rounded-lg py-1.5 hover:bg-secondary/70 active:scale-95 transition-all"
                                title={`Actual: ${perm} — clic para cambiar`}
                              >
                                <PermLvl perm={perm} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Inline save bar */}
              <div className={`flex items-center justify-between gap-3 px-5 py-3 border-t border-border transition-all ${dirtyRoleIds.size > 0 ? "bg-primary/5" : "bg-transparent"}`}>
                <span className="text-xs text-muted-foreground">
                  {dirtyRoleIds.size > 0
                    ? `${dirtyRoleIds.size} rol${dirtyRoleIds.size !== 1 ? "es" : ""} con cambios sin guardar`
                    : "Sin cambios pendientes"}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={loadRoles}
                    disabled={rolesSaving || rolesLoading || dirtyRoleIds.size === 0}
                    className="text-sm px-3 py-1.5 rounded-pill border border-border hover:bg-secondary disabled:opacity-40 transition-colors"
                  >
                    Descartar
                  </button>
                  <button
                    onClick={saveRoles}
                    disabled={rolesSaving || dirtyRoleIds.size === 0}
                    className="text-sm px-4 py-1.5 rounded-pill bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-1.5"
                  >
                    {rolesSaving ? <RefreshCw className="size-3 animate-spin" /> : <Check className="size-3" />}
                    {rolesSaving ? "Guardando…" : "Guardar cambios"}
                  </button>
                </div>
              </div>
            </div>

            {/* Limits matrix */}
            <div className="rounded-card border border-border bg-card shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-sm">Límites granulares</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Clic para activar o desactivar capacidades por rol</p>
              </div>
              <div className="overflow-x-auto px-5 pt-4 pb-4">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left pb-3 pr-6 font-medium text-[11px] uppercase tracking-[0.03em] text-muted-foreground sticky left-0 bg-card w-52">
                        Capacidad
                      </th>
                      {MATRIX_ROLES.map(rId => (
                        <th key={rId} className="pb-3 px-2 text-center font-medium text-[11px] uppercase tracking-[0.03em] text-muted-foreground bg-secondary/50 min-w-[100px]">
                          <div className="inline-flex items-center justify-center gap-1.5">
                            {ROLE_MAP[rId].name}
                            {dirtyRoleIds.has(rId) && (
                              <span className="size-1.5 rounded-full bg-primary shrink-0" />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MATRIX_LIMITS.map(({ key, label }) => (
                      <tr key={key} className="border-t border-border/60">
                        <td className="py-2 pr-6 font-medium sticky left-0 bg-card text-sm">{label}</td>
                        {MATRIX_ROLES.map(rId => {
                          const role = localRoles.find(x => x.id === rId);
                          const val = role ? role.limits[key] : false;
                          return (
                            <td key={rId} className="py-1 px-2 text-center align-middle">
                              <button
                                onClick={() => updateLimit(rId, key, !val)}
                                className="w-full flex justify-center items-center rounded-lg py-1.5 hover:bg-secondary/70 active:scale-95 transition-all"
                                title={val ? "Desactivar" : "Activar"}
                              >
                                <LimitYN yes={val} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Menu preview */}
            <div className="rounded-card border border-border bg-card shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-sm">Vista previa del menú por rol</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Lo que ve cada rol en la barra lateral</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rol</span>
                  <select
                    value={menuRole}
                    onChange={e => setMenuRole(e.target.value as MatrixRole)}
                    style={ROLE_SEL_STYLE}
                  >
                    {MATRIX_ROLES.map(rId => (
                      <option key={rId} value={rId}>{ROLE_MAP[rId].name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {NAV_ITEMS.map(({ label, icon: Icon, permKey }) => {
                    const role = localRoles.find(r => r.id === menuRole);
                    const visible = role ? role.permissions[permKey] !== "none" : false;
                    return (
                      <span
                        key={label}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs transition-all ${
                          visible
                            ? "bg-secondary opacity-100"
                            : "bg-secondary opacity-25 line-through decoration-muted-foreground"
                        }`}
                      >
                        <Icon className="size-3.5 shrink-0" />{label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── Organización ──────────────────────────────────────────────── */}
        {tab === "org" && (
          <div className="flex flex-col gap-4">

            {/* Row 1: info + edit */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Active org */}
              <div className="rounded-card border border-border bg-card shadow-card p-5 flex flex-col gap-4">
                <div>
                  <h2 className="font-semibold text-sm">Organización activa</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Contexto multi-tenant</p>
                </div>
                <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-xl">
                  <div
                    className="size-10 rounded-xl flex items-center justify-center shrink-0 text-lg font-semibold text-white"
                    style={{ background: "var(--brand-coral, #ED5650)", fontFamily: "var(--font-display, inherit)" }}
                  >
                    {(organization?.nombre?.[0] ?? "O").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{organization?.nombre ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {employees.length} trabajadores · {areas.length} áreas · plan {organization?.plan ?? "—"}
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[11px] font-medium whitespace-nowrap"
                    style={{ background: "color-mix(in srgb, #1F8A5B 14%, transparent)", color: "#1F8A5B" }}
                  >
                    <span className="size-1.5 rounded-full bg-[#1F8A5B]" />
                    Activa
                  </span>
                </div>
                {organizations.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Cambiar de organización
                    </label>
                    <select
                      value={organization?.id ?? ""}
                      onChange={e => switchOrg(e.target.value)}
                      className="w-full rounded-pill border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {organizations.map(o => (
                        <option key={o.id} value={o.id}>{o.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Edit org */}
              <div className="rounded-card border border-border bg-card shadow-card p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <PencilLine className="size-4 text-muted-foreground" />
                  <div>
                    <h2 className="font-semibold text-sm">Editar organización</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Nombre y plan de facturación</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nombre</label>
                    <input
                      value={editOrgNombre || organization?.nombre || ""}
                      onChange={e => setEditOrgNombre(e.target.value)}
                      placeholder="Nombre de la organización"
                      className="w-full rounded-pill border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Plan</label>
                    <select
                      value={editOrgPlan}
                      onChange={e => setEditOrgPlan(e.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-pill border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    >
                      <option value="free">Free</option>
                      <option value="starter">Starter</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                </div>
                {orgSaveError && <p className="text-xs text-destructive">{orgSaveError}</p>}
                {orgSaveSuccess && (
                  <p className="text-xs" style={{ color: "#1F8A5B" }}>Cambios guardados correctamente.</p>
                )}
                {isAdmin && (
                  <button
                    onClick={handleSaveOrg}
                    disabled={orgSaving || !(editOrgNombre.trim() || organization?.nombre)}
                    className="inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-opacity"
                    style={{ background: "var(--brand-coral, #ED5650)" }}
                  >
                    <Check className="size-4" />
                    {orgSaving ? "Guardando…" : "Guardar cambios"}
                  </button>
                )}
              </div>

            </div>

            {/* Row 2: Members */}
            <div className="rounded-card border border-border bg-card shadow-card p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  <div>
                    <h2 className="font-semibold text-sm">Miembros</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Usuarios con acceso a esta organización</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{orgMembers.length} miembro{orgMembers.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Member list */}
              {membersLoading ? (
                <div className="text-xs text-muted-foreground text-center py-4">Cargando miembros…</div>
              ) : orgMembers.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">No hay miembros registrados.</div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                  {orgMembers.map(m => (
                    <div key={m.userId} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors">
                      <div
                        className="size-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold text-white"
                        style={{ background: "var(--brand-coral, #ED5650)" }}
                      >
                        {initials(m.fullName || m.email)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{m.fullName || "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                      </div>
                      {isAdmin && m.userId !== user?.id && (
                        <button
                          onClick={() => handleRemoveMember(m.userId)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Quitar miembro"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add member */}
              {isAdmin && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Agregar miembro por correo
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={addMemberEmail}
                      onChange={e => { setAddMemberEmail(e.target.value); setAddMemberError(null); }}
                      onKeyDown={e => e.key === "Enter" && handleAddMember()}
                      placeholder="correo@ejemplo.com"
                      className="flex-1 rounded-pill border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      onClick={handleAddMember}
                      disabled={addMemberLoading || !addMemberEmail.trim()}
                      className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-opacity shrink-0"
                      style={{ background: "var(--brand-coral, #ED5650)" }}
                    >
                      <UserPlus className="size-3.5" />
                      {addMemberLoading ? "Agregando…" : "Agregar"}
                    </button>
                  </div>
                  {addMemberError && <p className="text-xs text-destructive">{addMemberError}</p>}
                </div>
              )}
            </div>

            {/* Row 3: Create new org */}
            {isAdmin && (
              <div className="rounded-card border border-border bg-card shadow-card p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Plus className="size-4 text-muted-foreground" />
                  <div>
                    <h2 className="font-semibold text-sm">Nueva organización</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Crea un espacio independiente con su propio equipo y datos</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nombre</label>
                    <input
                      value={newOrgNombre}
                      onChange={e => { setNewOrgNombre(e.target.value); setCreateOrgError(null); }}
                      placeholder="Ej: Mi Empresa S.A."
                      className="w-full rounded-pill border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Plan</label>
                    <select
                      value={newOrgPlan}
                      onChange={e => setNewOrgPlan(e.target.value)}
                      className="w-full rounded-pill border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="free">Free</option>
                      <option value="starter">Starter</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                </div>
                {createOrgError && <p className="text-xs text-destructive">{createOrgError}</p>}
                {createOrgSuccess && (
                  <p className="text-xs" style={{ color: "#1F8A5B" }}>Organización creada. Recargando…</p>
                )}
                <button
                  onClick={handleCreateOrg}
                  disabled={createOrgLoading || !newOrgNombre.trim()}
                  className="self-start inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-opacity"
                  style={{ background: "var(--brand-coral, #ED5650)" }}
                >
                  <Plus className="size-4" />
                  {createOrgLoading ? "Creando…" : "Crear organización"}
                </button>
              </div>
            )}

            {/* Row 4: Maintenance */}
            <div className="rounded-card border border-border bg-card shadow-card p-5 flex flex-col gap-3">
              <div>
                <h2 className="font-semibold text-sm">Datos y mantenimiento</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Solo administradores</p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="inline-flex items-center gap-2 rounded-pill border border-destructive/40 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className={`size-4 ${resetting ? "animate-spin" : ""}`} />
                  {resetting ? "Borrando…" : "Restablecer datos de la organización"}
                </button>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ── Create user modal ────────────────────────────────────────────── */}
      {createUserOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setCreateUserOpen(false)}
        >
          <div
            className="bg-card rounded-card shadow-card max-w-sm w-full p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <UserPlus className="size-5 text-primary" />
              <h3 className="font-semibold">Nuevo usuario</h3>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nombre completo</label>
                <input
                  type="text"
                  value={createUserForm.fullName}
                  onChange={e => setCreateUserForm(f => ({ ...f, fullName: e.target.value }))}
                  placeholder="Nombre del usuario"
                  className="w-full rounded-pill border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Correo electrónico</label>
                <input
                  type="email"
                  value={createUserForm.email}
                  onChange={e => setCreateUserForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="usuario@empresa.com"
                  className="w-full rounded-pill border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contraseña</label>
                <input
                  type="password"
                  value={createUserForm.password}
                  onChange={e => setCreateUserForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-pill border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rol</label>
                  <select
                    value={createUserForm.roleId}
                    onChange={e => setCreateUserForm(f => ({ ...f, roleId: e.target.value }))}
                    className="w-full rounded-pill border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Sin rol asignado</option>
                    {Object.entries(ROLE_MAP).map(([id, r]) => (
                      <option key={id} value={id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Área</label>
                  <select
                    value={createUserForm.areaId}
                    onChange={e => setCreateUserForm(f => ({ ...f, areaId: e.target.value }))}
                    className="w-full rounded-pill border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Todas las áreas</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {createUserError && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {createUserError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setCreateUserOpen(false)}
                className="text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateUser}
                disabled={createUserLoading}
                className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {createUserLoading ? "Creando…" : "Crear usuario"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Password reset modal ─────────────────────────────────────────── */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={closeResetModal}
        >
          <div
            className="bg-card rounded-card shadow-card max-w-sm w-full p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <Key className="size-5 text-primary" />
              <h3 className="font-semibold">Restablecer contraseña</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Nueva contraseña para <strong>{resetTarget.fullName || resetTarget.email}</strong>.
            </p>
            <input
              type="password"
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
              placeholder="Nueva contraseña (mín. 8 caracteres)"
              className="w-full rounded-pill border border-border bg-card px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
            {passError && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive mb-3">
                {passError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={closeResetModal}
                className="text-sm px-3 py-2 rounded-pill border border-border hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetPassword}
                disabled={passLoading || newPass.length < 8}
                className="text-sm px-4 py-2 rounded-pill bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {passLoading ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
