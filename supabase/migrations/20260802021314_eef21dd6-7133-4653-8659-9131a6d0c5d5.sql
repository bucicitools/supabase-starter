CREATE POLICY "product images tenant read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND ((storage.foldername(name))[1] = public.current_tenant()::text OR public.is_super_admin()));
CREATE POLICY "product images tenant insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND ((storage.foldername(name))[1] = public.current_tenant()::text OR public.is_super_admin()));
CREATE POLICY "product images tenant update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND ((storage.foldername(name))[1] = public.current_tenant()::text OR public.is_super_admin()));
CREATE POLICY "product images tenant delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND ((storage.foldername(name))[1] = public.current_tenant()::text OR public.is_super_admin()));