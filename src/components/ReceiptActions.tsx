import { useState } from "react";
import { Bluetooth, Loader2, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { receiptText, type ReceiptData } from "@/components/Receipt";
import { bluetoothSupported, printBluetooth, type ShopInfo } from "@/lib/thermal";
import { receiptImageBlob } from "@/lib/receipt-image";

export function ReceiptActions({ data, shop }: { data: ReceiptData; shop: ShopInfo }) {
  const [busy, setBusy] = useState(false);

  async function cetakBluetooth() {
    setBusy(true);
    try {
      await printBluetooth(data, shop);
      toast.success("Struk terkirim ke printer");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal mencetak";
      if (!/cancel/i.test(msg)) toast.error("Cetak Bluetooth gagal", { description: msg });
    } finally {
      setBusy(false);
    }
  }

  async function bagikanWhatsApp() {
    const caption = receiptText(data, shop.header, shop.address, shop.footer);
    setBusy(true);
    try {
      const blob = await receiptImageBlob(data, shop);
      const file = blob ? new File([blob], `struk-${data.code}.png`, { type: "image/png" }) : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if (file && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: caption, title: `Struk ${data.code}` });
        return;
      }
      // Fallback: unduh gambar struk lalu buka WhatsApp dengan caption
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `struk-${data.code}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.info("Gambar struk diunduh", { description: "Lampirkan gambar itu di WhatsApp yang terbuka." });
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank", "noopener");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal membagikan";
      if (!/abort/i.test(msg)) toast.error("Gagal membagikan struk", { description: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Button onClick={() => void cetakBluetooth()} disabled={busy || !bluetoothSupported()} className="h-11">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bluetooth className="mr-2 h-4 w-4" />}
        Cetak Bluetooth
      </Button>
      <Button variant="outline" className="h-11" onClick={() => window.print()}>
        <Printer className="mr-2 h-4 w-4" /> Cetak Biasa
      </Button>
      <Button variant="outline" className="h-11" onClick={() => void bagikanWhatsApp()} disabled={busy}>
        <Share2 className="mr-2 h-4 w-4" /> Bagikan WhatsApp
      </Button>
    </div>
  );
}
