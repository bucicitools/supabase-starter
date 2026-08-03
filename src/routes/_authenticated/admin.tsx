import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, KeyRound, Loader2, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { AIChat } from "@/components/AIChat";
import { toggleDemoTenant } from "@/lib/account.functions";
import { dateID, downloadCSV } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Panel Super Admin — BUCICI" },
      { name: "description", content: "Kelola lisensi, tenant, fitur, dan informasi platform BUCICI." },
      { property: "og:title", content: "Panel Super Admin — BUCICI" },
      { property: "og:description", content: "Kelola lisensi, tenant, dan fitur platform." },
    ],
  }),
  component: AdminPage,
});

const FEATURES = [
  { key: "kasir", label: "Kasir" },
  { key: "modal", label: "Modal & Kas" },
  { key: "stok", label: "Stok" },
  { key: "hpp", label: "Hitung HPP" },
  { key: "prompt", label: "Kreasi Prompt" },
  { key: "info", label: "Info" },
];

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `BUCICI-${s}`;
}

function AdminPage() {
  const { role, profile, tenant, refresh } = useAuth();
  const qc = useQueryClient();
  const [count, setCount] = useState("5");
  const [batch, setBatch] = useState("");
  const [busy, setBusy] = useState(false);
  const [post, setPost] = useState({ title: "", content: "", link: "" });
  const [demoOn, setDemoOn] = useState(false);

  useEffect(() => {
    setDemoOn(!!tenant?.is_demo);
  }, [tenant]);

  const { data: licenses = [] } = useQuery({
    queryKey: ["licenses"],
    enabled: role === "super_admin",
    queryFn: async () => {
      const { data } = await supabase.from("licenses").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants"],
    enabled: role === "super_admin",
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: flags = [] } = useQuery({
    queryKey: ["feature_flags"],
    queryFn: async () => {
      const { data } = await supabase.from("feature_flags").select("*");
      return data ?? [];
    },
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["info_posts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("info_posts")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  if (role !== "super_admin") {
    return (
      <AppShell title="Panel Super Admin">
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
          Halaman ini khusus Super Admin.
        </p>
      </AppShell>
    );
  }

  async function generate() {
    const n = Math.min(100, Math.max(1, Number(count || 1)));
    setBusy(true);
    const rows = Array.from({ length: n }, () => ({ code: randomCode(), batch: batch.trim() || null }));
    const { error } = await supabase.from("licenses").insert(rows);
    setBusy(false);
    if (error) {
      toast.error("Gagal membuat lisensi", { description: error.message });
      return;
    }
    void qc.invalidateQueries({ queryKey: ["licenses"] });
    toast.success(`${n} kode lisensi dibuat`);
  }

  async function setFlag(key: string, patch: { is_locked?: boolean; is_hidden?: boolean; note?: string }) {
    const existing = flags.find((f) => f.feature_key === key);
    if (existing) await supabase.from("feature_flags").update(patch).eq("id", existing.id);
    else await supabase.from("feature_flags").insert({ feature_key: key, ...patch });
    void qc.invalidateQueries({ queryKey: ["feature_flags"] });
  }

  async function publishPost() {
    if (!post.title.trim()) {
      toast.error("Judul wajib diisi");
      return;
    }
    const { error } = await supabase.from("info_posts").insert({
      title: post.title.trim(),
      content: post.content.trim(),
      link: post.link.trim() || null,
    });
    if (error) {
      toast.error("Gagal menerbitkan", { description: error.message });
      return;
    }
    setPost({ title: "", content: "", link: "" });
    void qc.invalidateQueries({ queryKey: ["info_posts"] });
    toast.success("Info diterbitkan");
  }

  async function switchDemo(on: boolean) {
    setDemoOn(on);
    const res = await toggleDemoTenant({ data: { enabled: on } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    await refresh();
    toast.success(on ? "Mode demo aktif" : "Mode demo dimatikan");
  }

  return (
    <AppShell title="Panel Super Admin" subtitle={profile?.full_name ?? "Super Admin"}>
      <Tabs defaultValue="lisensi">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="lisensi">Lisensi</TabsTrigger>
          <TabsTrigger value="tenant">Tenant</TabsTrigger>
          <TabsTrigger value="fitur">Fitur</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
        </TabsList>

        <TabsContent value="lisensi" className="mt-4 space-y-4">
          <div className="grid gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Jumlah kode</Label>
              <Input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Nama batch (opsional)</Label>
              <Input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Mis. Promo Agustus" />
            </div>
            <Button className="sm:col-span-3" onClick={() => void generate()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Buat Kode Lisensi
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={() =>
              downloadCSV(
                "lisensi-bucici.csv",
                licenses.map((l) => ({
                  kode: l.code,
                  batch: l.batch ?? "",
                  status: l.used_by ? "terpakai" : "tersedia",
                  dibuat: dateID(l.created_at),
                })),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Unduh CSV
          </Button>

          <div className="grid gap-2 sm:grid-cols-2">
            {licenses.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-soft">
                <span className="flex-1 font-mono text-sm font-semibold">{l.code}</span>
                <span className={`text-xs font-semibold ${l.used_by ? "text-muted-foreground" : "text-success"}`}>
                  {l.used_by ? "Terpakai" : "Tersedia"}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(l.code);
                    toast.success("Kode disalin");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                {!l.used_by && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      await supabase.from("licenses").delete().eq("id", l.id);
                      void qc.invalidateQueries({ queryKey: ["licenses"] });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tenant" className="mt-4 space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="flex-1">
              <p className="font-semibold">Mode demo toko</p>
              <p className="text-xs text-muted-foreground">
                Aktifkan untuk mencoba seluruh alat usaha sebagai pemilik toko demo.
              </p>
            </div>
            <Switch checked={demoOn} onCheckedChange={(v) => void switchDemo(v)} />
          </div>
          {tenants.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{t.business_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.owner_name} · {t.license_code ?? "tanpa lisensi"} · {dateID(t.created_at)}
                </p>
              </div>
              <Switch
                checked={t.is_active}
                onCheckedChange={async (v) => {
                  await supabase.from("tenants").update({ is_active: v }).eq("id", t.id);
                  void qc.invalidateQueries({ queryKey: ["tenants"] });
                }}
              />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="fitur" className="mt-4 space-y-3">
          {FEATURES.map((f) => {
            const flag = flags.find((x) => x.feature_key === f.key);
            return (
              <div key={f.key} className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-soft">
                <p className="font-semibold">{f.label}</p>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={!!flag?.is_locked}
                      onCheckedChange={(v) => void setFlag(f.key, { is_locked: v })}
                    />
                    Kunci
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={!!flag?.is_hidden}
                      onCheckedChange={(v) => void setFlag(f.key, { is_hidden: v })}
                    />
                    Sembunyikan
                  </label>
                </div>
                <Input
                  defaultValue={flag?.note ?? ""}
                  placeholder="Catatan untuk pengguna, mis. Segera hadir"
                  onBlur={(e) => void setFlag(f.key, { note: e.target.value })}
                />
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="info" className="mt-4 space-y-4">
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="space-y-1">
              <Label className="text-xs">Judul</Label>
              <Input value={post.title} onChange={(e) => setPost({ ...post, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Isi</Label>
              <Textarea rows={4} value={post.content} onChange={(e) => setPost({ ...post, content: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tautan (opsional)</Label>
              <Input value={post.link} onChange={(e) => setPost({ ...post, link: e.target.value })} placeholder="https://" />
            </div>
            <Button className="w-full" onClick={() => void publishPost()}>
              <Plus className="mr-2 h-4 w-4" /> Terbitkan
            </Button>
          </div>
          {posts.map((p) => (
            <div key={p.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {p.is_pinned && <span className="mr-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">DISEMATKAN</span>}
                  {p.title}
                </p>
                <p className="text-xs text-muted-foreground">{dateID(p.created_at)}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={p.is_pinned ? "Lepas sematan" : "Sematkan di atas"}
                className={p.is_pinned ? "text-primary" : ""}
                onClick={async () => {
                  await supabase.from("info_posts").update({ is_pinned: !p.is_pinned }).eq("id", p.id);
                  void qc.invalidateQueries({ queryKey: ["info_posts"] });
                  toast.success(p.is_pinned ? "Sematan dilepas" : "Info disematkan di atas");
                }}
              >
                {p.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  await supabase.from("info_posts").delete().eq("id", p.id);
                  void qc.invalidateQueries({ queryKey: ["info_posts"] });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <AIChat
            scope="super_admin"
            starters={["Berapa tenant aktif?", "Berapa lisensi yang belum terpakai?", "Ringkas pertumbuhan tenant"]}
          />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}