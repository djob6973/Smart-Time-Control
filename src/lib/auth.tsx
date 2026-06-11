import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { hasPermission } from "./permissions";
import type { RoleName, Resource, Action, AccessLimits } from "./permissions";
import { DEFAULT_LIMITS, DEFAULT_LIMITS_BY_ROLE } from "./permissions";

const ORG_KEY = "wfm_current_org_id";
const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

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
  config?: Record<string, unknown>;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  organization: Organization | null;
  currentOrg: Organization | null;
  organizations: Organization[];
  role: RoleName | null;
  limits: AccessLimits | null;
  loading: boolean;
  roleLoading: boolean;
  isPending: boolean;
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, nombre: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  switchOrg: (orgId: string) => void;
  hasPermission: (resource: Resource, action: Action) => boolean;
  hasLimit: (key: keyof AccessLimits) => boolean;
  reloadRole: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (newPassword: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, session: null, profile: null, organization: null, currentOrg: null,
  organizations: [], role: null, limits: null, loading: true, roleLoading: false, isPending: false, isPasswordRecovery: false,
  signIn: async () => ({}), signUp: async () => ({}), signInWithGoogle: async () => ({}),
  signOut: async () => {}, switchOrg: () => {}, hasPermission: () => false, hasLimit: () => false,
  reloadRole: async () => {}, requestPasswordReset: async () => null, updatePassword: async () => null,
});

async function fetchUserData(userId: string) {
  const [roleRes, orgsRes] = await Promise.all([
    supabase
      .from("user_roles")
      .select("roles(nombre, permisos)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("user_organizations")
      .select("organizations(*)")
      .eq("user_id", userId)
      .eq("activo", true),
  ]);

  const roleData = roleRes.data?.roles as unknown as { nombre: string; permisos: Record<string, any> } | null;
  const role = roleData?.nombre as RoleName | null ?? null;
  const rawPerms = roleData?.permisos ?? null;

  // Separate limits from the resource-level permissions map
  const limitsFromDb = rawPerms?._limits as Partial<AccessLimits> | undefined;
  const limits: AccessLimits | null = role
    ? { ...(DEFAULT_LIMITS_BY_ROLE[role] ?? DEFAULT_LIMITS), ...(limitsFromDb ?? {}) }
    : null;

  // rolePerms only contains resource → actions entries (strip _limits)
  const rolePerms: Record<string, string[]> | null = rawPerms
    ? Object.fromEntries(Object.entries(rawPerms).filter(([k]) => k !== "_limits")) as Record<string, string[]>
    : null;

  const organizations: Organization[] = (orgsRes.data ?? [])
    .map((r) => r.organizations as unknown as Organization)
    .filter(Boolean);

  return { role, rolePerms, limits, organizations };
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("user_profiles")
    .select("id, full_name, nombre, email, is_active, activo, area_id, employee_id")
    .eq("id", userId)
    .maybeSingle();

  if (!data) return null;
  const fullName = data.full_name ?? data.nombre ?? "";
  const isActive = data.is_active ?? data.activo ?? false;
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
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<RoleName | null>(null);
  const [rolePerms, setRolePerms] = useState<Record<string, string[]> | null>(null);
  const [limits, setLimits] = useState<AccessLimits | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
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
        const { role: r, rolePerms: rp, limits: lm, organizations: orgs } = await fetchUserData(userId);
        setRole(r);
        setRolePerms(rp);
        setLimits(lm);
        setOrganizations(orgs);
        setOrganization(resolveOrg(orgs));
        fetchProfile(userId)
          .then(setProfile)
          .catch(() => {});
      } catch {
        // user queda en isPending
      } finally {
        setRoleLoading(false);
      }
    },
    [resolveOrg],
  );

  const clearData = useCallback(() => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setRolePerms(null);
    setLimits(null);
    setOrganizations([]);
    setOrganization(null);
    setRoleLoading(false);
    setIsPasswordRecovery(false);
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        setUser(sess?.user ?? null);
        setSession(sess);
        setLoading(false);
        return;
      }

      if (event === "USER_UPDATED" && sess) {
        setIsPasswordRecovery(false);
        setSession(sess);
        setUser(sess.user);
        setLoading(false);
        loadData(sess.user.id);
        return;
      }

      setIsPasswordRecovery(false);
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);

      if (sess?.user) {
        loadData(sess.user.id);
      } else {
        clearData();
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadData, clearData]);

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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  }, []);

  const signUp = useCallback(async (email: string, password: string, nombre: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nombre },
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });
    return error ? { error: error.message } : {};
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });
    return error ? { error: error.message } : {};
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(ORG_KEY);
    await supabase.auth.signOut();
  }, []);

  const reloadRole = useCallback(async () => {
    if (!user) return;
    await loadData(user.id);
  }, [user, loadData]);

  const requestPasswordReset = useCallback(async (email: string): Promise<string | null> => {
    const redirectTo =
      typeof window !== "undefined" ? window.location.origin : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      if (error.status === 429 || error.message.toLowerCase().includes("rate limit")) {
        return "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
      }
      return "No se pudo enviar el correo. Verifica la dirección e inténtalo de nuevo.";
    }
    return null;
  }, []);

  const updatePassword = useCallback(async (newPassword: string): Promise<string | null> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("expired") || msg.includes("invalid") || msg.includes("session")) {
        return "El enlace de recuperación ha expirado o ya fue utilizado. Solicita uno nuevo.";
      }
      return "No se pudo actualizar la contraseña. Inténtalo de nuevo.";
    }
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
        return (rolePerms[resource] as Action[] | undefined)?.includes(action) ?? false;
      }
      return hasPermission(role, resource, action);
    },
    [role, rolePerms],
  );

  return (
    <AuthContext.Provider
      value={{
        user, session, profile, organization, currentOrg: organization,
        organizations, role, limits, loading, roleLoading, isPending, isPasswordRecovery,
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
