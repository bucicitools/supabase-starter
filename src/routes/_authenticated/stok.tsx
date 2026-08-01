import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { downloadCSV, num, rupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/stok")({
  head: () => ({
    meta: [
      { title: "Stok — BUCICI" },
      { name: "description", content: "Kelola produk jual, bahan baku, dan peringatan stok menipis." },
      { property: "og:title", content: "Stok — BUCICI" },
      { property: "og:description", content: "Kelola produk jual dan bahan baku." },
    ],
  }),
  component: StokPage,
});

function StokPage() {
  const { tenant, profile } = useAuth();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const [p, setP] = useState({ name: "", price: "", cost: "", stock: "", sku: "", low: "5", categoryId: "none" });
  const [newCat, setNewCat] = useState("");
  const [it, setIt] = useState({ name: "", kind: "bahan", unit: "pcs", qty: "", min: "", cost: "", supplier: "" });

  const { data: products = [] } = useQuery({
    queryKey: ["products", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("tenant_id", tenantId!).order("name");
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("tenant_id", tenantId!).order("name");
      return data ?? [];
    },
  });

  async function addCategory() {
    if (!tenantId || !newCat.trim()) return;
    const { error } = await supabase.from("categories").insert({ tenant_id: tenantId, name: newCat.trim() });
    if (error) {
      toast.error("Gagal menambah kategori", { description: error.message });
      return;
    }
    setNewCat("");
    void qc.invalidateQueries({ queryKey: ["categories", tenantId] });
    toast.success("Kategori ditambahkan");
  }

  const { data: items = [] } = useQuery({
    queryKey: ["stock_items", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("stock_items").select("*").eq("tenant_id", tenantId!).order("name");
      return data ?? [];
    },
  });

  async function addProduct() {
    if (!tenantId || !p.name.trim()) {
      toast.error("Nama produk wajib diisi");
      return;
    }
    const { error } = await supabase.from("products").insert({
      tenant_id: tenantId,
      name: p.name.trim(),
      price: Number(p.price || 0),
      cost: Number(p.cost || 0),
      stock: Number(p.stock || 0),
      sku: p.sku.trim() || null,
      low_stock_threshold: Number(p.low || 0),
      category_id: p.categoryId === "none" ? null : p.categoryId,
    });
    if (error) {
      toast.error("Gagal menyimpan", { description: error.message });
      return;
    }
    setP({ name: "", price: "", cost: "", stock: "", sku: "", low: "5", categoryId: "none" });
    void qc.invalidateQueries({ queryKey: ["products", tenantId] });
    toast.success("Produk ditambahkan");
  }

  async function addItem() {
    if (!tenantId || !it.name.trim()) {
      toast.error("Nama bahan wajib diisi");
      return;
    }
    const { error } = await supabase.from("stock_items").insert({
      tenant_id: tenantId,
      name: it.name.trim(),
      kind: it.kind,
      unit: it.unit,
      qty: Number(it.qty || 0),
      min_qty: Number(it.min || 0),
      unit_cost: Number(it.cost || 0),
      supplier: it.supplier.trim() || null,
    });
    if (error) {
      toast.error("Gagal menyimpan", { description: error.message });
      return;
    }
    setIt({ name: "", kind: "bahan", unit: "pcs", qty: "", min: "", cost: "", supplier: "" });
    void qc.invalidateQueries({ queryKey: ["stock_items", tenantId] });
    toast.success("Bahan ditambahkan");
  }

  async function move(itemId: string, direction: "in" | "out", currentQty: number) {
    const raw = window.prompt(direction === "in" ? "Jumlah masuk?" : "Jumlah keluar?");
    const qty = Number(raw ?? 0);
    if (!qty) return;
    await supabase.from("stock_movements").insert({
      tenant_id: tenantId!,
      item_id: itemId,
      direction,
      qty,
      created_by_name: profile?.full_name ?? null,
    });
    await supabase
      .from("stock_items")
      .update({ qty: direction === "in" ? currentQty + qty : currentQty - qty })
      .eq("id", itemId);
    void qc.invalidateQueries({ queryKey: ["stock_items", tenantId] });
  }

  return (
    <AppShell title="Stok">
      <Tabs defaultValue="produk">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="produk">Produk Jual</TabsTrigger>
          <TabsTrigger value="bahan">Bahan & Alat</TabsTrigger>
        </TabsList>

        <TabsContent value="produk" className="mt-4 space-y-4">
          <div className="grid gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft sm:grid-cols-3">
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
            <Button onClick={() => void addProduct()} className="sm:col-span-3">
              <Plus className="mr-2 h-4 w-4" /> Tambah Produk
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={() =>
              downloadCSV(
                "produk-bucici.csv",
                products.map((x) => ({
                  nama: x.name,
                  harga: x.price,
                  modal: x.cost,
                  stok: x.stock,
                  sku: x.sku ?? "",
                  kategori: categories.find((c) => c.id === x.category_id)?.name ?? "",
                })),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Unduh CSV
          </Button>

          <div className="space-y-2">
            {products.map((x) => {
              const low = Number(x.stock) <= Number(x.low_stock_threshold ?? 0);
              return (
                <div
                  key={x.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Package className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{x.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {rupiah(Number(x.price))} · modal {rupiah(Number(x.cost ?? 0))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${low ? "text-destructive" : "text-foreground"}`}>
                      {num(Number(x.stock))}
                    </p>
                    {low && <p className="text-[10px] font-semibold text-destructive">MENIPIS</p>}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      await supabase.from("products").delete().eq("id", x.id);
                      void qc.invalidateQueries({ queryKey: ["products", tenantId] });
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

          <Button
            variant="outline"
            onClick={() =>
              downloadCSV(
                "bahan-alat-bucici.csv",
                items.map((x) => ({
                  nama: x.name,
                  jenis: x.kind,
                  satuan: x.unit,
                  jumlah: x.qty,
                  minimum: x.min_qty,
                  harga_satuan: x.unit_cost,
                  pemasok: x.supplier ?? "",
                })),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Unduh CSV
          </Button>

          <div className="space-y-2">
            {items.map((x) => {
              const low = Number(x.qty) <= Number(x.min_qty ?? 0);
              return (
                <div key={x.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{x.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {x.kind} · {rupiah(Number(x.unit_cost ?? 0))}/{x.unit} · {x.supplier ?? "tanpa pemasok"}
                      </p>
                    </div>
                    <p className={`font-bold ${low ? "text-destructive" : ""}`}>
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
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={numeric ? "numeric" : undefined}
      />
    </div>
  );
}