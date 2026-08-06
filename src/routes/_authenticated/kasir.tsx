import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Banknote,
  Download,
  History,
  LayoutGrid,
  List,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { dateTimeID, downloadCSV, rupiah, txCode, parseNum, num, thousands, digitsOnly } from "@/lib/format";
import { cachedList, dbInsert, dbUpdate, patchLocal, upsertLocal } from "@/lib/offline";
import { Receipt, StatusBadge, type ReceiptData } from "@/components/Receipt";
import { ReceiptActions } from "@/components/ReceiptActions";
import { ProductImage } from "@/components/ProductImage";
import { useAppDialog } from "@/components/app-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/kasir")({
  head: () => ({
    meta: [
      { title: "Ruang Kasir — BUCICI" },
      { name: "description", content: "POS, uang di laci, riwayat transaksi, dan rekapan penjualan harian." },
      { property: "og:title", content: "Ruang Kasir — BUCICI" },
      { property: "og:description", content: "POS, uang di laci, riwayat, dan rekapan penjualan." },
    ],
  }),
  component: KasirPage,
});

type CartLine = { productId: string | null; name: string; price: number; cost: number; qty: number };
type TabKey = "pos" | "kas" | "riwayat" | "rekap";

const TABS: { key: TabKey; label: string; icon: typeof ShoppingCart }[] = [
  { key: "pos", label: "POS", icon: ShoppingCart },
  { key: "kas", label: "Kas Laci", icon: Banknote },
  { key: "riwayat", label: "Riwayat", icon: History },
  { key: "rekap", label: "Rekapan", icon: BarChart3 },
];

const METHODS = ["CASH", "QRIS", "TRANSFER"] as const;
const QUICK = [5000, 10000, 20000, 50000, 100000];

