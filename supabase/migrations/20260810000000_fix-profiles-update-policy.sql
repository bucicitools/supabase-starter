-- ============================================================
-- Perbaikan keamanan: policy UPDATE pada tabel profiles
--
-- Masalah lama:
--   1. Satu policy "profiles update" mengizinkan siapa saja
--      (tenant_id = current_tenant()) mengubah profil anggota
--      lain, termasuk kolom privilege (tenant_role_id, allowed_tools).
--   2. Pengguna biasa (member) bisa mengubah profil sesama
--      anggota di tenant yang sama → privilege escalation.
--
-- Solusi:
--   Hapus policy lama, ganti dengan 3 policy terpisah yang
--   masing-masing hanya mengizinkan operasi yang tepat.
--   Trigger prevent_profile_privilege_escalation tetap aktif
--   sebagai lapisan pertahanan kedua.
-- ============================================================

-- Hapus policy lama yang terlalu lebar
DROP POLICY IF EXISTS "profiles update" ON public.profiles;

-- 1. User hanya bisa update barisnya sendiri
--    (misalnya: full_name, email — bukan kolom privilege)
--    Trigger akan menolak jika mencoba ubah tenant_role_id / allowed_tools milik sendiri.
CREATE POLICY "profiles update self"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 2. Pemilik toko (role = 'owner') dapat mengubah profil anggota
--    LAIN di tenant yang sama (bukan dirinya sendiri).
--    Hanya kolom non-sensitif; trigger memblokir perubahan
--    tenant_role_id / allowed_tools oleh non-owner.
CREATE POLICY "profiles update by owner"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id <> auth.uid()
    AND tenant_id = public.current_tenant()
    AND public.has_role(auth.uid(), 'owner')
  )
  WITH CHECK (
    id <> auth.uid()
    AND tenant_id = public.current_tenant()
    AND public.has_role(auth.uid(), 'owner')
  );

-- 3. Super admin bebas mengubah semua profil
CREATE POLICY "profiles update super admin"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
