import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Banknote,
  Calculator,
  CreditCard,
  HandCoins,
  Landmark,
  Package,
  QrCode,
  Receipt as ReceiptIcon,
  Star,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { cacheGet, cacheSet } from "@/lib/offline";
import { OfflineBanner } from "@/components/OfflineBanner";
import { dateID, rupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard Usaha — BUCICI" },
      { name: "description", content: "Estimasi laba kotor, omzet, kas laci, dan ringkasan operasional toko hari ini." },
      { property: "og:title", content: "Dashboard Usaha — BUCICI" },
      { property: "og:description", content: "Estimasi laba kotor dan ringkasan operasional toko hari ini." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

type Stats = {
  omzet: number;
  hpp: number;
  keluarHariIni: number;
  laba: number;
  tunai: number;
  qris: number;
  transfer: number;
  laci: number;
  trx: number;
  void: number;
  best: string;
  low: number;
  piutang: number;
  missingCost: number;
};

function DashboardPage() {
  const { profile, tenant } = useAuth();

  const { data: s } = useQuery<Stats>({
    queryKey: ["dashboard", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const iso = start.toISOString();
      const [{ data: txs }, { data: items }, { data: cash }, { data: prods }, { data: allUnpaid }, { data: cashTx }] =
        await Promise.all([
        supabase.from("transactions").select("*").eq("tenant_id", tenant!.id).gte("created_at", iso),
        supabase.from("transaction_items").select("qty,cost,name,created_at").eq("tenant_id", tenant!.id).gte("created_at", iso),
        supabase.from("cash_entries").select("*").eq("tenant_id", tenant!.id),
        supabase.from("products").select("stock,low_stock_threshold,cost").eq("tenant_id", tenant!.id),
        supabase.from("transactions").select("total").eq("tenant_id", tenant!.id).eq("status", "unpaid"),
        supabase
          .from("transactions")
          .select("total,paid_amount,payment_method,paid_at,created_at")
          .eq("tenant_id", tenant!.id)
          .eq("status", "paid"),
      ]);
      // Omzet = seluruh transaksi hari ini yang tidak dibatalkan (lunas + bayar nanti/piutang).
      const sah = (txs ?? []).filter((t) => t.status !== "void");
      const paid = (txs ?? []).filter((t) => t.status === "paid");
      const byMethod = (m: string) =>
        paid.filter((t) => (t.payment_method ?? "CASH").toUpperCase() === m).reduce((a, t) => a + Number(t.total), 0);
      const omzet = sah.reduce((a, t) => a + Number(t.total), 0);
      const hpp = (items ?? []).reduce((a, i) => a + Number(i.cost ?? 0) * Number(i.qty), 0);
      const keluarHariIni = (cash ?? [])
        .filter((c) => c.type === "out" && c.created_at >= iso)
        .reduce((a, c) => a + Number(c.amount), 0);
      const lastReset = [...(cash ?? [])].filter((c) => c.is_reset).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      const since = lastReset?.created_at ?? null;
      const scoped = (cash ?? []).filter((c) => (since ? c.created_at >= since : true));
      const laciMasuk = scoped.filter((c) => c.type !== "out").reduce((a, c) => a + Number(c.amount), 0);
      const laciKeluar = scoped.filter((c) => c.type === "out").reduce((a, c) => a + Number(c.amount), 0);
      // Sama persis dengan perhitungan "Uang di Laci Saat Ini" pada navigasi Kas.
      const penjualanTunaiLaci = (cashTx ?? [])
        .filter(
          (t) =>
            (t.payment_method ?? "CASH").toUpperCase() === "CASH" &&
            (since ? (t.paid_at ?? t.created_at) >= since : true),
        )
        .reduce((a, t) => a + Number(t.paid_amount || t.total), 0);
      const best = Object.entries(
        (items ?? []).reduce<Record<string, number>>((acc, i) => {
          acc[i.name] = (acc[i.name] ?? 0) + Number(i.qty);
          return acc;
        }, {}),
      ).sort((a, b) => b[1] - a[1])[0];
      const stats: Stats = {
        omzet,
        hpp,
        keluarHariIni,
        laba: omzet - hpp - keluarHariIni,
        tunai: byMethod("CASH"),
        qris: byMethod("QRIS"),
        transfer: byMethod("TRANSFER"),
        laci: laciMasuk + penjualanTunaiLaci - laciKeluar,
        trx: sah.length,
        void: (txs ?? []).filter((t) => t.status === "void").length,
        best: best?.[0] ?? "—",
        low: (prods ?? []).filter((p) => Number(p.stock) <= Number(p.low_stock_threshold ?? 0)).length,
        piutang: (allUnpaid ?? []).reduce((a, t) => a + Number(t.total), 0),
        missingCost: (items ?? []).filter((i) => i.cost == null || Number(i.cost) <= 0).length,
      };
      cacheSet(`dashboard:${tenant!.id}`, stats);
      return stats;
    },
    initialData: () => (tenant?.id ? (cacheGet<Stats | null>(`dashboard:${tenant.id}`, null) ?? undefined) : undefined),
  });

  const belumLengkap = (s?.missingCost ?? 0) > 0;

  return (
    <AppShell title="Dashboard" subtitle={tenant?.business_name ?? profile?.full_name ?? "BUCICI"}>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{dateID(new Date())}</p>
      <OfflineBanner />

      {belumLengkap ? (
        <section className="mt-3 overflow-hidden rounded-3xl border border-warning/40 bg-warning/10 p-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-warning">
            <AlertTriangle className="h-4 w-4" /> Estimasi Laba Kotor Hari Ini
          </p>
          <p className="num mt-2 text-3xl font-black tracking-tight text-foreground">Belum bisa dihitung</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ada {s?.missingCost} item terjual yang produknya belum punya harga modal (HPP). Lengkapi dulu agar laba akurat.
          </p>
          <Button asChild className="mt-4">
            <Link to="/stok" search={{ filter: "nomodal" }}>
              Lengkapi Sekarang
            </Link>
          </Button>
        </section>
      ) : (
        <section className="brand-gradient relative mt-3 overflow-hidden rounded-3xl p-5 text-primary-foreground shadow-brand">
          <TrendingUp className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 opacity-10" />
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground/85">
            <TrendingUp className="h-4 w-4" /> Estimasi Laba Kotor Hari Ini
          </p>
          <p className="num mt-1 text-4xl font-black tracking-tight">{rupiah(s?.laba ?? 0)}</p>
          <p className="text-xs italic text-primary-foreground/80">(Omzet − HPP − Pengeluaran Harian)</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <MiniStat label="Omzet" value={rupiah(s?.omzet ?? 0)} />
            <MiniStat label="HPP" value={"-" + rupiah(s?.hpp ?? 0)} />
            <MiniStat label="Pengeluaran" value={"-" + rupiah(s?.keluarHariIni ?? 0)} />
          </div>
        </section>
      )}

      <SectionTitle>Ringkasan Finansial Hari Ini</SectionTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card icon={ReceiptIcon} label="Omzet Kotor" value={rupiah(s?.omzet ?? 0)} tone="primary" />
        {belumLengkap ? (
          <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-warning">
              <Calculator className="h-3.5 w-3.5 shrink-0" /> HPP Produk Terjual
            </p>
            <p className="mt-1 text-sm font-semibold leading-tight text-foreground">Belum bisa dihitung</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {s?.missingCost} unit produk terjual hari ini belum punya harga modal.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-2 h-8 w-full text-xs">
              <Link to="/stok" search={{ filter: "nomodal" }}>
                Lengkapi Sekarang
              </Link>
            </Button>
          </div>
        ) : (
          <Card icon={Calculator} label="HPP Produk Terjual" value={rupiah(s?.hpp ?? 0)} tone="warning" />
        )}
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
      <p className="num text-sm font-bold">{value}</p>
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
        <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
      </p>
      <p className={`num mt-1 truncate text-2xl font-black leading-tight ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