function KasirPage() {
  const { tenant, profile } = useAuth();
  const dialog = useAppDialog();
  const qc = useQueryClient();
  const tenantId = tenant?.id;
  const [tab, setTab] = useState<TabKey>("pos");

  /* ---------------- data ---------------- */
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

  const { data: history = [] } = useQuery({
    queryKey: ["transactions", tenantId],
    enabled: !!tenantId,
    ...cachedList(`transactions:${tenantId}`, () =>
      supabase
        .from("transactions")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(500),
    ),
  });

  const { data: cash = [] } = useQuery({
    queryKey: ["cash_entries", tenantId],
    enabled: !!tenantId,
    ...cachedList(`cash_entries:${tenantId}`, () =>
      supabase
        .from("cash_entries")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(500),
    ),
  });

  /* ---------------- POS state ---------------- */
  const [cart, setCart] = useState<CartLine[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState("0");
  const [discPercent, setDiscPercent] = useState(false);
  const [useTax, setUseTax] = useState(Number(tenant?.default_tax ?? 0) > 0);
  const [taxPercent, setTaxPercent] = useState(String(tenant?.default_tax ?? 0));
  const [payNow, setPayNow] = useState(true);
  const [method, setMethod] = useState<string>("CASH");
  const [paid, setPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [settling, setSettling] = useState<(typeof history)[number] | null>(null);
  const [view, setView] = useState<"card" | "list">("card");
  const [hit, setHit] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({});
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const qtyInCart = (id: string) => cart.find((l) => l.productId === id)?.qty ?? 0;

  // Pajak default toko: saat pengaturan pajak ON (default_tax > 0), centang otomatis.
  const defaultTax = Number(tenant?.default_tax ?? 0);
  useEffect(() => {
    setTaxPercent(String(defaultTax));
    setUseTax(defaultTax > 0);
  }, [defaultTax]);

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        const okCat = cat === "all" || p.category_id === cat;
        const okQ = [p.name, p.sku ?? ""].join(" ").toLowerCase().includes(q.trim().toLowerCase());
        return okCat && okQ;
      }),
    [products, q, cat],
  );

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const discountAmount = discPercent
    ? Math.round((subtotal * parseNum(discount)) / 100)
    : Math.round(parseNum(discount));
  const afterDisc = Math.max(0, subtotal - discountAmount);
  const taxAmount = useTax ? Math.round((afterDisc * parseNum(taxPercent)) / 100) : 0;
  const total = afterDisc + taxAmount;
  const paidNum = parseNum(paid);
  const change = Math.max(0, paidNum - total);

  function addProduct(p: (typeof products)[number]) {
    setHit(p.id);
    if (hitTimer.current) clearTimeout(hitTimer.current);
    hitTimer.current = setTimeout(() => setHit(null), 260);
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id);
      if (i >= 0) {
        const next = [...c];
        next[i] = { ...next[i]!, qty: next[i]!.qty + 1 };
        return next;
      }
      return [...c, { productId: p.id, name: p.name, price: Number(p.price), cost: Number(p.cost ?? 0), qty: 1 }];
    });
  }

  function setQty(idx: number, qty: number) {
    const v = Math.round(qty * 1000) / 1000;
    setCart((c) => (v <= 0 ? c.filter((_, i) => i !== idx) : c.map((l, i) => (i === idx ? { ...l, qty: v } : l))));
  }

  function bumpProduct(p: (typeof products)[number], delta: number) {
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id);
      if (i < 0) {
        if (delta <= 0) return c;
        return [...c, { productId: p.id, name: p.name, price: Number(p.price), cost: Number(p.cost ?? 0), qty: delta }];
      }
      const next = Math.round((c[i]!.qty + delta) * 1000) / 1000;
      if (next <= 0) return c.filter((_, j) => j !== i);
      return c.map((l, j) => (j === i ? { ...l, qty: next } : l));
    });
  }

  function resetCart() {
    setCart([]);
    setCustomer("");
    setNote("");
    setDiscount("0");
    setPaid("");
  }

  async function checkout() {
    if (!tenantId || cart.length === 0) {
      toast.error("Keranjang masih kosong");
      return;
    }
    setSaving(true);
    const status: "paid" | "unpaid" = payNow ? "paid" : "unpaid";
    const code = txCode();
    const tx = { id: crypto.randomUUID(), code, created_at: new Date().toISOString() };
    const txRow = {
        id: tx.id,
        tenant_id: tenantId,
        code,
        customer_name: customer.trim() || null,
        note: note.trim() || null,
        subtotal,
        discount_value: parseNum(discount),
        discount_is_percent: discPercent,
        discount_amount: discountAmount,
        tax_percent: useTax ? parseNum(taxPercent) : 0,
        tax_amount: taxAmount,
        total,
        paid_amount: status === "paid" ? paidNum || total : 0,
        change_amount: status === "paid" ? change : 0,
        payment_method: status === "paid" ? method : null,
        status,
        cashier_id: profile?.id ?? null,
        cashier_name: profile?.full_name ?? null,
        paid_at: status === "paid" ? new Date().toISOString() : null,
        created_at: tx.created_at,
    };
    const res = await dbInsert("transactions", [txRow]);
    if (!res.ok) {
      setSaving(false);
      toast.error("Gagal menyimpan transaksi", { description: res.error });
      return;
    }
    upsertLocal(qc, ["transactions", tenantId], `transactions:${tenantId}`, txRow as never);

    await dbInsert(
      "transaction_items",
      cart.map((l) => ({
        id: crypto.randomUUID(),
        transaction_id: tx.id,
        tenant_id: tenantId,
        product_id: l.productId,
        name: l.name,
        qty: l.qty,
        price: l.price,
        cost: l.cost,
        created_at: tx.created_at,
      })),
    );

    for (const l of cart) {
      if (!l.productId) continue;
      const p = products.find((x) => x.id === l.productId);
      if (!p) continue;
      const nextStock = Number(p.stock ?? 0) - l.qty;
      await dbUpdate("products", l.productId, { stock: nextStock });
      patchLocal(qc, ["products", tenantId], `products:${tenantId}`, l.productId, { stock: nextStock } as never);
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
      method: status === "paid" ? method : "BAYAR NANTI",
      status,
      note: note.trim(),
      cashier: profile?.full_name ?? "",
    });
    resetCart();
    setSaving(false);
    void qc.invalidateQueries();
    toast.success("Transaksi tersimpan", {
      description: res.queued ? `${tx.code} · tersimpan offline, sinkron saat online` : tx.code,
    });
  }

  /* --------- pelunasan transaksi "bayar nanti" --------- */
  const [settleMethod, setSettleMethod] = useState("CASH");
  const [settlePaid, setSettlePaid] = useState("");

  function startSettle(t: (typeof history)[number]) {
    setSettling(t);
    setSettleMethod("CASH");
    setSettlePaid(String(Number(t.total)));
    setTab("pos");
  }

  async function confirmSettle() {
    if (!settling) return;
    const amount = parseNum(settlePaid) || Number(settling.total);
    await supabase
      .from("transactions")
      .update({
        status: "paid",
        paid_amount: amount,
        change_amount: Math.max(0, amount - Number(settling.total)),
        payment_method: settleMethod,
        paid_at: new Date().toISOString(),
      })
      .eq("id", settling.id);
    const { data: items } = await supabase
      .from("transaction_items")
      .select("name,qty,price")
      .eq("transaction_id", settling.id);
    setReceipt({
      code: settling.code,
      at: settling.created_at,
      lines: (items ?? []).map((i) => ({ name: i.name, qty: Number(i.qty), price: Number(i.price) })),
      subtotal: Number(settling.subtotal),
      discount: Number(settling.discount_amount ?? 0),
      tax: Number(settling.tax_amount ?? 0),
      total: Number(settling.total),
      paid: amount,
      change: Math.max(0, amount - Number(settling.total)),
      customer: settling.customer_name ?? "",
      method: settleMethod,
      status: "paid",
      cashier: settling.cashier_name ?? "",
    });
    setSettling(null);
    void qc.invalidateQueries();
    toast.success("Transaksi dilunasi");
  }

  async function voidTx(id: string) {
    const reason = await dialog.prompt({
      title: "Batalkan Transaksi?",
      description: "Stok seluruh item akan dikembalikan.",
      label: "Alasan pembatalan",
      placeholder: "Mis. salah input",
      confirmText: "Batalkan Transaksi",
    });
    if (reason === null) return;
    // Kembalikan stok seluruh item transaksi yang dibatalkan.
    const { data: items } = await supabase
      .from("transaction_items")
      .select("product_id,qty")
      .eq("transaction_id", id);
    for (const it of items ?? []) {
      if (!it.product_id) continue;
      const { data: p } = await supabase.from("products").select("stock").eq("id", it.product_id).maybeSingle();
      if (!p) continue;
      await supabase
        .from("products")
        .update({ stock: Number(p.stock ?? 0) + Number(it.qty) })
        .eq("id", it.product_id);
    }
    await supabase.from("transactions").update({ status: "void", void_note: reason }).eq("id", id);
    void qc.invalidateQueries();
    toast.success("Transaksi dibatalkan", { description: "Stok seluruh item dikembalikan." });
  }

  async function openReceipt(t: (typeof history)[number]) {
    const { data: items } = await supabase
      .from("transaction_items")
      .select("name,qty,price")
      .eq("transaction_id", t.id);
    setReceipt({
      code: t.code,
      at: t.created_at,
      lines: (items ?? []).map((i) => ({ name: i.name, qty: Number(i.qty), price: Number(i.price) })),
      subtotal: Number(t.subtotal),
      discount: Number(t.discount_amount ?? 0),
      tax: Number(t.tax_amount ?? 0),
      total: Number(t.total),
      paid: Number(t.paid_amount ?? 0),
      change: Number(t.change_amount ?? 0),
      customer: t.customer_name ?? "",
      method: t.payment_method ?? "BAYAR NANTI",
      status: (t.status as "paid" | "unpaid" | "void") ?? "unpaid",
      note: t.note ?? "",
      cashier: t.cashier_name ?? "",
    });
  }

  /* ---------------- kas laci ---------------- */
  const lastReset = useMemo(() => {
    const r = [...cash].filter((c) => c.is_reset).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    return r?.created_at ?? null;
  }, [cash]);

  const cashScoped = useMemo(
    () => cash.filter((c) => (lastReset ? c.created_at >= lastReset : true)),
    [cash, lastReset],
  );
  const cashSales = useMemo(
    () =>
      history
        .filter(
          (t) =>
            t.status === "paid" &&
            (t.payment_method ?? "CASH").toUpperCase() === "CASH" &&
            (lastReset ? (t.paid_at ?? t.created_at) >= lastReset : true),
        )
        .reduce((s, t) => s + Number(t.paid_amount || t.total), 0),
    [history, lastReset],
  );
  const kasIn = cashScoped.filter((c) => c.type !== "out").reduce((s, c) => s + Number(c.amount), 0);
  const kasOut = cashScoped.filter((c) => c.type === "out").reduce((s, c) => s + Number(c.amount), 0);
  const saldoLaci = kasIn + cashSales - kasOut;

  const [kasType, setKasType] = useState<"fill" | "in" | "out">("fill");
  const [kasAmount, setKasAmount] = useState("");
  const [kasNote, setKasNote] = useState("");
  const [kasReset, setKasReset] = useState(false);

  async function saveKas() {
    const value = parseNum(kasAmount);
    if (!tenantId || value <= 0) {
      toast.error("Isi nominal dulu");
      return;
    }
    if (kasType !== "fill" && !kasNote.trim()) {
      toast.error("Catatan wajib diisi", { description: "Tulis keterangan uang masuk/keluar." });
      return;
    }
    const isReset = kasType === "fill" ? kasReset : false;
    const row = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: kasType,
      amount: value,
      note: kasNote.trim() || null,
      is_reset: isReset,
      created_by: profile?.id ?? null,
      created_by_name: profile?.full_name ?? null,
      created_at: new Date().toISOString(),
    };
    const res = await dbInsert("cash_entries", [row]);
    if (!res.ok) {
      toast.error("Gagal menyimpan", { description: res.error });
      return;
    }
    upsertLocal(qc, ["cash_entries", tenantId], `cash_entries:${tenantId}`, row as never);
    setKasAmount("");
    setKasNote("");
    setKasReset(false);
    toast.success("Catatan kas tersimpan", {
      description: res.queued ? "Tersimpan offline, akan tersinkron saat online." : undefined,
    });
  }

  /* ---------------- riwayat filter ---------------- */
  const [hq, setHq] = useState("");
  const [hstatus, setHstatus] = useState("all");
  const [hfrom, setHfrom] = useState("");
  const [hto, setHto] = useState("");
  const riwayat = history.filter((t) => {
    const okS = hstatus === "all" || t.status === hstatus;
    const okQ = [t.code, t.customer_name ?? ""].join(" ").toLowerCase().includes(hq.trim().toLowerCase());
    const d = new Date(t.created_at);
    const okFrom = !hfrom || d >= new Date(`${hfrom}T00:00:00`);
    const okTo = !hto || d <= new Date(`${hto}T23:59:59`);
    return okS && okQ && okFrom && okTo;
  });

  /* ---------------- rekapan ---------------- */
  const [period, setPeriod] = useState<"today" | "7d" | "all">("today");
  const [rfrom, setRfrom] = useState("");
  const [rto, setRto] = useState("");
  const rekapFrom = useMemo(() => {
    if (rfrom) return new Date(`${rfrom}T00:00:00`).toISOString();
    if (period === "all") return null;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (period === "7d") d.setDate(d.getDate() - 6);
    return d.toISOString();
  }, [period, rfrom]);
  const rekapTo = useMemo(() => (rto ? new Date(`${rto}T23:59:59`).toISOString() : null), [rto]);
  const inRekap = (at: string) => (rekapFrom ? at >= rekapFrom : true) && (rekapTo ? at <= rekapTo : true);
  const rekapTx = history.filter((t) => inRekap(t.created_at));
  const rekapPaid = rekapTx.filter((t) => t.status === "paid");
  // Omzet mencakup transaksi lunas DAN bayar nanti (piutang), kecuali yang dibatalkan.
  const rekapSah = rekapTx.filter((t) => t.status !== "void");
  const omzet = rekapSah.reduce((s, t) => s + Number(t.total), 0);
  const piutangRekap = rekapTx.filter((t) => t.status === "unpaid").reduce((s, t) => s + Number(t.total), 0);
  const uangKeluar = cash
    .filter((c) => c.type === "out" && inRekap(c.created_at))
    .reduce((s, c) => s + Number(c.amount), 0);
  const byMethod = Object.entries(
    rekapPaid.reduce<Record<string, number>>((acc, t) => {
      const k = (t.payment_method ?? "CASH").toUpperCase();
      acc[k] = (acc[k] ?? 0) + Number(t.total);
      return acc;
    }, {}),
  );
  const byCashier = Object.entries(
    rekapSah.reduce<Record<string, { total: number; n: number }>>((acc, t) => {
      const k = t.cashier_name ?? "-";
      acc[k] = { total: (acc[k]?.total ?? 0) + Number(t.total), n: (acc[k]?.n ?? 0) + 1 };
      return acc;
    }, {}),
  );

  /* rincian qty menu terjual pada periode rekap */
  const { data: rekapItems = [] } = useQuery({
    queryKey: ["transaction_items", tenantId],
    enabled: !!tenantId,
    ...cachedList(`transaction_items:${tenantId}`, () =>
      supabase
        .from("transaction_items")
        .select("name,qty,price,transaction_id,created_at")
        .eq("tenant_id", tenantId!)
        .limit(5000),
    ),
  });
  const sahIds = new Set(rekapSah.map((t) => t.id));
  const soldQty = Object.entries(
    rekapItems
      .filter((i) => sahIds.has(i.transaction_id))
      .reduce<Record<string, { qty: number; total: number }>>((acc, i) => {
        const k = i.name;
        acc[k] = {
          qty: (acc[k]?.qty ?? 0) + Number(i.qty),
          total: (acc[k]?.total ?? 0) + Number(i.qty) * Number(i.price),
        };
        return acc;
      }, {}),
  ).sort((a, b) => b[1].qty - a[1].qty);

  return (
    <AppShell title="Ruang Kasir">
      <nav className="no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-soft">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                active ? "brand-gradient text-primary-foreground shadow-brand" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </nav>

      {/* ================= POS ================= */}
      {tab === "pos" && (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk…" className="h-11 rounded-xl pl-9" />
              </div>
              <Select value={cat} onValueChange={setCat}>
                <SelectTrigger className="h-11 w-40 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {filtered.length} menu
              </p>
              <div className="flex overflow-hidden rounded-lg border border-border">
                <button
                  onClick={() => setView("card")}
                  aria-label="Tampilan kartu"
                  className={`px-3 py-1.5 ${view === "card" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView("list")}
                  aria-label="Tampilan daftar"
                  className={`px-3 py-1.5 ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div
              className={
                view === "card"
                  ? "grid max-h-[52vh] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4"
                  : "max-h-[52vh] space-y-2 overflow-y-auto pr-1"
              }
            >
              {filtered.map((p) => {
                const n = qtyInCart(p.id);
                const hitting = hit === p.id;
                return view === "card" ? (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => addProduct(p)}
                    onKeyDown={(e) => e.key === "Enter" && addProduct(p)}
                    className={`relative cursor-pointer overflow-hidden rounded-2xl border bg-card p-2 text-left shadow-soft transition-transform duration-150 active:scale-95 ${
                      hitting ? "scale-95 border-primary ring-2 ring-primary/40" : "border-border hover:border-primary"
                    }`}
                  >
                    {n > 0 && (
                      <span className="num absolute right-1.5 top-1.5 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-black text-primary-foreground shadow-brand">
                        {num(n)}
                      </span>
                    )}
                    <ProductImage path={p.image_url} alt={p.name} className="mb-1.5 h-16 w-full" />
                    <p className="line-clamp-2 text-[12px] font-semibold leading-tight">{p.name}</p>
                    <p className="num mt-0.5 text-[12px] font-bold text-primary">{rupiah(Number(p.price))}</p>
                    <p className="num text-[10px] text-muted-foreground">Stok {num(Number(p.stock ?? 0))}</p>
                    {n > 0 && (
                      <div
                        className="mt-1.5 flex items-center justify-between rounded-lg bg-muted p-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          aria-label="Kurangi"
                          onClick={() => bumpProduct(p, -1)}
                          className="grid h-6 w-6 place-items-center rounded-md bg-card text-sm font-bold shadow-soft"
                        >
                          −
                        </button>
                        <span className="num text-[12px] font-bold">{num(n)}</span>
                        <button
                          aria-label="Tambah"
                          onClick={() => bumpProduct(p, 1)}
                          className="grid h-6 w-6 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => addProduct(p)}
                    onKeyDown={(e) => e.key === "Enter" && addProduct(p)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left shadow-soft transition-transform duration-150 active:scale-[0.98] ${
                      hitting ? "scale-[0.98] border-primary ring-2 ring-primary/40" : "border-border hover:border-primary"
                    }`}
                  >
                    <ProductImage path={p.image_url} alt={p.name} className="h-10 w-10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="num text-xs text-muted-foreground">Stok {num(Number(p.stock ?? 0))}</p>
                    </div>
                    <span className="num text-sm font-bold text-primary">{rupiah(Number(p.price))}</span>
                    {n > 0 && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          aria-label="Kurangi"
                          onClick={() => bumpProduct(p, -1)}
                          className="grid h-7 w-7 place-items-center rounded-md border border-border bg-card text-sm font-bold"
                        >
                          −
                        </button>
                        <span className="num min-w-6 text-center text-[12px] font-bold">{num(n)}</span>
                        <button
                          aria-label="Tambah"
                          onClick={() => bumpProduct(p, 1)}
                          className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                  Belum ada produk pada kategori ini. Tambahkan di menu Stok.
                </p>
              )}
            </div>
          </div>

          {settling ? (
            <div className="space-y-3 rounded-2xl border-2 border-primary bg-card p-4 shadow-brand">
              <div className="flex items-center justify-between">
                <p className="font-bold">Pelunasan {settling.code}</p>
                <StatusBadge status="unpaid" />
              </div>
              <p className="text-sm text-muted-foreground">{settling.customer_name || "Umum"}</p>
              <div className="rounded-xl bg-muted p-3">
                <div className="flex justify-between text-base font-bold">
                  <span>Total tagihan</span>
                  <span className="text-primary">{rupiah(Number(settling.total))}</span>
                </div>
              </div>
              <div>
                <Label className="text-xs">Metode bayar</Label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {METHODS.map((m) => (
                    <Button key={m} variant={settleMethod === m ? "default" : "outline"} onClick={() => setSettleMethod(m)}>
                      {m}
                    </Button>
                  ))}
                </div>
              </div>
              {settleMethod === "CASH" && (
                <div>
                  <Label className="text-xs">Uang diterima</Label>
                  <Input value={settlePaid} onChange={(e) => setSettlePaid(e.target.value)} inputMode="numeric" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-12" onClick={() => void confirmSettle()}>
                  Konfirmasi Lunas
                </Button>
                <Button className="h-12" variant="outline" onClick={() => setSettling(null)}>
                  Batal
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <p className="font-bold">Keranjang</p>
                {cart.length > 0 && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={resetCart}>
                    Kosongkan
                  </Button>
                )}
              </div>
              {cart.length === 0 && <p className="text-sm text-muted-foreground">Belum ada item.</p>}
              {cart.map((l, i) => (
                <div key={i} className="flex items-center gap-1.5 border-b border-border/60 pb-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="num text-xs text-muted-foreground">
                      {rupiah(l.price)} · {rupiah(Math.round(l.price * l.qty))}
                    </p>
                  </div>
                  <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => setQty(i, l.qty - 1)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    aria-label={`Jumlah ${l.name}`}
                    inputMode="decimal"
                    className="num h-8 w-16 shrink-0 px-1 text-center text-sm font-semibold"
                    value={qtyDraft[i] ?? num(l.qty)}
                    onChange={(e) => setQtyDraft((d) => ({ ...d, [i]: e.target.value }))}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => {
                      const raw = qtyDraft[i];
                      setQtyDraft((d) => {
                        const next = { ...d };
                        delete next[i];
                        return next;
                      });
                      if (raw == null) return;
                      setQty(i, parseNum(raw));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                  <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => setQty(i, l.qty + 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={() => setQty(i, 0)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Nama pelanggan (opsional)" />
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Catatan / no. meja" />

              <div className="space-y-1.5">
                <Label className="text-xs">Diskon</Label>
                <div className="flex items-stretch gap-2">
                  <Input
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    inputMode="decimal"
                    className="num h-10 min-w-0 flex-1"
                  />
                  <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-lg border border-border">
                    {(["Rp", "%"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setDiscPercent(s === "%")}
                        className={`h-10 w-12 text-sm font-bold transition ${
                          discPercent === (s === "%")
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="tax" checked={useTax} onCheckedChange={(v) => setUseTax(!!v)} />
                <Label htmlFor="tax" className="text-xs">
                  Pajak (%)
                </Label>
                {useTax && (
                  <Input
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(e.target.value)}
                    inputMode="decimal"
                    className="h-8 w-24"
                  />
                )}
              </div>

              <div className="space-y-1 rounded-xl bg-primary/5 p-3 text-sm">
                <Row label="Subtotal" value={rupiah(subtotal)} />
                {!!discountAmount && <Row label="Diskon" value={"-" + rupiah(discountAmount)} />}
                {!!taxAmount && <Row label="Pajak" value={rupiah(taxAmount)} />}
                <div className="flex justify-between border-t border-border pt-1 text-lg font-bold">
                  <span className="text-primary">Total</span>
                  <span className="text-primary">{rupiah(total)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
                <button
                  onClick={() => setPayNow(true)}
                  className={`rounded-lg py-2 text-sm font-semibold ${payNow ? "brand-gradient text-primary-foreground" : "text-muted-foreground"}`}
                >
                  Bayar Sekarang
                </button>
                <button
                  onClick={() => setPayNow(false)}
                  className={`rounded-lg py-2 text-sm font-semibold ${!payNow ? "bg-warning text-warning-foreground" : "text-muted-foreground"}`}
                >
                  Bayar Nanti
                </button>
              </div>

              {payNow && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {METHODS.map((m) => (
                      <Button key={m} variant={method === m ? "default" : "outline"} onClick={() => setMethod(m)}>
                        {m}
                      </Button>
                    ))}
                  </div>
                  {method === "CASH" && (
                    <>
                      <Input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="numeric" placeholder="Uang diterima" />
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK.map((v) => (
                          <Button
                            key={v}
                            size="sm"
                            variant="outline"
                            onClick={() => setPaid(String(parseNum(paid) + v))}
                          >
                            {v / 1000}k
                          </Button>
                        ))}
                        <Button size="sm" variant="outline" onClick={() => setPaid(String(total))}>
                          Uang pas
                        </Button>
                      </div>
                      <Row label="Kembalian" value={rupiah(change)} />
                    </>
                  )}
                </>
              )}

              <Button disabled={saving} onClick={() => void checkout()} className="h-12 w-full text-base font-bold">
                {payNow ? "Simpan & Cetak Struk" : "Simpan Bayar Nanti"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ================= KAS LACI ================= */}
      {tab === "kas" && (
        <div className="space-y-4">
          <div className="brand-gradient rounded-2xl p-5 text-primary-foreground shadow-brand">
            <p className="text-xs uppercase tracking-wider text-primary-foreground/80">Uang di Laci Saat Ini</p>
            <p className="mt-1 text-3xl font-black">{rupiah(saldoLaci)}</p>
            <p className="mt-1 text-xs text-primary-foreground/80">
              Isi kas + uang masuk + penjualan tunai − uang keluar {lastReset ? "(sejak reset terakhir)" : ""}
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
              {(
                [
                  { k: "fill", l: "Isi Kas" },
                  { k: "in", l: "Uang Masuk" },
                  { k: "out", l: "Uang Keluar" },
                ] as const
              ).map((o) => (
                <button
                  key={o.k}
                  onClick={() => {
                    setKasType(o.k);
                    if (o.k !== "fill") setKasReset(false);
                  }}
                  className={`rounded-lg py-2 text-sm font-semibold ${
                    kasType === o.k ? "brand-gradient text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <Input value={kasAmount} onChange={(e) => setKasAmount(e.target.value)} inputMode="numeric" placeholder="Nominal" className="h-12" />
            <Input
              value={kasNote}
              onChange={(e) => setKasNote(e.target.value)}
              placeholder={kasType === "fill" ? "Catatan (opsional)" : "Catatan wajib (mis. beli gas, setor ke bank)"}
            />
            {kasType === "fill" && (
              <div className="flex items-start gap-2">
                <Checkbox id="reset" checked={kasReset} onCheckedChange={(v) => setKasReset(!!v)} />
                <Label htmlFor="reset" className="text-xs leading-5 text-muted-foreground">
                  <span className="font-semibold text-foreground">Reset saldo laci</span> — centang jika uang di laci sudah
                  diambil semua dan ingin menghitung ulang dari awal.
                </Label>
              </div>
            )}
            <Button className="h-12 w-full font-semibold" onClick={() => void saveKas()}>
              Simpan
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold">Riwayat Kas</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadCSV(
                    "kas-laci-bucici.csv",
                    cash.map((e) => ({
                      waktu: dateTimeID(e.created_at),
                      tipe: e.type === "fill" ? "isi kas" : e.type === "in" ? "uang masuk" : "uang keluar",
                      nominal: e.amount,
                      reset: e.is_reset ? "ya" : "",
                      catatan: e.note ?? "",
                      oleh: e.created_by_name ?? "",
                    })),
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
            </div>
            <div className="space-y-2">
              {cash.length === 0 && <p className="text-sm text-muted-foreground">Belum ada catatan kas.</p>}
              {cash.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border/70 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {e.note || (e.type === "fill" ? "Isi kas" : e.type === "in" ? "Uang masuk" : "Uang keluar")}
                      {e.is_reset && <span className="ml-2 text-[10px] font-bold text-primary">RESET</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dateTimeID(e.created_at)} · {e.created_by_name ?? "-"}
                    </p>
                  </div>
                  <p className={`font-bold ${e.type === "out" ? "text-destructive" : "text-success"}`}>
                    {e.type === "out" ? "-" : "+"}
                    {rupiah(Number(e.amount))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= RIWAYAT ================= */}
      {tab === "riwayat" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input value={hq} onChange={(e) => setHq(e.target.value)} placeholder="Cari transaksi/pelanggan…" className="h-11 rounded-xl" />
            <Select value={hstatus} onValueChange={setHstatus}>
              <SelectTrigger className="h-11 w-44 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="paid">Lunas</SelectItem>
                <SelectItem value="unpaid">Belum Bayar</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="h-11"
              onClick={() =>
                downloadCSV(
                  "transaksi-bucici.csv",
                  riwayat.map((t) => ({
                    kode: t.code,
                    waktu: dateTimeID(t.created_at),
                    pelanggan: t.customer_name ?? "",
                    total: t.total,
                    status: t.status,
                    metode: t.payment_method ?? "",
                    kasir: t.cashier_name ?? "",
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft">
            <div className="space-y-1">
              <Label className="text-xs">Dari tanggal</Label>
              <Input type="date" value={hfrom} onChange={(e) => setHfrom(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sampai tanggal</Label>
              <Input type="date" value={hto} onChange={(e) => setHto(e.target.value)} className="h-10" />
            </div>
            {(hfrom || hto) && (
              <Button
                variant="ghost"
                className="h-10"
                onClick={() => {
                  setHfrom("");
                  setHto("");
                }}
              >
                Reset tanggal
              </Button>
            )}
          </div>

          {riwayat.length === 0 && (
            <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Belum ada transaksi.
            </p>
          )}

          {riwayat.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => void openReceipt(t)}>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t.code}</p>
                  <p className="text-xs text-muted-foreground">{dateTimeID(t.created_at)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.customer_name || "Umum"} · {t.payment_method ?? "—"} · {t.cashier_name ?? "-"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">{rupiah(Number(t.total))}</p>
                  <StatusBadge status={t.status} className="mt-1" />
                </div>
              </button>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void openReceipt(t)}>
                  <Printer className="mr-2 h-3.5 w-3.5" /> Lihat Struk
                </Button>
                {t.status === "unpaid" && (
                  <Button size="sm" onClick={() => startSettle(t)}>
                    Bayar Sekarang
                  </Button>
                )}
                {t.status !== "void" && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void voidTx(t.id)}>
                    Batalkan
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================= REKAPAN ================= */}
      {tab === "rekap" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { k: "today", l: "Hari ini" },
                { k: "7d", l: "7 Hari" },
                { k: "all", l: "Semua" },
              ] as const
            ).map((o) => (
              <button
                key={o.k}
                onClick={() => setPeriod(o.k)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  period === o.k ? "brand-gradient text-primary-foreground shadow-brand" : "border border-border bg-card text-muted-foreground"
                }`}
              >
                {o.l}
              </button>
            ))}
            <Button
              variant="outline"
              className="ml-auto"
              onClick={() =>
                downloadCSV(
                  "rekapan-bucici.csv",
                  rekapTx.map((t) => ({
                    kode: t.code,
                    waktu: dateTimeID(t.created_at),
                    pelanggan: t.customer_name ?? "",
                    subtotal: t.subtotal,
                    diskon: t.discount_amount ?? 0,
                    pajak: t.tax_amount ?? 0,
                    total: t.total,
                    status: t.status,
                    metode: t.payment_method ?? "",
                    kasir: t.cashier_name ?? "",
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Omzet" value={rupiah(omzet)} tone="brand" />
            <Stat label="Piutang (bayar nanti)" value={rupiah(piutangRekap)} />
            <Stat label="Uang keluar" value={rupiah(uangKeluar)} tone="destructive" />
            <Stat label="Saldo kas laci" value={rupiah(saldoLaci)} tone="success" />
            <Stat label="Transaksi" value={String(rekapSah.length)} />
            <Stat label="Void" value={String(rekapTx.filter((t) => t.status === "void").length)} tone="destructive" />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold">Rincian Menu Terjual</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadCSV(
                    "menu-terjual-bucici.csv",
                    soldQty.map(([name, v]) => ({ menu: name, qty: v.qty, omzet: v.total })),
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
            </div>
            {soldQty.length === 0 && <p className="text-sm text-muted-foreground">Belum ada menu terjual pada periode ini.</p>}
            <div className="x-scroll">
              {soldQty.length > 0 && (
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-1.5">Menu</th>
                      <th className="py-1.5 text-right">Qty</th>
                      <th className="py-1.5 text-right">Omzet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soldQty.map(([name, v]) => (
                      <tr key={name} className="border-t border-border/60">
                        <td className="py-1.5 pr-2">{name}</td>
                        <td className="num py-1.5 text-right font-semibold">{num(v.qty)}</td>
                        <td className="num py-1.5 text-right">{rupiah(v.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <p className="mb-2 font-bold">Metode Pembayaran</p>
              {byMethod.length === 0 && <p className="text-sm text-muted-foreground">Belum ada transaksi pada periode ini.</p>}
              {byMethod.map(([m, v]) => (
                <div key={m} className="flex justify-between py-1 text-sm">
                  <span className="text-muted-foreground">{m}</span>
                  <span className="font-semibold">{rupiah(v)}</span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <p className="mb-2 font-bold">Kinerja Kasir</p>
              {byCashier.length === 0 && <p className="text-sm text-muted-foreground">Belum ada transaksi pada periode ini.</p>}
              {byCashier.map(([n, v]) => (
                <div key={n} className="flex justify-between py-1 text-sm">
                  <span className="text-muted-foreground">
                    {n} · {v.n} trx
                  </span>
                  <span className="font-semibold">{rupiah(v.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="no-print">
            <DialogTitle>Struk Transaksi</DialogTitle>
          </DialogHeader>
          {receipt && (
            <Receipt
              data={receipt}
              header={tenant?.receipt_header || tenant?.business_name}
              address={tenant?.receipt_address}
              phone={tenant?.receipt_phone}
              footer={tenant?.receipt_footer}
              extra={tenant?.receipt_extra}
            />
          )}
          <DialogFooter className="no-print">
            {receipt && (
              <ReceiptActions
                data={receipt}
                shop={{
                  header: tenant?.receipt_header || tenant?.business_name || "BUCICI",
                  address: tenant?.receipt_address ?? "",
                  phone: tenant?.receipt_phone ?? "",
                  footer: tenant?.receipt_footer ?? "",
                  extra: tenant?.receipt_extra ?? "",
                }}
              />
            )}
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: "brand" | "success" | "destructive" }) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-soft ${
        tone === "brand" ? "brand-gradient text-primary-foreground" : "border border-border bg-card"
      }`}
    >
      <p className={`text-[11px] uppercase tracking-wider ${tone === "brand" ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-black leading-tight ${
          tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
