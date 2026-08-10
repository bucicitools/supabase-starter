import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, KeyRound, Loader2, Moon, Pencil, Plus, Sun, Trash2, Upload, X } from "lucide-react";
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

/**
 * Konversi File gambar ke base64 data URL dengan resize max 800px.
 * Hasil disimpan langsung ke database — tidak perlu Storage bucket.
 */
function fileToDataUrl(file: File, maxSize = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas tidak tersedia")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Gagal memuat gambar"));
      img.src = ev.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}

function SettingsPage() {
  const { tenant, profile, role, refresh } = useAuth();
  const dialog = useAppDialog();
  const qc = useQueryClient();
  const tenantId = tenant?.id;
  const isOwner = role === "owner" || role === "super_admin";

  const [dark, setDark] = useState(false);
  const [taxOn, setTaxOn] = useState(false);
  const [editMember, setEditMember] = useState<{ id: string; name: string; tools: string[] } | null>(null);
  const [qrisUploading, setQrisUploading] = useState(false);
  const [qrisDragging, setQrisDragging] = useState(false);
  const qrisInputRef = useRef<HTMLInputElement>(null);

  const [store, setStore] = useState({
    business_name: "",
    default_tax: "0",
    receipt_header: "",
    receipt_address: "",
    receipt_phone: "",
    receipt_extra: "",
    receipt_footer: "",
    receipt_qris_url: "",
  });
  const [member, setMember] = useState<{ fullName: string; email: string; password: string; tools: string[] }>({
    fullName: "",
    email: "",
    password: "",
    tools: ["kasir"],
  });
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ old: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);

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
      receipt_qris_url: tenant.receipt_qris_url ?? "",
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
      const ownerId = tenant?.owner_id ?? null;
      return (data ?? []).filter((m) => m.id !== ownerId && m.id !== profile?.id);
    },
  });

  /**
   * Terima file gambar → konversi ke base64 → simpan langsung ke DB → refresh context.
   * Tidak menggunakan Supabase Storage sama sekali.
   */
  const handleQrisFile = useCallback(
    async (file: File) => {
      if (!tenantId) return;
      if (!file.type.startsWith("image/")) {
        toast.error("File harus berupa gambar (JPG, PNG, dll)");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Ukuran file maksimal 10 MB");
        return;
      }
      setQrisUploading(true);
      try {
        const dataUrl = await fileToDataUrl(file);
        // Simpan langsung ke database tanpa Storage
        const { error } = await supabase
          .from("tenants")
          .update({ receipt_qris_url: dataUrl })
          .eq("id", tenantId);
        if (error) throw new Error(error.message);
        // Update state lokal & refresh auth context agar kasir langsung dapat datanya
        setStore((s) => ({ ...s, receipt_qris_url: dataUrl }));
        await refresh();
        toast.success("Gambar QRIS berhasil disimpan");
      } catch (e) {
        toast.error("Gagal menyimpan gambar", { description: e instanceof Error ? e.message : "Error tidak diketahui" });
      } finally {
        setQrisUploading(false);
      }
    },
    [tenantId, refresh],
  );

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setQrisDragging(true); };
  const onDragLeave = () => setQrisDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setQrisDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleQrisFile(file);
  };

  async function changePassword() {
    if (pw.next.length < 6) { toast.error("Password baru minimal 6 karakter"); return; }
    if (pw.next !== pw.confirm) { toast.error("Konfirmasi password tidak cocok"); return; }
    if (!profile?.email) return;
    setPwBusy(true);
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: profile.email, password: pw.old });
    if (signErr) { setPwBusy(false); toast.error("Password lama salah"); return; }
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setPwBusy(false);
    if (error) { toast.error("Gagal mengganti password", { description: error.message }); return; }
    setPw({ old: "", next: "", confirm: "" });
    toast.success("Password berhasil diganti");
  }

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
        receipt_qris_url: store.receipt_qris_url.trim() || null,
      })
      .eq("id", tenantId);
    if (error) { toast.error("Gagal menyimpan", { description: error.message }); return; }
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
      data: { fullName: member.fullName.trim(), email: member.email.trim(), password: member.password, tenantRoleId: null, allowedTools: member.tools },
    });
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    setMember({ fullName: "", email: "", password: "", tools: ["kasir"] });
    void qc.invalidateQueries({ queryKey: ["members", tenantId] });
    toast.success("Anggota ditambahkan");
  }

  return (
    <AppShell title="Pengaturan">
      <Tabs defaultValue="toko">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="toko">Toko</TabsTrigger>
          <TabsTrigger value="tim">Tim</TabsTrigger>
          <TabsTrigger value="akun">Akun</TabsTrigger>
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
              <Textarea rows={2} value={store.receipt_extra} onChange={(e) => setStore({ ...store, receipt_extra: e.target.value })} />
            </div>
            <F label="Catatan kaki struk" value={store.receipt_footer} onChange={(v) => setStore({ ...store, receipt_footer: v })} />

            {/* ---- QRIS ---- */}
            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
              <div>
                <p className="text-sm font-semibold">Gambar QRIS Pembayaran</p>
                <p className="text-[11px] text-muted-foreground">
                  Drag & drop atau klik untuk upload. Gambar langsung tersimpan dan bisa ditampilkan di kasir.
                </p>
              </div>

              {/* Drag & drop area */}
              {isOwner && (
                <div
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 transition ${
                    qrisDragging
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:border-primary hover:bg-primary/5"
                  }`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => qrisInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && qrisInputRef.current?.click()}
                  aria-label="Upload gambar QRIS"
                >
                  <input
                    ref={qrisInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleQrisFile(file);
                      e.target.value = "";
                    }}
                  />
                  {qrisUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  )}
                  <p className="text-center text-xs text-muted-foreground">
                    {qrisUploading ? "Menyimpan…" : "Klik atau drag & drop gambar QRIS di sini"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">JPG, PNG, maks. 10 MB</p>
                </div>
              )}

              {/* Preview langsung di bawah area upload */}
              {store.receipt_qris_url && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">Pratinjau QRIS</p>
                  <div className="relative overflow-hidden rounded-xl border border-border bg-white p-3">
                    <img
                      src={store.receipt_qris_url}
                      alt="QRIS"
                      className="mx-auto max-h-56 w-auto rounded-lg object-contain"
                    />
                    {isOwner && (
                      <button
                        aria-label="Hapus gambar QRIS"
                        onClick={async () => {
                          if (!tenantId) return;
                          await supabase.from("tenants").update({ receipt_qris_url: null }).eq("id", tenantId);
                          setStore((s) => ({ ...s, receipt_qris_url: "" }));
                          await refresh();
                          toast.success("Gambar QRIS dihapus");
                        }}
                        className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Field URL manual (opsional) */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Atau masukkan URL gambar manual</Label>
                <div className="flex gap-2">
                  <Input
                    value={store.receipt_qris_url.startsWith("data:") ? "" : store.receipt_qris_url}
                    onChange={(e) => setStore({ ...store, receipt_qris_url: e.target.value })}
                    placeholder="https://..."
                    className="flex-1 text-xs"
                    disabled={!isOwner}
                  />
                  {store.receipt_qris_url && !store.receipt_qris_url.startsWith("data:") && (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Pratinjau URL"
                      onClick={() => {
                        // Trigger re-render untuk memuat gambar dari URL
                        setStore((s) => ({ ...s }));
                      }}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

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
                    const ok = await dialog.confirm({
                      title: "Hapus Seluruh Data Keuangan?",
                      description: "Seluruh transaksi, item transaksi, dan catatan kas laci akan dihapus permanen.",
                      confirmText: "Hapus",
                      destructive: true,
                    });
                    if (!ok) return;
                    const res = await wipeFinancialData();
                    if (!res.ok) { toast.error(res.error); return; }
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
                      onClick={() =>
                        setEditMember({
                          id: m.id,
                          name: m.full_name,
                          tools: m.allowed_tools?.length ? [...m.allowed_tools] : m.allowed_tool ? [m.allowed_tool] : [],
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={async () => {
                        const ok = await dialog.confirm({
                          title: "Hapus Anggota?",
                          description: `${m.full_name} tidak akan bisa login lagi.`,
                          confirmText: "Hapus",
                          destructive: true,
                        });
                        if (!ok) return;
                        const res = await deleteMember({ data: { userId: m.id } });
                        if (!res.ok) { toast.error(res.error); return; }
                        void qc.invalidateQueries({ queryKey: ["members", tenantId] });
                        toast.success("Anggota dihapus");
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="akun" className="mt-4">
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <p className="flex items-center gap-2 text-sm font-bold">
              <KeyRound className="h-4 w-4 text-primary" /> Ganti Password
            </p>
            <p className="-mt-1 text-xs text-muted-foreground">Akun: {profile?.email}</p>
            <PF label="Password lama" value={pw.old} onChange={(v) => setPw({ ...pw, old: v })} />
            <PF label="Password baru" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} />
            <PF label="Konfirmasi password baru" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} />
            <Button className="w-full" disabled={pwBusy} onClick={() => void changePassword()}>
              {pwBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan Password Baru
            </Button>
          </div>
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

      <Dialog open={!!editMember} onOpenChange={(o) => !o && setEditMember(null)}>
        <DialogContent className="max-w-[360px] rounded-3xl">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-bold">Hak Akses — {editMember?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {TOOL_KEYS.map((k) => {
              const on = editMember?.tools.includes(k) ?? false;
              return (
                <button
                  key={k}
                  onClick={() =>
                    setEditMember((s) =>
                      s ? { ...s, tools: on ? s.tools.filter((x) => x !== k) : [...s.tools, k] } : s,
                    )
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
                    on ? "bg-primary text-primary-foreground" : "border border-border bg-muted text-foreground"
                  }`}
                >
                  {k}
                </button>
              );
            })}
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            <Button variant="outline" className="w-full" onClick={() => setEditMember(null)}>
              Batal
            </Button>
            <Button
              className="w-full"
              onClick={async () => {
                if (!editMember) return;
                const res = await updateMemberAccess({
                  data: { userId: editMember.id, fullName: editMember.name, allowedTools: editMember.tools },
                });
                if (!res.ok) { toast.error(res.error); return; }
                setEditMember(null);
                void qc.invalidateQueries({ queryKey: ["members", tenantId] });
                toast.success("Hak akses diperbarui");
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function PF({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="password" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
