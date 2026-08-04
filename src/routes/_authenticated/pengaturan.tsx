import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Moon, Pencil, Plus, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { createMember, deleteMember, updateMemberAccess, wipeFinancialData } from "@/lib/account.functions";
import { Receipt, type ReceiptData } from "@/components/Receipt";
import { useAppDialog } from "@/components/app-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/pengaturan")({
  head: () => ({
    meta: [
      { title: "Pengaturan — BUCICI" },
      { name: "description", content: "Atur profil toko, struk, tampilan, dan anggota tim." },
      { property: "og:title", content: "Pengaturan — BUCICI" },
      { property: "og:description", content: "Atur profil toko, struk, dan anggota tim." },
    ],
  }),
  component: SettingsPage,
});

const TOOL_KEYS = ["dashboard", "kasir", "stok", "hpp", "prompt"];

const PREVIEW: ReceiptData = {
  code: "TRX20260101-120000",
  at: new Date().toISOString(),
  lines: [
    { name: "Es Teh Manis", qty: 2, price: 5000 },
    { name: "Ayam Geprek", qty: 1, price: 18000 },
  ],
  subtotal: 28000,
  discount: 2000,
  tax: 0,
  total: 26000,
  paid: 30000,
  change: 4000,
  customer: "Bu Ani",
  method: "CASH",
  status: "paid",
  note: "Contoh pratinjau",
  cashier: "Kasir 1",
};

