CREATE TYPE public.app_role AS ENUM ('super_admin','owner','member');
CREATE TYPE public.tx_status AS ENUM ('paid','unpaid','void');
CREATE TYPE public.cash_type AS ENUM ('fill','in','out');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  owner_name text NOT NULL,
  owner_id uuid,
  license_code text,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  default_tax numeric NOT NULL DEFAULT 0,
  receipt_header text,
  receipt_address text,
  receipt_phone text,
  receipt_extra text,
  receipt_footer text DEFAULT 'Terima kasih sudah berbelanja',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  full_name text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_role_id uuid,
  allowed_tool text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.current_tenant()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE TABLE public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  batch text,
  used_by uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;
GRANT ALL ON public.licenses TO service_role;

CREATE TABLE public.tenant_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_roles TO authenticated;
GRANT ALL ON public.tenant_roles TO service_role;

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  stock numeric NOT NULL DEFAULT 0,
  cost numeric,
  sku text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  image_url text,
  low_stock_threshold numeric NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  customer_name text,
  note text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_value numeric NOT NULL DEFAULT 0,
  discount_is_percent boolean NOT NULL DEFAULT false,
  discount_amount numeric NOT NULL DEFAULT 0,
  tax_percent numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  change_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  status public.tx_status NOT NULL DEFAULT 'paid',
  due_date date,
  debt_note text,
  void_note text,
  cashier_id uuid,
  cashier_name text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;

CREATE TABLE public.transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid,
  name text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  cost numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_items TO authenticated;
GRANT ALL ON public.transaction_items TO service_role;

CREATE TABLE public.cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type public.cash_type NOT NULL,
  amount numeric NOT NULL,
  note text,
  is_reset boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_entries TO authenticated;
GRANT ALL ON public.cash_entries TO service_role;

CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'bahan',
  unit text NOT NULL DEFAULT 'pcs',
  qty numeric NOT NULL DEFAULT 0,
  min_qty numeric NOT NULL DEFAULT 0,
  unit_cost numeric,
  supplier text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  direction text NOT NULL,
  qty numeric NOT NULL,
  note text,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

CREATE TABLE public.hpp_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_id uuid,
  yield_qty numeric NOT NULL DEFAULT 1,
  ingredients jsonb NOT NULL DEFAULT '[]',
  overhead numeric NOT NULL DEFAULT 0,
  labor numeric NOT NULL DEFAULT 0,
  hpp numeric NOT NULL DEFAULT 0,
  suggested_price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hpp_recipes TO authenticated;
GRANT ALL ON public.hpp_recipes TO service_role;

CREATE TABLE public.info_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.info_posts TO authenticated;
GRANT ALL ON public.info_posts TO service_role;

CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  is_locked boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;

CREATE TRIGGER t_tenants_upd BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_products_upd BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_tx_upd BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_stock_upd BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_hpp_upd BEFORE UPDATE ON public.hpp_recipes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_info_upd BEFORE UPDATE ON public.info_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_roles_upd BEFORE UPDATE ON public.tenant_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hpp_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR tenant_id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_super_admin());
CREATE POLICY "profiles update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR tenant_id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "profiles delete" ON public.profiles FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant() OR public.is_super_admin());

CREATE POLICY "user_roles read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "tenants read" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "tenants update" ON public.tenants FOR UPDATE TO authenticated
  USING (id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "tenants sa delete" ON public.tenants FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "licenses sa all" ON public.licenses FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "info read" ON public.info_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "info sa write" ON public.info_posts FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "flags read" ON public.feature_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY "flags sa write" ON public.feature_flags FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "tenant_roles scope" ON public.tenant_roles FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "categories scope" ON public.categories FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "products scope" ON public.products FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "transactions scope" ON public.transactions FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "tx_items scope" ON public.transaction_items FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "cash scope" ON public.cash_entries FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "stock scope" ON public.stock_items FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "stockmv scope" ON public.stock_movements FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant() OR public.is_super_admin());
CREATE POLICY "hpp scope" ON public.hpp_recipes FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant() OR public.is_super_admin());

INSERT INTO public.feature_flags (feature_key, is_locked, is_hidden, note) VALUES
  ('kasir', false, false, NULL),
  ('prompt', false, false, NULL),
  ('stok', false, false, NULL),
  ('modal', false, false, NULL),
  ('info', false, false, NULL);