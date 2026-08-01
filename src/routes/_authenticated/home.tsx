import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  Boxes,
  Building2,
  Calculator,
  CreditCard,
  Info,
  Landmark,
  Lock,
  Package,
  QrCode,
  Receipt as ReceiptIcon,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  TrendingUp,
  Ban,
  HandCoins,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { dateID, greeting, rupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Dashboard — BUCICI" },
      { name: "description", content: "Ringkasan laba, omzet, kas laci, dan pintasan alat usaha harian." },
      { property: "og:title", content: "Dashboard — BUCICI" },
      { property: "og:description", content: "Ringkasan laba, omzet, kas laci, dan alat usaha harian." },
    ],
  }),
  component: HomePage,
});

const TOOLS = [
  { key: "kasir", to: "/kasir", label: "Ruang Kasir", desc: "POS, kas laci, riwayat, rekapan, struk.", icon: ShoppingCart },
  { key: "prompt", to: "/prompt", label: "Ruang Kreatif", desc: "Prompt iklan & caption media sosial dengan AI.", icon: Sparkles },
  { key: "stok", to: "/stok", label: "Ruang Stok", desc: "Produk jual, kategori, bahan & alat.", icon: Boxes },
  { key: "hpp", to: "/hpp", label: "Tools Hitung Modal", desc: "HPP murni bahan + saran harga jual AI.", icon: Calculator },
  { key: "info", to: "/info", label: "Ruang Info", desc: "Pengumuman & video dari Super-Admin.", icon: Info },
  { key: "pengaturan", to: "/pengaturan", label: "Pengaturan", desc: "Profil toko, struk, dan tim.", icon: Settings },
] as const;

