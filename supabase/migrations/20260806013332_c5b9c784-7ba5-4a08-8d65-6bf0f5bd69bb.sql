-- 1) Cegah eskalasi hak akses: pengguna biasa tidak boleh mengubah kolom sensitif pada profilnya sendiri.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, email, updated_at) ON public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Tidak diizinkan mengubah toko pada profil.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Tidak diizinkan mengubah identitas profil.';
  END IF;

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
$function$;

-- 2) Kolom logo & QRIS untuk struk toko.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS receipt_logo_url text,
  ADD COLUMN IF NOT EXISTS receipt_qris_url text;