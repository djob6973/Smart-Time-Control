import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { hasPermission } from "./permissions";
import type { RoleName, Resource, Action, AccessLimits } from "./permissions";
import { DEFAULT_LIMITS_BY_ROLE, DEFAULT_LIMITS } from "./permissions";
import { getUserRolesAndOrgs, getUserProfile } from "./api/user-profile";

const ORG_KEY = "wfm_current_org_id";

export interface AuthUser {
  id: string;
  email: string;
  nombre: string;
}

export interface Profile {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  areaId: string | null;
  fullName: string;
  isActive: boolean;
  employeeId: string | null;
}

export interface Organization {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  plan: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: Record<string, any>;
}

export interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  organization: Organization | null;
  currentOrg: Organization | null;
  organizations: Organization[];
  role: RoleName | null;
  limits: AccessLimits | null;
  loading: boolean;
  roleLoading: boolean;
  isPending: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, nombre: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  switchOrg: (orgId: string) => void;
  hasPermission: (resource: Resource, action: Action) => boolean;
  hasLimit: (key: keyof AccessLimits) => boolean;
  reloadRole: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null; resetUrl?: string | null }>;
  updatePassword: (newPassword: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, profile: null, organization: null, currentOrg: null,
  organizations: [], role: null, limits: null, loading: true, roleLoading: false,
  isPending: false,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signInWithGoogle: async () => ({}),
  signOut: async () => {},
  switchOrg: () => {},
  hasPermission: () => false,
  hasLimit: () => false,
  reloadRole: async () => {},
  requestPasswordReset: async () => ({ error: null }),
  updatePassword: async () => null,
});

async function fetchUserData(userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getUserRolesAndOrgs({ data: { userId } }) as any;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await getUserProfile({ data: { userId } }) as any;
  if (!data) return null;
  const fullName = data.nombre ?? data.full_name ?? "";
  const isActive = data.activo ?? data.is_active ?? false;
  return {
    id: data.id,
    nombre: fullName,
    email: data.email,
    activo: isActive,
    areaId: data.area_id ?? null,
    fullName,
    isActive,
    employeeId: data.employee_id ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<RoleName | null>(null);
  const [rolePerms, setRolePerms] = useState<Record<string, string[]> | null>(null);
  const [limits, setLimits] = useState<AccessLimits | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);

  const isPending = !loading && !roleLoading && user !== null && role === null;

  const resolveOrg = useCallback((orgs: Organization[]) => {
    if (!orgs.length) return null;
    const storedId =
      typeof window !== "undefined" ? localStorage.getItem(ORG_KEY) : null;
    return (storedId && orgs.find((o) => o.id === storedId && o.activo)) || orgs[0];
  }, []);

  const loadData = useCallback(
    async (userId: string) => {
      setRoleLoading(true);
      try {
        const { role: r, rolePerms: rp, limits: lm, organizations: orgs } =
          await fetchUserData(userId);
        setRole(r);
        setRolePerms(rp);
        setLimits(lm);
        setOrganizations(orgs as Organization[]);
        setOrganization(resolveOrg(orgs as Organization[]));
        fetchProfile(userId).then(setProfile).catch(() => {});
      } catch {
        // user stays in isPending state
      } finally {
        setRoleLoading(false);
      }
    },
    [resolveOrg],
  );

  const clearData = useCallback(() => {
    setUser(null);
    setProfile(null);
    setRole(null);
    setRolePerms(null);
    setLimits(null);
    setOrganizations([]);
    setOrganization(null);
    setRoleLoading(false);
  }, []);

  // Initialize session on mount by checking the session cookie via /api/auth/me
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          loadData(data.user.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadData]);

  const switchOrg = useCallback(
    (orgId: string) => {
      const org = organizations.find((o) => o.id === orgId) ?? null;
      if (org) {
        localStorage.setItem(ORG_KEY, orgId);
        setOrganization(org);
      }
    },
    [organizations],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error ?? "Error al iniciar sesión" };
    setUser(data);
    loadData(data.id);
    return {};
  }, [loadData]);

  const signUp = useCallback(async (email: string, password: string, nombre: string) => {
    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, nombre }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error ?? "Error al registrar usuario" };
    setUser(data);
    loadData(data.id);
    return {};
  }, [loadData]);

  // Google SSO is handled at the nginx perimeter on Dokku; no client-side OAuth flow
  const signInWithGoogle = useCallback(async () => {
    return { error: "El acceso con Google está gestionado por el sistema de autenticación externo." };
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    localStorage.removeItem(ORG_KEY);
    clearData();
  }, [clearData]);

  const reloadRole = useCallback(async () => {
    if (!user) return;
    await loadData(user.id);
  }, [user, loadData]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const r = await fetch("/api/auth/reset-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error ?? "Error al procesar la solicitud" };
    return { error: null, resetUrl: data.resetUrl ?? null };
  }, []);

  const updatePassword = useCallback(async (newPassword: string): Promise<string | null> => {
    const r = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    const data = await r.json();
    if (!r.ok) return data.error ?? "No se pudo actualizar la contraseña";
    return null;
  }, []);

  const checkLimit = useCallback(
    (key: keyof AccessLimits) => limits?.[key] ?? false,
    [limits],
  );

  const checkPermission = useCallback(
    (resource: Resource, action: Action) => {
      if (!role) return false;
      if (role === "admin") return true;
      if (rolePerms) {
        const perm = rolePerms[resource];
        if (!perm) return false;
        const LEVELS = ["none", "view", "edit", "full"];
        const permStr   = perm as unknown as string;
        const permIdx   = LEVELS.indexOf(permStr);
        const actionIdx = LEVELS.indexOf(action);
        if (permIdx > 0 && actionIdx > 0) return actionIdx <= permIdx;
        return Array.isArray(perm) && (perm as string[]).includes(action);
      }
      return hasPermission(role, resource, action);
    },
    [role, rolePerms],
  );

  return (
    <AuthContext.Provider
      value={{
        user, profile, organization, currentOrg: organization,
        organizations, role, limits, loading, roleLoading, isPending,
        signIn, signUp, signInWithGoogle, signOut, switchOrg,
        hasPermission: checkPermission, hasLimit: checkLimit, reloadRole,
        requestPasswordReset, updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Standalone function for the reset-password page (uses token from URL, no session required)
export async function resetPassword(token: string, newPassword: string): Promise<string | null> {
  const r = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  const data = await r.json();
  if (!r.ok) return data.error ?? "No se pudo actualizar la contraseña";
  return null;
}

// Re-export for backward compatibility with any code that imported DEFAULT_LIMITS_BY_ROLE from here
export { DEFAULT_LIMITS_BY_ROLE, DEFAULT_LIMITS };