function HomePage() {
  const { profile, tenant, role, can, flagFor } = useAuth();

  const { data: s } = useQuery({
    queryKey: ["dashboard", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const iso = start.toISOString();
      const [{ data: txs }, { data: items }, { data: cash }, { data: prods }, { data: allUnpaid }] = await Promise.all([
        supabase.from("transactions").select("*").eq("tenant_id", tenant!.id).gte("created_at", iso),
        supabase.from("transaction_items").select("qty,cost,name,created_at").eq("tenant_id", tenant!.id).gte("created_at", iso),
        supabase.from("cash_entries").select("*").eq("tenant_id", tenant!.id),
        supabase.from("products").select("stock,low_stock_threshold").eq("tenant_id", tenant!.id),
        supabase.from("transactions").select("total").eq("tenant_id", tenant!.id).eq("status", "unpaid"),
      ]);
      const paid = (txs ?? []).filter((t) => t.status === "paid");
      const byMethod = (m: string) =>
        paid.filter((t) => (t.payment_method ?? "CASH").toUpperCase() === m).reduce((a, t) => a + Number(t.total), 0);
      const omzet = paid.reduce((a, t) => a + Number(t.total), 0);
      const hpp = (items ?? []).reduce((a, i) => a + Number(i.cost ?? 0) * Number(i.qty), 0);
      const keluarHariIni = (cash ?? [])
        .filter((c) => c.type === "out" && c.created_at >= iso)
        .reduce((a, c) => a + Number(c.amount), 0);
      const lastReset = [...(cash ?? [])].filter((c) => c.is_reset).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      const since = lastReset?.created_at ?? null;
      const scoped = (cash ?? []).filter((c) => (since ? c.created_at >= since : true));
      const laciMasuk = scoped.filter((c) => c.type !== "out").reduce((a, c) => a + Number(c.amount), 0);
      const laciKeluar = scoped.filter((c) => c.type === "out").reduce((a, c) => a + Number(c.amount), 0);
      const best = Object.entries(
        (items ?? []).reduce<Record<string, number>>((acc, i) => {
          acc[i.name] = (acc[i.name] ?? 0) + Number(i.qty);
          return acc;
        }, {}),
      ).sort((a, b) => b[1] - a[1])[0];
      return {
        omzet,
        hpp,
        keluarHariIni,
        laba: omzet - hpp - keluarHariIni,
        tunai: byMethod("CASH"),
        qris: byMethod("QRIS"),
        transfer: byMethod("TRANSFER"),
        laci: laciMasuk + byMethod("CASH") - laciKeluar,
        trx: paid.length,
        void: (txs ?? []).filter((t) => t.status === "void").length,
        best: best?.[0] ?? "—",
        low: (prods ?? []).filter((p) => Number(p.stock) <= Number(p.low_stock_threshold ?? 0)).length,
        piutang: (allUnpaid ?? []).reduce((a, t) => a + Number(t.total), 0),
      };
    },
  });

  const allowedTool = role === "member" ? profile?.allowed_tool : null;
  const tools = TOOLS.filter((t) => {
    const flag = flagFor(t.key);
    if (flag?.is_hidden) return false;
    if (role === "member") {
      if (t.key === "info" || t.key === "pengaturan") return true;
      if (allowedTool && allowedTool !== t.key) return false;
      return can(t.key);
    }
    return true;
  });

  return (
    <AppShell title={`Selamat ${greeting()}, ${profile?.full_name?.split(" ")[0] ?? "Sobat"}`}>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{dateID(new Date())}</p>

      <section className="brand-gradient relative mt-3 overflow-hidden rounded-3xl p-5 text-primary-foreground shadow-brand">
        <TrendingUp className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 opacity-10" />
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground/85">
          <TrendingUp className="h-4 w-4" /> Estimasi Laba Kotor Hari Ini
        </p>
        <p className="mt-1 text-4xl font-black tracking-tight">{rupiah(s?.laba ?? 0)}</p>
        <p className="text-xs italic text-primary-foreground/80">(Omzet − HPP − Pengeluaran Harian)</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <MiniStat label="Omzet" value={rupiah(s?.omzet ?? 0)} />
          <MiniStat label="HPP" value={"-" + rupiah(s?.hpp ?? 0)} />
          <MiniStat label="Pengeluaran" value={"-" + rupiah(s?.keluarHariIni ?? 0)} />
        </div>
      </section>

      <SectionTitle>Ringkasan Finansial Hari Ini</SectionTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card icon={ReceiptIcon} label="Omzet Kotor" value={rupiah(s?.omzet ?? 0)} tone="primary" />
        <Card icon={Calculator} label="HPP Produk Terjual" value={rupiah(s?.hpp ?? 0)} tone="warning" />
        <Card icon={HandCoins} label="Pengeluaran Hari Ini" value={rupiah(s?.keluarHariIni ?? 0)} tone="destructive" />
        <Card icon={Wallet} label="Uang Tunai di Laci" value={rupiah(s?.laci ?? 0)} tone="success" />
      </div>

      <SectionTitle>Rincian Uang Masuk</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card icon={CreditCard} label="Transaksi Tunai" value={rupiah(s?.tunai ?? 0)} tone="success" hint="Total penjualan tunai hari ini" />
        <Card icon={QrCode} label="Transaksi QRIS" value={rupiah(s?.qris ?? 0)} tone="primary" hint="Total penjualan QRIS hari ini" />
        <Card icon={Landmark} label="Transaksi Transfer" value={rupiah(s?.transfer ?? 0)} tone="primary" hint="Total transfer bank hari ini" />
      </div>

      <SectionTitle>Operasional</SectionTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card icon={ReceiptIcon} label="Transaksi" value={String(s?.trx ?? 0)} />
        <Card icon={Star} label="Produk Terlaris" value={s?.best ?? "—"} />
        <Card icon={Ban} label="Jumlah Void" value={String(s?.void ?? 0)} tone="destructive" />
        <Card icon={Package} label="Stok Hampir Habis" value={String(s?.low ?? 0)} tone="warning" />
        <Card icon={Banknote} label="Piutang Aktif" value={rupiah(s?.piutang ?? 0)} tone="warning" />
      </div>

      <SectionTitle>Alat Usaha</SectionTitle>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => {
          const flag = flagFor(t.key);
          const locked = !!flag?.is_locked;
          const Icon = t.icon;
          const body = (
            <div
              className={`flex h-full flex-col gap-2 rounded-3xl border border-border bg-card p-5 shadow-soft transition-all ${
                locked ? "opacity-60" : "hover:-translate-y-1 hover:border-primary/40 hover:shadow-brand"
              }`}
            >
              <span className="brand-gradient grid h-12 w-12 place-items-center rounded-2xl text-primary-foreground shadow-brand">
                {locked ? <Lock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </span>
              <p className="mt-1 text-lg font-bold leading-tight">{t.label}</p>
              <p className="text-sm text-muted-foreground">{locked ? (flag?.note ?? "Sedang dikunci") : t.desc}</p>
              {!locked && <span className="mt-auto pt-2 text-sm font-semibold text-primary">Buka →</span>}
            </div>
          );
          return locked ? <div key={t.key}>{body}</div> : <Link key={t.key} to={t.to}>{body}</Link>;
        })}
      </section>

      <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm shadow-soft">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-muted-foreground">
          Toko aktif: <span className="font-semibold text-foreground">{tenant?.business_name ?? "—"}</span>
          {tenant?.is_demo && " (mode demo)"}
        </span>
      </div>
    </AppShell>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-7 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{children}</h2>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/15 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-primary-foreground/80">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: "primary" | "success" | "warning" | "destructive";
  hint?: string;
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : "text-primary";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className={`mt-1 truncate text-2xl font-black leading-tight ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
