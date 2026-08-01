import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { createMember, deleteMember } from "@/lib/account.functions";
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

const TOOL_KEYS = ["kasir", "modal", "stok", "hpp", "prompt"];

function SettingsPage() {
  const { tenant, profile, role, refresh } = useAuth();
  const qc = useQueryClient();
  const tenantId = tenant?.id;
  const isOwner = role === "owner" || role === "super_admin";

  const [dark, setDark] = useState(false);
  const [store, setStore] = useState({
    business_name: "",
    default_tax: "0",
    receipt_header: "",
    receipt_address: "",
    receipt_phone: "",
    receipt_extra: "",
    receipt_footer: "",
  });
  const [member, setMember] = useState({ fullName: "", email: "", password: "", tool: "kasir" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    if (!tenant) return;
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
        .select("id,full_name,email,allowed_tool")
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
        default_tax: Number(store.default_tax || 0),
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
        allowedTool: member.tool,
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setMember({ fullName: "", email: "", password: "", tool: "kasir" });
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

        <TabsContent value="toko" className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
          <F label="Nama toko" value={store.business_name} onChange={(v) => setStore({ ...store, business_name: v })} />
          <F label="Pajak default (%)" value={store.default_tax} onChange={(v) => setStore({ ...store, default_tax: v })} />
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
                        onClick={() => setMember({ ...member, tool: k })}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
                          member.tool === k
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
                        {m.email} · akses {m.allowed_tool ?? "semua"}
                      </p>
                    </div>
                    {m.id !== profile?.id && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={async () => {
                          const res = await deleteMember({ data: { userId: m.id } });
                          if (!res.ok) return toast.error(res.error);
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