function SettingsPage() {
  const { tenant, profile, role, refresh } = useAuth();
  const dialog = useAppDialog();
  const qc = useQueryClient();
  const tenantId = tenant?.id;
  const isOwner = role === "owner" || role === "super_admin";

  const [dark, setDark] = useState(false);
  const [taxOn, setTaxOn] = useState(false);
  const [editMember, setEditMember] = useState<{ id: string; name: string; tools: string[] } | null>(null);
  const [store, setStore] = useState({
    business_name: "",
    default_tax: "0",
    receipt_header: "",
    receipt_address: "",
    receipt_phone: "",
    receipt_extra: "",
    receipt_footer: "",
  });
  const [member, setMember] = useState<{ fullName: string; email: string; password: string; tools: string[] }>({
    fullName: "",
    email: "",
    password: "",
    tools: ["kasir"],
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    if (!tenant) return;
    setTaxOn(Number(tenant.default_tax ?? 0) > 0);
    setStore({
      business_name: tenant.business_name ?? "",
      default_tax: String(tenant.default_tax ?? 0),
      receipt_header: tenant.receipt_header ?? "",
      receipt_address: tenant.receipt_address ?? "",
      receipt_phone: tenant.receipt_phone ?? "",
      receipt_extra: tenant.receipt_extra ?? "",
      receipt_footer: tenant.receipt_footer ?? "",
    });
  }, [tenant]);

  const { data: members = [] } = useQuery({
    queryKey: ["members", tenantId],
    enabled: !!tenantId && isOwner,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,email,allowed_tool,allowed_tools")
        .eq("tenant_id", tenantId!)
        .order("full_name");
      return data ?? [];
    },
  });

  function toggleDark(v: boolean) {
    setDark(v);
    document.documentElement.classList.toggle("dark", v);
    localStorage.setItem("bucici-theme", v ? "dark" : "light");
  }

  async function saveStore() {
    if (!tenantId) return;
    const { error } = await supabase
      .from("tenants")
      .update({
        business_name: store.business_name.trim(),
        default_tax: taxOn ? Number(store.default_tax || 0) : 0,
        receipt_header: store.receipt_header.trim() || null,
        receipt_address: store.receipt_address.trim() || null,
        receipt_phone: store.receipt_phone.trim() || null,
        receipt_extra: store.receipt_extra.trim() || null,
        receipt_footer: store.receipt_footer.trim() || null,
      })
      .eq("id", tenantId);
    if (error) {
      toast.error("Gagal menyimpan", { description: error.message });
      return;
    }
    await refresh();
    toast.success("Pengaturan toko disimpan");
  }

  async function addMember() {
    if (!member.fullName.trim() || !member.email.trim() || member.password.length < 6) {
      toast.error("Lengkapi data anggota (password minimal 6 karakter)");
      return;
    }
    setBusy(true);
    const res = await createMember({
      data: {
        fullName: member.fullName.trim(),
        email: member.email.trim(),
        password: member.password,
        tenantRoleId: null,
        allowedTools: member.tools,
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setMember({ fullName: "", email: "", password: "", tools: ["kasir"] });
    void qc.invalidateQueries({ queryKey: ["members", tenantId] });
    toast.success("Anggota ditambahkan");
  }

  return (
    <AppShell title="Pengaturan">
      <Tabs defaultValue="toko">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="toko">Toko</TabsTrigger>
          <TabsTrigger value="tim">Tim</TabsTrigger>
          <TabsTrigger value="tampilan">Tampilan</TabsTrigger>
        </TabsList>

        <TabsContent value="toko" className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_320px]">
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
          <F label="Nama toko" value={store.business_name} onChange={(v) => setStore({ ...store, business_name: v })} />

          <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Pajak Penjualan</p>
                <p className="text-[11px] text-muted-foreground">
                  Jika aktif, kasir otomatis mencentang pajak (masih bisa dimatikan manual per transaksi).
                </p>
              </div>
              <Switch
                checked={taxOn}
                onCheckedChange={(v) => {
                  setTaxOn(v);
                  if (!v) setStore((s) => ({ ...s, default_tax: "0" }));
                  else if (Number(store.default_tax || 0) <= 0) setStore((s) => ({ ...s, default_tax: "10" }));
                }}
              />
            </div>
            {taxOn && (
              <F label="Default pajak (%)" value={store.default_tax} onChange={(v) => setStore({ ...store, default_tax: v })} />
            )}
          </div>

          <p className="pt-1 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Format Struk</p>
          <F label="Judul struk" value={store.receipt_header} onChange={(v) => setStore({ ...store, receipt_header: v })} />
          <F label="Alamat struk" value={store.receipt_address} onChange={(v) => setStore({ ...store, receipt_address: v })} />
          <F label="Telepon struk" value={store.receipt_phone} onChange={(v) => setStore({ ...store, receipt_phone: v })} />
          <div className="space-y-1">
            <Label className="text-xs">Info tambahan struk</Label>
            <Textarea
              rows={2}
              value={store.receipt_extra}
              onChange={(e) => setStore({ ...store, receipt_extra: e.target.value })}
            />
          </div>
          <F label="Catatan kaki struk" value={store.receipt_footer} onChange={(v) => setStore({ ...store, receipt_footer: v })} />
          <Button onClick={() => void saveStore()} disabled={!isOwner} className="w-full">
            Simpan Pengaturan
          </Button>
          {isOwner && (
            <div className="mt-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-bold text-destructive">Zona Berbahaya</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Menghapus seluruh transaksi, item transaksi, dan catatan kas laci. Produk dan bahan tidak ikut terhapus.
              </p>
              <Button
                variant="destructive"
                className="mt-3 w-full"
                onClick={async () => {
                  if (!window.confirm("Hapus SELURUH data keuangan (transaksi & kas)? Tindakan ini tidak bisa dibatalkan.")) return;
                  const res = await wipeFinancialData();
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  void qc.invalidateQueries();
                  toast.success("Seluruh data keuangan dihapus");
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Hapus Seluruh Data Keuangan
              </Button>
            </div>
          )}
          </div>
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Pratinjau Struk</p>
            <div className="rounded-2xl border border-border bg-muted/40 p-3 shadow-soft">
              <Receipt
                data={PREVIEW}
                header={store.receipt_header || store.business_name}
                address={store.receipt_address}
                phone={store.receipt_phone}
                footer={store.receipt_footer}
                extra={store.receipt_extra}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Pratinjau berubah otomatis saat kamu mengetik. Data di atas hanya contoh.
            </p>
          </aside>
        </TabsContent>

        <TabsContent value="tim" className="mt-4 space-y-4">
          {!isOwner && <p className="text-sm text-muted-foreground">Hanya pemilik toko yang bisa mengelola tim.</p>}
          {isOwner && (
            <>
              <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
                <F label="Nama anggota" value={member.fullName} onChange={(v) => setMember({ ...member, fullName: v })} />
                <F label="Email" value={member.email} onChange={(v) => setMember({ ...member, email: v })} />
                <F label="Password" value={member.password} onChange={(v) => setMember({ ...member, password: v })} />
                <div className="space-y-1">
                  <Label className="text-xs">Akses alat</Label>
                  <div className="flex flex-wrap gap-2">
                    {TOOL_KEYS.map((k) => (
                      <button
                        key={k}
                        onClick={() =>
                          setMember({
                            ...member,
                            tools: member.tools.includes(k)
                              ? member.tools.filter((x) => x !== k)
                              : [...member.tools, k],
                          })
                        }
                        className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
                          member.tools.includes(k)
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-muted text-foreground"
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
                <Button onClick={() => void addMember()} disabled={busy} className="w-full">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Tambah Anggota
                </Button>
              </div>

              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{m.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email} · akses {m.allowed_tools?.length ? m.allowed_tools.join(", ") : (m.allowed_tool ?? "semua")}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Edit hak akses"
                      onClick={async () => {
                        const current = m.allowed_tools?.length ? m.allowed_tools : m.allowed_tool ? [m.allowed_tool] : [];
                        const raw = window.prompt(
                          `Hak akses untuk ${m.full_name}\nPilihan: ${TOOL_KEYS.join(", ")}\nPisahkan dengan koma.`,
                          current.join(", "),
                        );
                        if (raw == null) return;
                        const tools = raw
                          .split(",")
                          .map((x) => x.trim().toLowerCase())
                          .filter((x) => TOOL_KEYS.includes(x));
                        const res = await updateMemberAccess({
                          data: { userId: m.id, fullName: m.full_name, allowedTools: tools },
                        });
                        if (!res.ok) {
                          toast.error(res.error);
                          return;
                        }
                        void qc.invalidateQueries({ queryKey: ["members", tenantId] });
                        toast.success("Hak akses diperbarui");
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {m.id !== profile?.id && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={async () => {
                          const res = await deleteMember({ data: { userId: m.id } });
                          if (!res.ok) {
                            toast.error(res.error);
                            return;
                          }
                          void qc.invalidateQueries({ queryKey: ["members", tenantId] });
                          toast.success("Anggota dihapus");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="tampilan" className="mt-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
            {dark ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
            <div className="flex-1">
              <p className="font-semibold">Mode gelap</p>
              <p className="text-xs text-muted-foreground">Nyaman dipakai saat malam hari.</p>
            </div>
            <Switch checked={dark} onCheckedChange={toggleDark} />
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function F({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}