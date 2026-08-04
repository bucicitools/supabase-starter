import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { useAppDialog } from "@/components/app-dialog";
import { dec, parseNum, rupiah } from "@/lib/format";
import { suggestPricing } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/hpp")({
  head: () => ({
    meta: [
      { title: "Hitung HPP — BUCICI" },
      { name: "description", content: "Hitung harga pokok produksi per produk dan dapatkan saran harga jual." },
      { property: "og:title", content: "Hitung HPP — BUCICI" },
      { property: "og:description", content: "Hitung harga pokok produksi dan saran harga jual." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HppPage,
});

type Ing = { name: string; buyPrice: string; buyQty: string; useQty: string; unit: string };

const emptyIng: Ing = { name: "", buyPrice: "", buyQty: "", useQty: "", unit: "gr" };

function ingCost(i: Ing) {
  const buyQty = parseNum(i.buyQty);
  if (!buyQty) return 0;
  return (parseNum(i.buyPrice) * parseNum(i.useQty)) / buyQty;
}

function asIngs(raw: unknown): Ing[] {
  if (!Array.isArray(raw)) return [{ ...emptyIng }];
  return raw.map((x) => ({ ...emptyIng, ...(x as Partial<Ing>) }));
}

function HppPage() {
  const { tenant } = useAuth();
  const dialog = useAppDialog();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const [productName, setProductName] = useState("");
  const [productId, setProductId] = useState<string>("manual");
  const [yieldQty, setYieldQty] = useState("1");
  const [ings, setIngs] = useState<Ing[]>([{ ...emptyIng }]);
  const [advice, setAdvice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id,name,price,cost").eq("tenant_id", tenantId!).order("name");
      return data ?? [];
    },
  });

  const { data: saved = [] } = useQuery({
    queryKey: ["hpp_recipes", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("hpp_recipes")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const totalCost = ings.reduce((s, i) => s + ingCost(i), 0);
  const yieldNum = Math.max(0.0001, parseNum(yieldQty) || 1);
  const hpp = Math.round(totalCost / yieldNum);
  const suggested = Math.ceil((hpp * 1.4) / 500) * 500;

  function resetForm() {
    setProductName("");
    setProductId("manual");
    setYieldQty("1");
    setIngs([{ ...emptyIng }]);
    setEditingId(null);
    setAdvice("");
  }

  function pickProduct(id: string) {
    setProductId(id);
    if (id === "manual") return;
    const p = products.find((x) => x.id === id);
    if (p) setProductName(p.name);
  }

  async function save() {
    if (!tenantId || !productName.trim()) {
      toast.error("Isi nama produk dulu");
      return;
    }
    const payload = {
      tenant_id: tenantId,
      product_name: productName.trim(),
      product_id: productId === "manual" ? null : productId,
      yield_qty: yieldNum,
      ingredients: ings,
      overhead: 0,
      labor: 0,
      hpp,
      suggested_price: suggested,
    };
    const { error } = editingId
      ? await supabase.from("hpp_recipes").update(payload).eq("id", editingId)
      : await supabase.from("hpp_recipes").insert(payload);
    if (error) {
      toast.error("Gagal menyimpan", { description: error.message });
      return;
    }
    // Sinkron ke Produk Jual: HPP jadi harga modal produk.
    if (productId !== "manual") {
      await supabase.from("products").update({ cost: hpp }).eq("id", productId);
      void qc.invalidateQueries({ queryKey: ["products", tenantId] });
    }
    void qc.invalidateQueries({ queryKey: ["hpp_recipes", tenantId] });
    toast.success(editingId ? "Resep diperbarui" : "Resep HPP tersimpan", {
      description: productId !== "manual" ? "Harga modal produk jual ikut diperbarui." : undefined,
    });
    resetForm();
  }

  function startEdit(r: Record<string, unknown>) {
    setEditingId(String(r["id"]));
    setProductName(String(r["product_name"] ?? ""));
    setProductId(r["product_id"] ? String(r["product_id"]) : "manual");
    setYieldQty(String(r["yield_qty"] ?? 1));
    setIngs(asIngs(r["ingredients"]));
    setAdvice("");
    setDetail(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeRecipe(id: string, name: string) {
    const ok = await dialog.confirm({
      title: "Hapus Resep?",
      description: `Resep "${name}" akan dihapus permanen.`,
      confirmText: "Hapus",
      destructive: true,
    });
    if (!ok) return;
    await supabase.from("hpp_recipes").delete().eq("id", id);
    if (editingId === id) resetForm();
    setDetail(null);
    void qc.invalidateQueries({ queryKey: ["hpp_recipes", tenantId] });
    toast.success("Resep dihapus");
  }

  async function askAI() {
    setBusy(true);
    setAdvice("");
    const res = await suggestPricing({
      data: {
        productName: productName.trim() || "Produk",
        hpp,
        ingredients: ings
          .map((i) => `${i.name}: beli Rp${parseNum(i.buyPrice)} per ${i.buyQty}${i.unit}, dipakai ${i.useQty}${i.unit} = Rp${Math.round(ingCost(i))}`)
          .join("; "),
        market: tenant?.business_name ?? "",
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setAdvice(res.text);
  }

  const detailIngs = detail ? asIngs(detail["ingredients"]) : [];

  return (
    <AppShell title="Hitung HPP">
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        {editingId && (
          <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
            Mode edit resep
            <button onClick={resetForm} className="text-muted-foreground">
              Batal edit
            </button>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Ambil dari Produk Jual</Label>
            <Select value={productId} onValueChange={pickProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Manual / baru" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual / produk baru</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nama produk</Label>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Mis. Es Kopi Susu" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasil (porsi/pcs)</Label>
            <Input value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} inputMode="decimal" />
          </div>
        </div>
        {productId !== "manual" && (
          <p className="-mt-1 text-[11px] text-muted-foreground">
            HPP akan otomatis tersimpan sebagai harga modal produk jual ini.
          </p>
        )}

        <p className="pt-2 text-sm font-semibold">Rincian bahan (murni harga bahan)</p>
        <p className="-mt-2 text-xs text-muted-foreground">
          Contoh: garam beli Rp3.000 dapat 250 gr, dipakai 10 gr. Atau ayam Rp32.000 per 1 ekor, dipakai 1/9 ekor.
          Kolom angka mendukung desimal (2,5) dan pecahan (1/9, 2/3, 1 1/2).
        </p>
        {ings.map((ing, i) => (
          <div key={i} className="space-y-1.5 rounded-xl border border-border/70 p-3">
            <div className="flex gap-1.5">
              <Input
                placeholder="Nama bahan"
                value={ing.name}
                onChange={(e) => setIngs(ings.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))}
              />
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 text-destructive"
                aria-label="Hapus bahan"
                onClick={() => setIngs(ings.length === 1 ? [{ ...emptyIng }] : ings.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-[11px]">Harga beli</Label>
                <Input
                  inputMode="decimal"
                  placeholder="3000"
                  value={ing.buyPrice}
                  onChange={(e) => setIngs(ings.map((x, j) => (i === j ? { ...x, buyPrice: e.target.value } : x)))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Dapat (jumlah)</Label>
                <Input
                  inputMode="decimal"
                  placeholder="250"
                  value={ing.buyQty}
                  onChange={(e) => setIngs(ings.map((x, j) => (i === j ? { ...x, buyQty: e.target.value } : x)))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Pemakaian</Label>
                <Input
                  inputMode="text"
                  placeholder="10 atau 1/9"
                  value={ing.useQty}
                  onChange={(e) => setIngs(ings.map((x, j) => (i === j ? { ...x, useQty: e.target.value } : x)))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Satuan</Label>
                <Input
                  placeholder="gr / ekor"
                  value={ing.unit}
                  onChange={(e) => setIngs(ings.map((x, j) => (i === j ? { ...x, unit: e.target.value } : x)))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Pemakaian {dec(parseNum(ing.useQty), 4)} {ing.unit} ={" "}
              <span className="font-semibold text-primary">{rupiah(Math.round(ingCost(ing)))}</span>
            </p>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setIngs([...ings, { ...emptyIng }])}>
          <Plus className="mr-2 h-4 w-4" /> Tambah bahan
        </Button>

        <div className="rounded-xl bg-muted p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total biaya bahan</span>
            <span className="num font-medium">{rupiah(totalCost)}</span>
          </div>
          <div className="flex justify-between text-base font-bold">
            <span>HPP per unit</span>
            <span className="num text-primary">{rupiah(hpp)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saran harga jual (margin 40%)</span>
            <span className="num font-medium">{rupiah(suggested)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => void save()}>{editingId ? "Perbarui Resep" : "Simpan Resep"}</Button>
          <Button variant="outline" onClick={() => void askAI()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Saran AI
          </Button>
        </div>
      </div>

      {advice && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="h-4 w-4" /> Saran AI
            </p>
            <button onClick={() => setAdvice("")} aria-label="Tutup saran" className="text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none break-words p-4 prose-headings:mt-3 prose-headings:text-base prose-p:my-2 prose-li:my-0.5 prose-table:my-3 prose-td:px-2 prose-td:py-1 prose-th:px-2 prose-th:py-1">
            <div className="x-scroll -mx-1 px-1 [&_table]:w-full [&_table]:min-w-[520px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{advice}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">Resep Tersimpan</h2>
      <div className="space-y-2">
        {saved.length === 0 && <p className="text-sm text-muted-foreground">Belum ada resep tersimpan.</p>}
        {saved.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <button className="min-w-0 flex-1 text-left" onClick={() => setDetail(r as unknown as Record<string, unknown>)}>
              <p className="truncate font-semibold">{r.product_name}</p>
              <p className="num text-xs text-muted-foreground">
                HPP {rupiah(Number(r.hpp))} · saran jual {rupiah(Number(r.suggested_price ?? 0))}
              </p>
            </button>
            <Button size="icon" variant="ghost" aria-label="Edit resep" onClick={() => startEdit(r as unknown as Record<string, unknown>)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive"
              aria-label="Hapus resep"
              onClick={() => void removeRecipe(r.id, r.product_name)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-[420px] overflow-y-auto rounded-3xl">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-bold">{String(detail?.["product_name"] ?? "")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground">Hasil {String(detail?.["yield_qty"] ?? 1)} porsi/pcs</p>
            <div className="x-scroll rounded-xl border border-border">
              <table className="w-full min-w-[420px] text-xs">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-2 py-1.5">Bahan</th>
                    <th className="px-2 py-1.5">Harga beli</th>
                    <th className="px-2 py-1.5">Dapat</th>
                    <th className="px-2 py-1.5">Pakai</th>
                    <th className="px-2 py-1.5 text-right">Biaya</th>
                  </tr>
                </thead>
                <tbody>
                  {detailIngs.map((i, k) => (
                    <tr key={k} className="border-t border-border">
                      <td className="px-2 py-1.5">{i.name || "—"}</td>
                      <td className="num px-2 py-1.5">{rupiah(parseNum(i.buyPrice))}</td>
                      <td className="num px-2 py-1.5">
                        {i.buyQty} {i.unit}
                      </td>
                      <td className="num px-2 py-1.5">
                        {i.useQty} {i.unit}
                      </td>
                      <td className="num px-2 py-1.5 text-right font-semibold">{rupiah(Math.round(ingCost(i)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between rounded-xl bg-muted p-3 text-sm font-bold">
              <span>HPP per unit</span>
              <span className="num text-primary">{rupiah(Number(detail?.["hpp"] ?? 0))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Saran harga jual</span>
              <span className="num font-medium">{rupiah(Number(detail?.["suggested_price"] ?? 0))}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" onClick={() => setDetail(null)}>
                <X className="mr-2 h-4 w-4" /> Tutup
              </Button>
              <Button onClick={() => detail && startEdit(detail)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit Resep
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
