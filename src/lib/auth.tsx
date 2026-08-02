import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "owner" | "member";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  tenant_id: string | null;
  tenant_role_id: string | null;
  allowed_tool: string | null;
  allowed_tools: string[] | null;
};

export type Tenant = {
  id: string;
  business_name: string;
  owner_name: string;
  owner_id: string | null;
  license_code: string | null;
  is_active: boolean;
  is_demo: boolean;
  default_tax: number;
  receipt_header: string | null;
  receipt_address: string | null;
  receipt_phone: string | null;
  receipt_extra: string | null;
  receipt_footer: string | null;
};

export type FeatureFlag = {
  feature_key: string;
  is_locked: boolean;
  is_hidden: boolean;
  note: string | null;
};

type AuthValue = {
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  tenant: Tenant | null;
  role: AppRole | null;
  permissions: string[];
  flags: FeatureFlag[];
  can: (perm: string) => boolean;
  flagFor: (key: string) => FeatureFlag | undefined;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);

  const load = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      setTenant(null);
      setRole(null);
      setPermissions([]);
      setLoading(false);
      return;
    }
    const [{ data: p }, { data: roles }, { data: ff }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", u.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.id),
      supabase.from("feature_flags").select("feature_key,is_locked,is_hidden,note"),
    ]);
    setFlags((ff ?? []) as FeatureFlag[]);
    const rs = (roles ?? []).map((r) => r.role as AppRole);
    const resolved: AppRole | null = rs.includes("super_admin")
      ? "super_admin"
      : rs.includes("owner")
        ? "owner"
        : rs.includes("member")
          ? "member"
          : null;
    setRole(resolved);
    setProfile((p as Profile) ?? null);

    if (p?.tenant_id) {
      const { data: t } = await supabase.from("tenants").select("*").eq("id", p.tenant_id).maybeSingle();
      setTenant((t as Tenant) ?? null);
    } else {
      setTenant(null);
    }

    if (resolved === "member" && p?.tenant_role_id) {
      const { data: tr } = await supabase
        .from("tenant_roles")
        .select("permissions")
        .eq("id", p.tenant_role_id)
        .maybeSingle();
      setPermissions((tr?.permissions as string[]) ?? []);
    } else {
      setPermissions(["*"]);
    }
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data.user ?? null);
    await load(data.user ?? null);
  }, [load]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      void load(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setUser(session?.user ?? null);
      void load(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("feature-flags-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "feature_flags" }, async () => {
        const { data } = await supabase.from("feature_flags").select("feature_key,is_locked,is_hidden,note");
        setFlags((data ?? []) as FeatureFlag[]);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user]);

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      user,
      profile,
      tenant,
      role,
      permissions,
      flags,
      can: (perm) => permissions.includes("*") || permissions.includes(perm),
      flagFor: (key) => flags.find((f) => f.feature_key === key),
      refresh,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, user, profile, tenant, role, permissions, flags, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}