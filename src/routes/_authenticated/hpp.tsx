import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { dec, parseNum, rupiah } from "@/lib/format";
import { suggestPricing } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/hpp")({
  head: () => ({
    meta: [
      { title: "Hitung HPP — BUCICI" },
      { name: "description", content: "Hitung harga pokok produksi per produk dan dapatkan saran harga jual." },
      { property: "og:title", content: "Hitung HPP — BUCICI" },
      { property: "og:description", content: "Hitung harga pokok produksi dan saran harga jual." },
    ],
  }),
  component: HppPage,
});

type Ing = { name: string; buyPrice: string; buyQty: string; useQty: string; unit: string };

function ingCost(i: Ing) {
  const buyQty = parseNum(i.buyQty);
  if (!buyQty) return 0;
  return (parseNum(i.buyPrice) * parseNum(i.useQty)) / buyQty;
}

function HppPage() {
  const { tenant } = useAuth();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const [productName, setProductName] = useState("");
  const [yieldQty, setYieldQty] = useState("1");
  const [ings, setIngs] = useState<Ing[]>([{ name: "", buyPrice: "", buyQty: "", useQty: "", unit: "gr" }]);
  const [advice, setAdvice] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function save() {
    if (!tenantId || !productName.trim()) {
      toast.error("Isi nama produk dulu");
      return;
    }
    const { error } = await supabase.from("hpp_recipes").insert({
      tenant_id: tenantId,
      product_name: productName.trim(),
      yield_qty: yieldNum,
      ingredients: ings,
      overhead: 0,
      labor: 0,
      hpp,
      suggested_price: Math.ceil((hpp * 1.4) / 500) * 500,
    });
    if (error) {
      toast.error("Gagal menyimpan", { description: error.message });
      return;
    }
    void qc.invalidateQueries({ queryKey: ["hpp_recipes", tenantId] });
    toast.success("Resep HPP tersimpan");
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

  return (
    <AppShell title="Hitung HPP">
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Nama produk</Label>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Mis. Es Kopi Susu" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasil (porsi/pcs)</Label>
            <Input value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} inputMode="numeric" />
          </div>
        </div>

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
                onClick={() => setIngs(ings.filter((_, j) => j !== i))}
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIngs([...ings, { name: "", buyPrice: "", buyQty: "", useQty: "", unit: "gr" }])}
        >
          <Plus className="mr-2 h-4 w-4" /> Tambah bahan
        </Button>

        <div className="rounded-xl bg-muted p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total biaya bahan</span>
            <span className="font-medium">{rupiah(totalCost)}</span>
          </div>
          <div className="flex justify-between text-base font-bold">
            <span>HPP per unit</span>
            <span className="text-primary">{rupiah(hpp)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saran harga jual (margin 40%)</span>
            <span className="font-medium">{rupiah(Math.ceil((hpp * 1.4) / 500) * 500)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => void save()}>Simpan Resep</Button>
          <Button variant="outline" onClick={() => void askAI()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Saran AI
          </Button>
        </div>
      </div>

      {advice && (
        <div className="prose prose-sm dark:prose-invert mt-4 max-w-none rounded-2xl border border-border bg-card p-4 shadow-soft">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{advice}</ReactMarkdown>
        </div>
      )}

      <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">Resep Tersimpan</h2>
      <div className="space-y-2">
        {saved.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.product_name}</p>
              <p className="text-xs text-muted-foreground">
                HPP {rupiah(Number(r.hpp))} · saran jual {rupiah(Number(r.suggested_price ?? 0))}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                await supabase.from("hpp_recipes").delete().eq("id", r.id);
                void qc.invalidateQueries({ queryKey: ["hpp_recipes", tenantId] });
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </AppShell>
  );
}