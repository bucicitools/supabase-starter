/**
 * Menggambar struk menjadi gambar PNG (canvas) untuk dibagikan ke WhatsApp,
 * tanpa dependensi tambahan agar tetap ringan dan bisa jalan offline.
 */
import { dateTimeID, rupiah, STATUS_META } from "@/lib/format";
import type { ReceiptData } from "@/components/Receipt";
import type { ShopInfo } from "@/lib/thermal";

const W = 576; // 80mm @ 203dpi
const PAD = 28;
const SCALE = 1;

export async function receiptImageBlob(d: ReceiptData, shop: ShopInfo): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const rows: { l: string; r?: string; size?: number; bold?: boolean; center?: boolean; rule?: boolean }[] = [];
  rows.push({ l: shop.header || "BUCICI", size: 34, bold: true, center: true });
  if (shop.address) rows.push({ l: shop.address, size: 20, center: true });
  if (shop.phone) rows.push({ l: shop.phone, size: 20, center: true });
  rows.push({ l: "", rule: true });
  rows.push({ l: d.code, size: 20 });
  rows.push({ l: dateTimeID(d.at), size: 20 });
  if (d.customer) rows.push({ l: "Pembeli: " + d.customer, size: 20 });
  if (d.cashier) rows.push({ l: "Kasir: " + d.cashier, size: 20 });
  rows.push({ l: "", rule: true });
  for (const it of d.lines) {
    rows.push({ l: it.name, size: 22 });
    rows.push({ l: `  ${it.qty} x ${rupiah(it.price)}`, r: rupiah(it.price * it.qty), size: 20 });
  }
  rows.push({ l: "", rule: true });
  rows.push({ l: "Subtotal", r: rupiah(d.subtotal), size: 21 });
  if (d.discount) rows.push({ l: "Diskon", r: "-" + rupiah(d.discount), size: 21 });
  if (d.tax) rows.push({ l: "Pajak", r: rupiah(d.tax), size: 21 });
  rows.push({ l: "TOTAL", r: rupiah(d.total), size: 28, bold: true });
  rows.push({ l: `Bayar (${d.method})`, r: rupiah(d.paid), size: 21 });
  rows.push({ l: "Kembali", r: rupiah(d.change), size: 21 });
  rows.push({ l: "", rule: true });
  rows.push({ l: STATUS_META[d.status].label, size: 30, bold: true, center: true });
  if (d.note) rows.push({ l: "Catatan: " + d.note, size: 19, center: true });
  rows.push({ l: shop.footer || "Terima kasih", size: 21, center: true });
  if (shop.extra) rows.push({ l: shop.extra, size: 19, center: true });

  const lineH = (r: (typeof rows)[number]) => (r.rule ? 18 : (r.size ?? 20) + 12);
  const height = PAD * 2 + rows.reduce((s, r) => s + lineH(r), 0);

  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  let y = PAD;
  for (const r of rows) {
    if (r.rule) {
      ctx.strokeStyle = "#999";
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(PAD, y + 8);
      ctx.lineTo(W - PAD, y + 8);
      ctx.stroke();
      ctx.setLineDash([]);
      y += lineH(r);
      continue;
    }
    const size = r.size ?? 20;
    ctx.font = `${r.bold ? "bold " : ""}${size}px "Courier New", monospace`;
    if (r.center) {
      ctx.textAlign = "center";
      ctx.fillText(r.l, W / 2, y, W - PAD * 2);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(r.l, PAD, y, W - PAD * 2 - (r.r ? 160 : 0));
      if (r.r) {
        ctx.textAlign = "right";
        ctx.fillText(r.r, W - PAD, y);
      }
    }
    y += lineH(r);
  }

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
