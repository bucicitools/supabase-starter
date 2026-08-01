import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Minus, Plus, Search, Trash2, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { dateTimeID, downloadCSV, rupiah, txCode } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/kasir")({
  head: () => ({
    meta: [
      { title: "Kasir — BUCICI" },
      { name: "description", content: "Catat transaksi penjualan, cetak struk, dan pantau riwayat." },
      { property: "og:title", content: "Kasir — BUCICI" },
      { property: "og:description", content: "Catat transaksi penjualan dan cetak struk." },
    ],
  }),
  component: KasirPage,
});

type CartLine = { productId: string | null; name: string; price: number; cost: number; qty: number };

function KasirPage() {
  const { tenant, profile } = useAuth();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [q, setQ] = useState("");
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState("0");
  const [discPercent, setDiscPercent] = useState(false);
  const [taxPercent, setTaxPercent] = useState(String(tenant?.default_tax ?? 0));
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("Tunai");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<null | {
    code: string;
    at: string;
    lines: CartLine[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paid: number;
    change: number;
    customer: string;
    method: string;
    status: string;
  }>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,price,cost,stock,sku")
        .eq("tenant_id", tenantId!)
        .order("name");
      return data ?? [];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["transactions", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const filtered = useMemo(
    () =>
      products.filter((p) =>
        [p.name, p.sku ?? ""].join(" ").toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [products, q],
  );

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const discountAmount = discPercent
    ? Math.round((subtotal * Number(discount || 0)) / 100)
    : Number(discount || 0);
  const afterDisc = Math.max(0, subtotal - discountAmount);
  const taxAmount = Math.round((afterDisc * Number(taxPercent || 0)) / 100);
  const total = afterDisc + taxAmount;
  const paidNum = Number(paid || 0);
  const change = Math.max(0, paidNum - total);

  function addProduct(p: (typeof products)[number]) {
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id);
      if (i >= 0) {
        const next = [...c];
        next[i] = { ...next[i]!, qty: next[i]!.qty + 1 };
        return next;
      }
      return [
        ...c,
        { productId: p.id, name: p.name, price: Number(p.price), cost: Number(p.cost ?? 0), qty: 1 },
      ];
    });
  }

  function setQty(idx: number, qty: number) {
    setCart((c) => (qty <= 0 ? c.filter((_, i) => i !== idx) : c.map((l, i) => (i === idx ? { ...l, qty } : l))));
  }

  async function checkout(status: "paid" | "unpaid") {
    if (!tenantId || cart.length === 0) {
      toast.error("Keranjang masih kosong");
      return;
    }
    setSaving(true);
    const code = txCode();
    const { data: tx, error } = await supabase
      .from("transactions")
      .insert({
        tenant_id: tenantId,
        code,
        customer_name: customer.trim() || null,
        note: note.trim() || null,
        subtotal,
        discount_value: Number(discount || 0),
        discount_is_percent: discPercent,
        discount_amount: discountAmount,
        tax_percent: Number(taxPercent || 0),
        tax_amount: taxAmount,
        total,
        paid_amount: status === "paid" ? paidNum || total : 0,
        change_amount: status === "paid" ? change : 0,
        payment_method: method,
        status,
        cashier_id: profile?.id ?? null,
        cashier_name: profile?.full_name ?? null,
        paid_at: status === "paid" ? new Date().toISOString() : null,
      })
      .select("id,code,created_at")
      .single();

    if (error || !tx) {
      setSaving(false);
      toast.error("Gagal menyimpan transaksi", { description: error?.message });
      return;
    }

    await supabase.from("transaction_items").insert(
      cart.map((l) => ({
        transaction_id: tx.id,
        tenant_id: tenantId,
        product_id: l.productId,
        name: l.name,
        qty: l.qty,
        price: l.price,
        cost: l.cost,
      })),
    );

    for (const l of cart) {
      if (!l.productId) continue;
      const p = products.find((x) => x.id === l.productId);
      if (p) {
        await supabase
          .from("products")
          .update({ stock: Number(p.stock ?? 0) - l.qty })
          .eq("id", l.productId);
      }
    }

    setReceipt({
      code: tx.code,
      at: tx.created_at,
      lines: cart,
      subtotal,
      discount: discountAmount,
      tax: taxAmount,
      total,
      paid: status === "paid" ? paidNum || total : 0,
      change: status === "paid" ? change : 0,
      customer: customer.trim(),
      method,
      status: status === "paid" ? "LUNAS" : "HUTANG",
    });
    setCart([]);
    setCustomer("");
    setNote("");
    setDiscount("0");
    setPaid("");
    setSaving(false);
    void qc.invalidateQueries();
    toast.success("Transaksi tersimpan", { description: tx.code });
  }

  async function markPaid(id: string, amount: number) {
    await supabase
      .from("transactions")
      .update({ status: "paid", paid_amount: amount, paid_at: new Date().toISOString() })
      .eq("id", id);
    void qc.invalidateQueries({ queryKey: ["transactions", tenantId] });
    toast.success("Ditandai lunas");
  }

  async function voidTx(id: string) {
    const reason = window.prompt("Alasan pembatalan?") ?? "";
    await supabase.from("transactions").update({ status: "void", void_note: reason }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["transactions", tenantId] });
    toast.success("Transaksi dibatalkan");
  }

  function shareReceipt() {
    if (!receipt) return;
    const text = [
      tenant?.receipt_header ?? tenant?.business_name ?? "BUCICI",
      tenant?.receipt_address ?? "",
      `No: ${receipt.code}`,
      dateTimeID(receipt.at),
      "-------------------------",
      ...receipt.lines.map((l) => `${l.name} x${l.qty}  ${rupiah(l.price * l.qty)}`),
      "-------------------------",
      `Subtotal: ${rupiah(receipt.subtotal)}`,
      receipt.discount ? `Diskon: -${rupiah(receipt.discount)}` : "",
      receipt.tax ? `Pajak: ${rupiah(receipt.tax)}` : "",
      `TOTAL: ${rupiah(receipt.total)}`,
      `Bayar: ${rupiah(receipt.paid)} (${receipt.method})`,
      `Kembali: ${rupiah(receipt.change)}`,
      `Status: ${receipt.status}`,
      tenant?.receipt_footer ?? "Terima kasih 🙏",
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  return (
    <AppShell title="Kasir">
      <Tabs defaultValue="pos">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pos">Transaksi</TabsTrigger>
          <TabsTrigger value="history">Riwayat</TabsTrigger>
        </TabsList>

        <TabsContent value="pos" className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari produk…"
                className="h-10 pl-9"
              />
            </div>
            <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="rounded-xl border border-border bg-card p-3 text-left shadow-soft transition hover:border-primary"
                >
                  <p className="line-clamp-2 text-sm font-semibold">{p.name}</p>
                  <p className="mt-1 text-sm font-bold text-primary">{rupiah(Number(p.price))}</p>
                  <p className="text-xs text-muted-foreground">Stok {Number(p.stock ?? 0)}</p>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                  Belum ada produk. Tambahkan lewat menu Stok.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <p className="font-bold">Keranjang</p>
            {cart.length === 0 && <p className="text-sm text-muted-foreground">Belum ada item.</p>}
            {cart.map((l, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-border/60 pb-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">{rupiah(l.price)}</p>
                </div>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(i, l.qty - 1)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-6 text-center text-sm font-semibold">{l.qty}</span>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(i, l.qty + 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setQty(i, 0)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Diskon</Label>
                <div className="flex gap-1">
                  <Input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="numeric" />
                  <Button
                    type="button"
                    variant={discPercent ? "default" : "outline"}
                    className="w-12 shrink-0"
                    onClick={() => setDiscPercent((v) => !v)}
                  >
                    {discPercent ? "%" : "Rp"}
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Pajak (%)</Label>
                <Input value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} inputMode="numeric" />
              </div>
              <div>
                <Label className="text-xs">Nama pembeli</Label>
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Opsional" />
              </div>
              <div>
                <Label className="text-xs">Metode</Label>
                <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Tunai / QRIS" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Uang dibayar</Label>
                <Input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="numeric" placeholder="0" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Catatan</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
              </div>
            </div>

            <div className="space-y-1 rounded-xl bg-muted p-3 text-sm">
              <Row label="Subtotal" value={rupiah(subtotal)} />
              <Row label="Diskon" value={"-" + rupiah(discountAmount)} />
              <Row label="Pajak" value={rupiah(taxAmount)} />
              <div className="flex justify-between border-t border-border pt-1 text-base font-bold">
                <span>Total</span>
                <span className="text-primary">{rupiah(total)}</span>
              </div>
              <Row label="Kembalian" value={rupiah(change)} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button disabled={saving} onClick={() => void checkout("paid")} className="h-12 font-semibold">
                Bayar Lunas
              </Button>
              <Button
                disabled={saving}
                variant="outline"
                onClick={() => void checkout("unpaid")}
                className="h-12 font-semibold"
              >
                Hutang
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          <Button
            variant="outline"
            onClick={() =>
              downloadCSV(
                "transaksi-bucici.csv",
                history.map((t) => ({
                  kode: t.code,
                  tanggal: dateTimeID(t.created_at),
                  pembeli: t.customer_name ?? "",
                  total: t.total,
                  status: t.status,
                  metode: t.payment_method ?? "",
                  kasir: t.cashier_name ?? "",
                })),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Unduh CSV
          </Button>
          {history.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t.code}</p>
                  <p className="text-xs text-muted-foreground">{dateTimeID(t.created_at)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.customer_name || "Umum"} · {t.payment_method ?? "-"} · {t.cashier_name ?? "-"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">{rupiah(Number(t.total))}</p>
                  <span
                    className={`text-xs font-semibold ${
                      t.status === "paid"
                        ? "text-success"
                        : t.status === "unpaid"
                          ? "text-warning"
                          : "text-destructive"
                    }`}
                  >
                    {t.status === "paid" ? "Lunas" : t.status === "unpaid" ? "Hutang" : "Batal"}
                  </span>
                </div>
              </div>
              {t.status !== "void" && (
                <div className="mt-3 flex gap-2">
                  {t.status === "unpaid" && (
                    <Button size="sm" onClick={() => void markPaid(t.id, Number(t.total))}>
                      Tandai Lunas
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => void voidTx(t.id)}>
                    Batalkan
                  </Button>
                </div>
              )}
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Struk Transaksi</DialogTitle>
          </DialogHeader>
          {receipt && (
            <div ref={receiptRef} className="rounded-xl bg-white p-4 font-mono text-[11px] leading-5 text-black">
              <p className="text-center text-sm font-bold">
                {tenant?.receipt_header || tenant?.business_name || "BUCICI"}
              </p>
              {tenant?.receipt_address && <p className="text-center">{tenant.receipt_address}</p>}
              {tenant?.receipt_phone && <p className="text-center">{tenant.receipt_phone}</p>}
              <p className="my-2 border-y border-dashed border-black/40 py-1">
                {receipt.code}
                <br />
                {dateTimeID(receipt.at)}
                {receipt.customer && (
                  <>
                    <br />
                    Pembeli: {receipt.customer}
                  </>
                )}
              </p>
              {receipt.lines.map((l, i) => (
                <div key={i} className="flex justify-between">
                  <span className="pr-2">
                    {l.name} x{l.qty}
                  </span>
                  <span>{rupiah(l.price * l.qty)}</span>
                </div>
              ))}
              <div className="mt-2 border-t border-dashed border-black/40 pt-1">
                <Row label="Subtotal" value={rupiah(receipt.subtotal)} />
                <Row label="Diskon" value={"-" + rupiah(receipt.discount)} />
                <Row label="Pajak" value={rupiah(receipt.tax)} />
                <div className="flex justify-between font-bold">
                  <span>TOTAL</span>
                  <span>{rupiah(receipt.total)}</span>
                </div>
                <Row label={`Bayar (${receipt.method})`} value={rupiah(receipt.paid)} />
                <Row label="Kembali" value={rupiah(receipt.change)} />
                <Row label="Status" value={receipt.status} />
              </div>
              <p className="mt-3 text-center">{tenant?.receipt_footer || "Terima kasih 🙏"}</p>
              {tenant?.receipt_extra && <p className="text-center">{tenant.receipt_extra}</p>}
            </div>
          )}
          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Cetak
            </Button>
            <Button onClick={shareReceipt}>
              <Share2 className="mr-2 h-4 w-4" /> Bagikan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}