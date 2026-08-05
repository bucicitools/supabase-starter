CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  -- Trusted server (service role) has no auth context: allow.
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Super admin: full control.
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Nobody except super admin may move a profile between tenants.
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Tidak diizinkan mengubah toko pada profil.';
  END IF;

  -- Role changes: only a tenant owner, only for other members of the same tenant.
  IF NEW.tenant_role_id IS DISTINCT FROM OLD.tenant_role_id
     OR NEW.allowed_tools IS DISTINCT FROM OLD.allowed_tools
     OR NEW.allowed_tool IS DISTINCT FROM OLD.allowed_tool THEN
    IF OLD.id = uid THEN
      RAISE EXCEPTION 'Tidak diizinkan mengubah hak akses sendiri.';
    END IF;
    IF NOT public.has_role(uid, 'owner') OR OLD.tenant_id IS DISTINCT FROM public.current_tenant() THEN
      RAISE EXCEPTION 'Hanya pemilik toko yang dapat mengubah hak akses anggota.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_profiles_guard ON public.profiles;
CREATE TRIGGER t_profiles_guard
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

DROP POLICY IF EXISTS "profiles update" ON public.profiles;
CREATE POLICY "profiles update" ON public.profiles
FOR UPDATE TO authenticated
USING ((id = auth.uid()) OR (tenant_id = public.current_tenant()) OR public.is_super_admin())
WITH CHECK ((id = auth.uid()) OR (tenant_id = public.current_tenant()) OR public.is_super_admin());