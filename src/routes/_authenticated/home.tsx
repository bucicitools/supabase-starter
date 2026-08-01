import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Calculator,
  Info,
  Lock,
  ShoppingCart,
  Sparkles,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { greeting, rupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Beranda — BUCICI" },
      { name: "description", content: "Ringkasan penjualan dan pintasan alat usaha harian." },
      { property: "og:title", content: "Beranda — BUCICI" },
      { property: "og:description", content: "Ringkasan penjualan dan pintasan alat usaha harian." },
    ],
  }),
  component: HomePage,
});

const TOOLS = [
  { key: "kasir", to: "/kasir", label: "Kasir", desc: "Transaksi & struk", icon: ShoppingCart },
  { key: "modal", to: "/modal", label: "Modal & Kas", desc: "Kas masuk/keluar", icon: Wallet },
  { key: "stok", to: "/stok", label: "Stok", desc: "Barang & bahan", icon: Boxes },
  { key: "hpp", to: "/hpp", label: "Hitung HPP", desc: "Modal per produk", icon: Calculator },
  { key: "prompt", to: "/prompt", label: "Kreasi Prompt", desc: "Konten promosi", icon: Sparkles },
  { key: "info", to: "/info", label: "Info", desc: "Kabar & panduan", icon: Info },
] as const;

function HomePage() {
  const { profile, tenant, role, can, flagFor } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["home-stats", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [{ data: txs }, { data: prods }] = await Promise.all([
        supabase
          .from("transactions")
          .select("total,status")
          .eq("tenant_id", tenant!.id)
          .gte("created_at", start.toISOString()),
        supabase.from("products").select("stock,low_stock_threshold").eq("tenant_id", tenant!.id),
      ]);
      const paid = (txs ?? []).filter((t) => t.status === "paid");
      const debt = (txs ?? []).filter((t) => t.status === "unpaid");
      return {
        omzet: paid.reduce((s, t) => s + Number(t.total), 0),
        count: paid.length,
        debt: debt.reduce((s, t) => s + Number(t.total), 0),
        low: (prods ?? []).filter((p) => Number(p.stock) <= Number(p.low_stock_threshold ?? 0)).length,
      };
    },
  });

  const allowedTool = role === "member" ? profile?.allowed_tool : null;

  const tools = TOOLS.filter((t) => {
    const flag = flagFor(t.key);
    if (flag?.is_hidden) return false;
    if (role === "member") {
      if (t.key === "info") return true;
      if (allowedTool && allowedTool !== t.key) return false;
      return can(t.key);
    }
    return true;
  });

  return (
    <AppShell title={`Selamat ${greeting()}, ${profile?.full_name?.split(" ")[0] ?? "Sobat"}`}>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Omzet hari ini" value={rupiah(stats?.omzet ?? 0)} tone="brand" />
        <StatCard label="Transaksi" value={String(stats?.count ?? 0)} />
        <StatCard label="Piutang hari ini" value={rupiah(stats?.debt ?? 0)} />
        <StatCard label="Stok menipis" value={`${stats?.low ?? 0} item`} />
      </section>

      <h2 className="mb-3 mt-7 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Alat Usaha
      </h2>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tools.map((t) => {
          const flag = flagFor(t.key);
          const locked = !!flag?.is_locked;
          const Icon = t.icon;
          const body = (
            <div
              className={`relative flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all ${
                locked ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-brand"
              }`}
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                {locked ? <Lock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </span>
              <p className="font-semibold leading-tight">{t.label}</p>
              <p className="text-xs text-muted-foreground">{locked ? flag?.note ?? "Sedang dikunci" : t.desc}</p>
            </div>
          );
          return locked ? (
            <div key={t.key}>{body}</div>
          ) : (
            <Link key={t.key} to={t.to}>
              {body}
            </Link>
          );
        })}
      </section>

      <div className="mt-7 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <p className="text-sm text-muted-foreground">
          Toko aktif: <span className="font-semibold text-foreground">{tenant?.business_name ?? "—"}</span>
          {tenant?.is_demo && " (mode demo)"}
        </p>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "brand" }) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-soft ${
        tone === "brand"
          ? "brand-gradient text-primary-foreground"
          : "border border-border bg-card text-foreground"
      }`}
    >
      <p className={`text-xs ${tone === "brand" ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p className="mt-1 text-lg font-bold leading-tight">{value}</p>
    </div>
  );
}