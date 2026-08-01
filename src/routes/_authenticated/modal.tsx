import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, Download, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { dateTimeID, downloadCSV, rupiah } from "@/lib/format";
import { wipeFinancialData } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/modal")({
  head: () => ({
    meta: [
      { title: "Modal & Kas — BUCICI" },
      { name: "description", content: "Catat modal, kas masuk, kas keluar, dan lihat sisa kas usaha." },
      { property: "og:title", content: "Modal & Kas — BUCICI" },
      { property: "og:description", content: "Catat modal, kas masuk, dan kas keluar." },
    ],
  }),
  component: ModalPage,
});

function ModalPage() {
  const { tenant, profile, role } = useAuth();
  const qc = useQueryClient();
  const tenantId = tenant?.id;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const { data: entries = [] } = useQuery({
    queryKey: ["cash_entries", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_entries")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const { data: sales = 0 } = useQuery({
    queryKey: ["cash-sales", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("total")
        .eq("tenant_id", tenantId!)
        .eq("status", "paid");
      return (data ?? []).reduce((s, t) => s + Number(t.total), 0);
    },
  });

  const masuk = entries.filter((e) => e.type === "in").reduce((s, e) => s + Number(e.amount), 0);
  const keluar = entries.filter((e) => e.type === "out").reduce((s, e) => s + Number(e.amount), 0);
  const saldo = masuk + sales - keluar;

  async function add(type: "in" | "out") {
    const value = Number(amount || 0);
    if (!tenantId || value <= 0) {
      toast.error("Isi nominal dulu");
      return;
    }
    const { error } = await supabase.from("cash_entries").insert({
      tenant_id: tenantId,
      type,
      amount: value,
      note: note.trim() || null,
      created_by: profile?.id ?? null,
      created_by_name: profile?.full_name ?? null,
    });
    if (error) {
      toast.error("Gagal menyimpan", { description: error.message });
      return;
    }
    setAmount("");
    setNote("");
    void qc.invalidateQueries({ queryKey: ["cash_entries", tenantId] });
    toast.success(type === "in" ? "Kas masuk dicatat" : "Kas keluar dicatat");
  }

  async function resetAll() {
    if (!window.confirm("Hapus SEMUA transaksi dan catatan kas toko ini? Tindakan ini tidak bisa dibatalkan.")) return;
    const res = await wipeFinancialData();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    void qc.invalidateQueries();
    toast.success("Data keuangan direset");
  }

  return (
    <AppShell title="Modal & Kas">
      <section className="grid grid-cols-3 gap-3">
        <Box label="Kas masuk" value={rupiah(masuk + sales)} tone="success" />
        <Box label="Kas keluar" value={rupiah(keluar)} tone="destructive" />
        <Box label="Sisa kas" value={rupiah(saldo)} tone="brand" />
      </section>

      <div className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="space-y-1">
          <Label className="text-xs">Nominal</Label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="0" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Keterangan</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. modal awal, beli gas" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-12" onClick={() => void add("in")}>
            <ArrowDownCircle className="mr-2 h-4 w-4" /> Kas Masuk
          </Button>
          <Button className="h-12" variant="outline" onClick={() => void add("out")}>
            <ArrowUpCircle className="mr-2 h-4 w-4" /> Kas Keluar
          </Button>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          onClick={() =>
            downloadCSV(
              "kas-bucici.csv",
              entries.map((e) => ({
                tanggal: dateTimeID(e.created_at),
                jenis: e.type === "in" ? "masuk" : "keluar",
                nominal: e.amount,
                keterangan: e.note ?? "",
                oleh: e.created_by_name ?? "",
              })),
            )
          }
        >
          <Download className="mr-2 h-4 w-4" /> Unduh CSV
        </Button>
        {role !== "member" && (
          <Button variant="outline" className="text-destructive" onClick={() => void resetAll()}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset Data
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{e.note || (e.type === "in" ? "Kas masuk" : "Kas keluar")}</p>
              <p className="text-xs text-muted-foreground">
                {dateTimeID(e.created_at)} · {e.created_by_name ?? "-"}
              </p>
            </div>
            <p className={`font-bold ${e.type === "in" ? "text-success" : "text-destructive"}`}>
              {e.type === "in" ? "+" : "-"}
              {rupiah(Number(e.amount))}
            </p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone: "success" | "destructive" | "brand" }) {
  const cls =
    tone === "brand"
      ? "brand-gradient text-primary-foreground"
      : "border border-border bg-card text-foreground";
  return (
    <div className={`rounded-2xl p-4 shadow-soft ${cls}`}>
      <p className={`text-xs ${tone === "brand" ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</p>
      <p
        className={`mt-1 text-base font-bold leading-tight ${
          tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}