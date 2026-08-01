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
import { rupiah } from "@/lib/format";
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

type Ing = { name: string; qty: string; unit: string; price: string };

function HppPage() {
  const { tenant } = useAuth();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const [productName, setProductName] = useState("");
  const [yieldQty, setYieldQty] = useState("1");
  const [overhead, setOverhead] = useState("0");
  const [labor, setLabor] = useState("0");
  const [ings, setIngs] = useState<Ing[]>([{ name: "", qty: "", unit: "gr", price: "" }]);
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

  const bahanTotal = ings.reduce((s, i) => s + Number(i.price || 0), 0);
  const totalCost = bahanTotal + Number(overhead || 0) + Number(labor || 0);
  const yieldNum = Math.max(1, Number(yieldQty || 1));
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
      overhead: Number(overhead || 0),
      labor: Number(labor || 0),
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
        ingredients: ings.map((i) => `${i.name} ${i.qty}${i.unit} = Rp${i.price}`).join("; "),
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

        <p className="pt-2 text-sm font-semibold">Rincian bahan</p>
        {ings.map((ing, i) => (
          <div key={i} className="grid grid-cols-[1.4fr_0.7fr_0.6fr_1fr_auto] items-end gap-1.5">
            <Input
              placeholder="Bahan"
              value={ing.name}
              onChange={(e) => setIngs(ings.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))}
            />
            <Input
              placeholder="Qty"
              inputMode="numeric"
              value={ing.qty}
              onChange={(e) => setIngs(ings.map((x, j) => (i === j ? { ...x, qty: e.target.value } : x)))}
            />
            <Input
              placeholder="Sat"
              value={ing.unit}
              onChange={(e) => setIngs(ings.map((x, j) => (i === j ? { ...x, unit: e.target.value } : x)))}
            />
            <Input
              placeholder="Harga"
              inputMode="numeric"
              value={ing.price}
              onChange={(e) => setIngs(ings.map((x, j) => (i === j ? { ...x, price: e.target.value } : x)))}
            />
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive"
              onClick={() => setIngs(ings.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setIngs([...ings, { name: "", qty: "", unit: "gr", price: "" }])}>
          <Plus className="mr-2 h-4 w-4" /> Tambah bahan
        </Button>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Biaya operasional (gas, listrik, kemasan)</Label>
            <Input value={overhead} onChange={(e) => setOverhead(e.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Upah tenaga kerja</Label>
            <Input value={labor} onChange={(e) => setLabor(e.target.value)} inputMode="numeric" />
          </div>
        </div>

        <div className="rounded-xl bg-muted p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total biaya</span>
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