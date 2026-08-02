import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Boxes,
  Building2,
  Calculator,
  Info,
  LayoutDashboard,
  Lock,
  Settings,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { dateID, greeting } from "@/lib/format";
import { OfflineBanner } from "@/components/OfflineBanner";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Beranda Alat Usaha — BUCICI" },
      { name: "description", content: "Pintasan ke dashboard, kasir, kreasi prompt, stok, hitung modal, dan pengaturan toko." },
      { property: "og:title", content: "Beranda Alat Usaha — BUCICI" },
      { property: "og:description", content: "Pintasan alat usaha harian BUCICI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

const TOOLS = [
  {
    key: "dashboard",
    to: "/dashboard",
    label: "Dashboard",
    desc: "Laba kotor, omzet, kas laci, dan ringkasan operasional hari ini.",
    icon: LayoutDashboard,
    ownerOnly: false,
  },
  { key: "kasir", to: "/kasir", label: "Ruang Kasir", desc: "POS, kas laci, riwayat, rekapan, struk.", icon: ShoppingCart, ownerOnly: false },
  {
    key: "prompt",
    to: "/prompt",
    label: "Ruang Kreasi Prompt",
    desc: "Prompt foto produk & caption media sosial dengan AI.",
    icon: Sparkles,
    ownerOnly: false,
  },
  { key: "stok", to: "/stok", label: "Ruang Stok", desc: "Produk jual, kategori, bahan & alat.", icon: Boxes, ownerOnly: false },
  { key: "hpp", to: "/hpp", label: "Ruang Hitung Modal", desc: "HPP murni bahan + saran harga jual AI.", icon: Calculator, ownerOnly: false },
  { key: "info", to: "/info", label: "Ruang Info", desc: "Pengumuman, video, dan AI-sisten usaha.", icon: Info, ownerOnly: true },
  { key: "pengaturan", to: "/pengaturan", label: "Pengaturan", desc: "Profil toko, struk, tim, dan data.", icon: Settings, ownerOnly: false },
] as const;

function HomePage() {
  const { profile, tenant, role, can, flagFor } = useAuth();

  const allowed = profile?.allowed_tools?.length
    ? profile.allowed_tools
    : profile?.allowed_tool
      ? [profile.allowed_tool]
      : [];

  const tools = TOOLS.filter((t) => {
    const flag = flagFor(t.key);
    if (flag?.is_hidden) return false;
    if (t.ownerOnly && role === "member") return false;
    if (role === "member") {
      if (t.key === "pengaturan") return true;
      if (allowed.length && !allowed.includes(t.key)) return false;
      return can(t.key);
    }
    return true;
  });

  return (
    <AppShell title={`Selamat ${greeting()}, ${profile?.full_name?.split(" ")[0] ?? "Sobat"}`}>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{dateID(new Date())}</p>
      <OfflineBanner />

      <h2 className="mb-3 mt-5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Alat Usaha</h2>
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
        <Building2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 text-muted-foreground">
          Toko aktif: <span className="font-semibold text-foreground">{tenant?.business_name ?? "—"}</span>
          {tenant?.is_demo && " (mode demo)"}
        </span>
      </div>
    </AppShell>
  );
}
