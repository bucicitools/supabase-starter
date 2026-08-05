import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RegisterInput = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(6).max(72),
  licenseCode: z.string().trim().max(60).optional().nullable(),
  businessName: z.string().trim().min(2).max(80),
});

export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RegisterInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    const isFirst = (count ?? 0) === 0;

    let license: { id: string; code: string } | null = null;
    if (!isFirst) {
      const code = (data.licenseCode ?? "").trim().toUpperCase();
      if (!code) return { ok: false as const, error: "Kode lisensi wajib diisi." };
      const { data: lic } = await supabaseAdmin
        .from("licenses")
        .select("id, code, used_by")
        .eq("code", code)
        .maybeSingle();
      if (!lic) return { ok: false as const, error: "Kode lisensi tidak ditemukan." };
      if (lic.used_by) return { ok: false as const, error: "Kode lisensi sudah dipakai." };
      license = { id: lic.id, code: lic.code };
    }

    const { data: created, error: signErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (signErr || !created.user) {
      return { ok: false as const, error: signErr?.message ?? "Gagal membuat akun." };
    }
    const uid = created.user.id;

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        business_name: data.businessName,
        owner_name: data.fullName,
        owner_id: uid,
        license_code: license?.code ?? null,
        receipt_header: data.businessName,
      })
      .select("id")
      .single();
    if (tErr || !tenant) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      return { ok: false as const, error: "Gagal membuat toko." };
    }

    await supabaseAdmin.from("profiles").insert({
      id: uid,
      email: data.email,
      full_name: data.fullName,
      tenant_id: isFirst ? null : tenant.id,
    });
    await supabaseAdmin.from("user_roles").insert({
      user_id: uid,
      role: isFirst ? "super_admin" : "owner",
    });
    if (license) {
      await supabaseAdmin
        .from("licenses")
        .update({ used_by: tenant.id, used_at: new Date().toISOString() })
        .eq("id", license.id);
    }
    if (isFirst) {
      await supabaseAdmin.from("tenants").update({ is_demo: true, business_name: "Toko Demo BUCICI" }).eq("id", tenant.id);
    }

    return { ok: true as const, superAdmin: isFirst };
  });

const MemberInput = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(6).max(72),
  tenantRoleId: z.string().uuid().nullable(),
  allowedTools: z.array(z.string().max(30)).max(20).default(["kasir"]),
});

export const createMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MemberInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me?.tenant_id) return { ok: false as const, error: "Toko tidak ditemukan." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) return { ok: false as const, error: error?.message ?? "Gagal membuat anggota." };

    await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      email: data.email,
      full_name: data.fullName,
      tenant_id: me.tenant_id,
      tenant_role_id: data.tenantRoleId,
      allowed_tools: data.allowedTools,
    });
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "member" });
    return { ok: true as const };
  });

const AccessInput = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(80),
  allowedTools: z.array(z.string().max(30)).max(20),
});

export const updateMemberAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AccessInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) {
      return { ok: false as const, error: "Tidak bisa mengubah hak akses sendiri." };
    }
    const { data: me } = await context.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me?.tenant_id) return { ok: false as const, error: "Toko tidak ditemukan." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (target?.tenant_id !== me.tenant_id) return { ok: false as const, error: "Tidak diizinkan." };

    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if ((targetRoles ?? []).some((r) => r.role === "owner" || r.role === "super_admin")) {
      return { ok: false as const, error: "Hak akses pemilik toko tidak dapat diubah." };
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName, allowed_tools: data.allowedTools })
      .eq("id", data.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const deleteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", context.userId)
      .maybeSingle();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (!me?.tenant_id || target?.tenant_id !== me.tenant_id) {
      return { ok: false as const, error: "Tidak diizinkan." };
    }
    await supabaseAdmin.auth.admin.deleteUser(data.userId);
    return { ok: true as const };
  });

export const toggleDemoTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isSA } = await context.supabase.rpc("is_super_admin");
    if (!isSA) return { ok: false as const, error: "Hanya super admin." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.enabled) {
      await supabaseAdmin.from("profiles").update({ tenant_id: null }).eq("id", context.userId);
      return { ok: true as const };
    }
    let { data: demo } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("owner_id", context.userId)
      .eq("is_demo", true)
      .maybeSingle();
    if (!demo) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", context.userId)
        .maybeSingle();
      const { data: fresh } = await supabaseAdmin
        .from("tenants")
        .insert({
          business_name: "Toko Demo BUCICI",
          owner_name: profile?.full_name ?? "Super Admin",
          owner_id: context.userId,
          is_demo: true,
          receipt_header: "Toko Demo BUCICI",
        })
        .select("id")
        .single();
      demo = fresh;
    }
    await supabaseAdmin.from("profiles").update({ tenant_id: demo!.id }).eq("id", context.userId);
    return { ok: true as const };
  });

export const wipeFinancialData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: me } = await context.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me?.tenant_id) return { ok: false as const, error: "Toko tidak ditemukan." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("transaction_items").delete().eq("tenant_id", me.tenant_id);
    await supabaseAdmin.from("transactions").delete().eq("tenant_id", me.tenant_id);
    await supabaseAdmin.from("cash_entries").delete().eq("tenant_id", me.tenant_id);
    return { ok: true as const };
  });