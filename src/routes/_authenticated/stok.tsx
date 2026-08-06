import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ProductImage } from "@/components/ProductImage";
import { useAppDialog } from "@/components/app-dialog";
import { digitsOnly, downloadCSV, num, numInput, rupiah, thousands } from "@/lib/format";
import { cachedList, dbDelete, dbInsert, dbUpdate, isOnline, removeLocal, upsertLocal } from "@/lib/offline";
import { syncProductCost } from "@/lib/hpp-sync";
import { useRequireOnline } from "@/lib/require-online";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ProductFilter = "all" | "low" | "nomodal";

export const Route = createFileRoute("/_authenticated/stok")({
  validateSearch: (search: Record<string, unknown>): { filter: ProductFilter } => {
    const f = search["filter"];
    return { filter: f === "low" || f === "nomodal" ? f : "all" };
  },
  head: () => ({
    meta: [
      { title: "Ruang Stok — BUCICI" },
      { name: "description", content: "Kelola produk jual, kategori, foto produk, bahan baku, dan peringatan stok menipis." },
      { property: "og:title", content: "Ruang Stok — BUCICI" },
      { property: "og:description", content: "Kelola produk jual, foto produk, dan bahan baku." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StokPage,
});

const emptyProduct = { name: "", price: "", cost: "", stock: "", sku: "", low: "5", categoryId: "none", imagePath: "" };

function StokPage() {
  const { tenant, profile } = useAuth();
  const dialog = useAppDialog();
  const requireOnline = useRequireOnline();
  const { filter } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const [p, setP] = useState({ ...emptyProduct });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [it, setIt] = useState({ name: "", kind: "bahan", unit: "pcs", qty: "", min: "", cost: "", supplier: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products", tenantId],
    enabled: !!tenantId,
    ...cachedList(`products:${tenantId}`, () =>
      supabase.from("products").select("*").eq("tenant_id", tenantId!).order("name"),
    ),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", tenantId],
    enabled: !!tenantId,
    ...cachedList(`categories:${tenantId}`, () =>
      supabase.from("categories").select("*").eq("tenant_id", tenantId!).order("name"),
    ),
  });

  const { data: items = [] } = useQuery({
    queryKey: ["stock_items", tenantId],
    enabled: !!tenantId,
    ...cachedList(`stock_items:${tenantId}`, () =>
      supabase.from("stock_items").select("*").eq("tenant_id", tenantId!).order("name"),
    ),
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements", tenantId],
    enabled: !!tenantId,
    ...cachedList(`stock_movements:${tenantId}`, () =>
      supabase
        .from("stock_movements")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(500),
    ),
  });

  const shown = products.filter((x) => {
    if (filter === "low") return Number(x.stock) <= Number(x.low_stock_threshold ?? 0);
    if (filter === "nomodal") return x.cost == null || Number(x.cost) <= 0;
    return true;
  });

  async function addCategory() {
    if (!tenantId || !newCat.trim()) return;
    const row = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      name: newCat.trim(),
      created_at: new Date().toISOString(),
    };
    const res = await dbInsert("categories", [row]);
    if (!res.ok) {
      toast.error("Gagal menambah kategori", { description: res.error });
      return;
    }
    upsertLocal(qc, ["categories", tenantId], `categories:${tenantId}`, row, false);
    setNewCat("");
    toast.success("Kategori ditambahkan");
  }

  async function uploadImage(file: File) {
    if (!tenantId) return;
    if (!(await requireOnline("Mengunggah foto produk"))) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran gambar maksimal 5 MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: false });
    setUploading(false);
    if (error) {
      toast.error("Gagal mengunggah gambar", { description: error.message });
      return;
    }
    setP((prev) => ({ ...prev, imagePath: path }));
    toast.success("Gambar terunggah");
  }

  function startEdit(x: (typeof products)[number]) {
    setEditingId(x.id);
    setP({
      name: x.name,
      price: String(x.price ?? ""),
      cost: x.cost == null ? "" : String(x.cost),
      stock: String(x.stock ?? ""),
      sku: x.sku ?? "",
      low: String(x.low_stock_threshold ?? 5),
      categoryId: x.category_id ?? "none",
      imagePath: x.image_url ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveProduct() {
    if (!tenantId || !p.name.trim()) {
      toast.error("Nama produk wajib diisi");
      return;
    }
    const costValue = p.cost.trim() === "" ? null : Number(p.cost);
    const payload = {
      name: p.name.trim(),
      price: Number(p.price || 0),
      cost: costValue,
      stock: Number(p.stock || 0),
      sku: p.sku.trim() || null,
      low_stock_threshold: Number(p.low || 0),
      category_id: p.categoryId === "none" ? null : p.categoryId,
      image_url: p.imagePath || null,
    };
    const id = editingId ?? crypto.randomUUID();
    const row = { id, tenant_id: tenantId, created_at: new Date().toISOString(), ...payload };
    const res = editingId ? await dbUpdate("products", editingId, payload) : await dbInsert("products", [row]);
    if (!res.ok) {
      toast.error("Gagal menyimpan", { description: res.error });
      return;
    }
    upsertLocal(qc, ["products", tenantId], `products:${tenantId}`, row, false);
    // Modal terisi → transaksi lama yang belum punya modal ikut diperbarui.
    if (costValue && costValue > 0 && isOnline()) {
      await syncProductCost(tenantId, id, costValue);
      void qc.invalidateQueries({ queryKey: ["dashboard", tenantId] });
      void qc.invalidateQueries({ queryKey: ["transaction_items", tenantId] });
    }
    setP({ ...emptyProduct });
    setEditingId(null);
    void qc.invalidateQueries({ queryKey: ["products", tenantId] });
    toast.success(editingId ? "Produk diperbarui" : "Produk ditambahkan", {
      description: res.queued ? "Tersimpan offline, akan tersinkron saat online." : undefined,
    });
  }

  async function addItem() {
    if (!tenantId || !it.name.trim()) {
      toast.error("Nama bahan wajib diisi");
      return;
    }
    const row = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      name: it.name.trim(),
      kind: it.kind,
      unit: it.unit,
      qty: Number(it.qty || 0),
      min_qty: Number(it.min || 0),
      unit_cost: Number(it.cost || 0),
      supplier: it.supplier.trim() || null,
      created_at: new Date().toISOString(),
    };
    const res = await dbInsert("stock_items", [row]);
    if (!res.ok) {
      toast.error("Gagal menyimpan", { description: res.error });
      return;
    }
    upsertLocal(qc, ["stock_items", tenantId], `stock_items:${tenantId}`, row, false);
    setIt({ name: "", kind: "bahan", unit: "pcs", qty: "", min: "", cost: "", supplier: "" });
    toast.success("Bahan ditambahkan", {
      description: res.queued ? "Tersimpan offline, akan tersinkron saat online." : undefined,
    });
  }

  async function move(itemId: string, direction: "in" | "out", currentQty: number) {
    const raw = await dialog.prompt({
      title: direction === "in" ? "Barang Masuk" : "Barang Keluar",
      label: "Jumlah",
      placeholder: "0",
      inputMode: "decimal",
    });
    if (raw === null) return;
    const qty = Number(raw ?? 0);
    if (!qty) return;
    await dbInsert("stock_movements", [
      {
        id: crypto.randomUUID(),
      tenant_id: tenantId!,
      item_id: itemId,
      direction,
      qty,
      created_by_name: profile?.full_name ?? null,
        created_at: new Date().toISOString(),
      },
    ]);
    const nextQty = direction === "in" ? currentQty + qty : currentQty - qty;
    await dbUpdate("stock_items", itemId, { qty: nextQty });
    upsertLocal(qc, ["stock_items", tenantId], `stock_items:${tenantId}`, { id: itemId, qty: nextQty } as never, false);
  }

  return (
    <AppShell title="Ruang Stok">
      <Tabs defaultValue="produk">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="produk">Produk Jual</TabsTrigger>
          <TabsTrigger value="bahan">Bahan & Alat</TabsTrigger>
        </TabsList>

        <TabsContent value="produk" className="mt-4 space-y-4">
          <div className="grid gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft sm:grid-cols-3">
            <div className="flex items-center justify-between sm:col-span-3">
              <p className="text-sm font-bold">{editingId ? "Edit Produk" : "Tambah Produk"}</p>
              {editingId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setP({ ...emptyProduct });
                  }}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" /> Batal
                </Button>
              )}
            </div>
            <Field label="Nama produk" value={p.name} onChange={(v) => setP({ ...p, name: v })} />
            <Field label="Harga jual" value={p.price} onChange={(v) => setP({ ...p, price: v })} numeric />
            <Field label="Modal/HPP" value={p.cost} onChange={(v) => setP({ ...p, cost: v })} numeric />
            <Field label="Stok" value={p.stock} onChange={(v) => setP({ ...p, stock: v })} numeric />
            <Field label="SKU" value={p.sku} onChange={(v) => setP({ ...p, sku: v })} />
            <Field label="Batas stok menipis" value={p.low} onChange={(v) => setP({ ...p, low: v })} numeric />
            <div className="space-y-1">
              <Label className="text-xs">Kategori</Label>
              <Select value={p.categoryId} onValueChange={(v) => setP({ ...p, categoryId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa kategori</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Kategori baru</Label>
              <div className="flex gap-2">
                <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Mis. Minuman" />
                <Button variant="outline" onClick={() => void addCategory()}>
                  Tambah
                </Button>
              </div>
            </div>

            <div className="space-y-1 sm:col-span-3">
              <Label className="text-xs">Foto produk</Label>
              <div className="flex items-center gap-3">
                <ProductImage path={p.imagePath || null} alt={p.name || "Produk"} className="h-16 w-16 shrink-0" />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f);
                    e.target.value = "";
                  }}
                />
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                  Unggah dari perangkat
                </Button>
                {p.imagePath && (
                  <Button variant="ghost" className="text-destructive" onClick={() => setP({ ...p, imagePath: "" })}>
                    Hapus foto
                  </Button>
                )}
              </div>
            </div>

            <Button onClick={() => void saveProduct()} className="sm:col-span-3">
              <Plus className="mr-2 h-4 w-4" /> {editingId ? "Simpan Perubahan" : "Tambah Produk"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { k: "all", label: "Semua" },
                { k: "low", label: "Stok Tipis" },
                { k: "nomodal", label: "Belum Ada Modal" },
              ] as const
            ).map((f) => (
              <button
                key={f.k}
                onClick={() => void navigate({ search: { filter: f.k } })}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  filter === f.k ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() =>
                downloadCSV(
                  "produk-bucici.csv",
                  shown.map((x) => ({
                    nama: x.name,
                    harga: x.price,
                    modal: x.cost ?? "",
                    stok: x.stock,
                    sku: x.sku ?? "",
                    kategori: categories.find((c) => c.id === x.category_id)?.name ?? "",
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> Unduh CSV
            </Button>
          </div>

          <div className="space-y-2">
            {shown.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada produk pada filter ini.</p>}
            {shown.map((x) => {
              const low = Number(x.stock) <= Number(x.low_stock_threshold ?? 0);
              const noCost = x.cost == null || Number(x.cost) <= 0;
              return (
                <div key={x.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <ProductImage path={x.image_url} alt={x.name} className="h-11 w-11 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{x.name}</p>
                    <p className="num truncate text-xs text-muted-foreground">
                      {rupiah(Number(x.price))} · modal {noCost ? "belum diisi" : rupiah(Number(x.cost))}
                    </p>
                    {noCost && <p className="text-[10px] font-bold text-warning">BELUM ISI MODAL</p>}
                  </div>
                  <div className="text-right">
                    <p className={`num font-bold ${low ? "text-destructive" : "text-foreground"}`}>{num(Number(x.stock))}</p>
                    {low && <p className="text-[10px] font-semibold text-destructive">MENIPIS</p>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => startEdit(x)} aria-label="Edit produk">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    aria-label="Hapus produk"
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        title: "Hapus Produk?",
                        description: `Produk "${x.name}" akan dihapus permanen.`,
                        confirmText: "Hapus",
                        destructive: true,
                      });
                      if (!ok) return;
                      await supabase.from("products").delete().eq("id", x.id);
                      void qc.invalidateQueries({ queryKey: ["products", tenantId] });
                      toast.success("Produk dihapus");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="bahan" className="mt-4 space-y-4">
          <div className="grid gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft sm:grid-cols-3">
            <Field label="Nama bahan/alat" value={it.name} onChange={(v) => setIt({ ...it, name: v })} />
            <Field label="Jenis (bahan/alat)" value={it.kind} onChange={(v) => setIt({ ...it, kind: v })} />
            <Field label="Satuan" value={it.unit} onChange={(v) => setIt({ ...it, unit: v })} />
            <Field label="Jumlah" value={it.qty} onChange={(v) => setIt({ ...it, qty: v })} numeric />
            <Field label="Stok minimum" value={it.min} onChange={(v) => setIt({ ...it, min: v })} numeric />
            <Field label="Harga satuan" value={it.cost} onChange={(v) => setIt({ ...it, cost: v })} numeric />
            <Field label="Pemasok" value={it.supplier} onChange={(v) => setIt({ ...it, supplier: v })} />
            <Button onClick={() => void addItem()} className="sm:col-span-3">
              <Plus className="mr-2 h-4 w-4" /> Tambah Bahan
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCSV(
                  "bahan-alat-bucici.csv",
                  items.map((x) => ({
                    nama: x.name,
                    jenis: x.kind,
                    satuan: x.unit,
                    jumlah: x.qty,
                    minimum: x.min_qty,
                    harga_satuan: x.unit_cost ?? "",
                    pemasok: x.supplier ?? "",
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> Unduh CSV Bahan & Alat
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCSV(
                  "rekap-mutasi-bahan-bucici.csv",
                  movements.map((m) => ({
                    waktu: m.created_at,
                    bahan: items.find((i) => i.id === m.item_id)?.name ?? m.item_id,
                    arah: m.direction === "in" ? "Masuk" : "Keluar",
                    jumlah: m.qty,
                    catatan: m.note ?? "",
                    oleh: m.created_by_name ?? "",
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> Unduh CSV Rekapan Mutasi
            </Button>
          </div>

          <div className="space-y-2">
            {items.map((x) => {
              const low = Number(x.qty) <= Number(x.min_qty ?? 0);
              return (
                <div key={x.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{x.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {x.kind} · {rupiah(Number(x.unit_cost ?? 0))}/{x.unit} · {x.supplier ?? "tanpa pemasok"}
                      </p>
                    </div>
                    <p className={`num shrink-0 font-bold ${low ? "text-destructive" : ""}`}>
                      {num(Number(x.qty))} {x.unit}
                    </p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void move(x.id, "in", Number(x.qty))}>
                      Masuk
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void move(x.id, "out", Number(x.qty))}>
                      Keluar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-destructive"
                      onClick={async () => {
                        await supabase.from("stock_items").delete().eq("id", x.id);
                        void qc.invalidateQueries({ queryKey: ["stock_items", tenantId] });
                      }}
                    >
                      Hapus
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode={numeric ? "decimal" : undefined} />
    </div>
  );
}
