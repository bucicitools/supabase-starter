/**
 * Cetak struk ke printer thermal Bluetooth (ESC/POS) lewat Web Bluetooth.
 * Berfungsi pada Chrome/Edge Android & desktop. Jika tidak tersedia,
 * pemanggil sebaiknya jatuh ke `window.print()`.
 */
import { dateTimeID, rupiah, STATUS_META } from "@/lib/format";
import type { ReceiptData } from "@/components/Receipt";

const PRINT_SERVICES = [
  0x18f0,
  0xffe0,
  0xff00,
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

const WIDTH = 32;

function line(char = "-") {
  return char.repeat(WIDTH) + "\n";
}

function pair(left: string, right: string) {
  const l = left.slice(0, WIDTH - right.length - 1);
  return l + " ".repeat(Math.max(1, WIDTH - l.length - right.length)) + right + "\n";
}

function center(text: string) {
  const t = text.slice(0, WIDTH);
  const pad = Math.max(0, Math.floor((WIDTH - t.length) / 2));
  return " ".repeat(pad) + t + "\n";
}

export type ShopInfo = {
  header?: string | null;
  address?: string | null;
  phone?: string | null;
  extra?: string | null;
  footer?: string | null;
};

export function escposText(d: ReceiptData, shop: ShopInfo) {
  let out = "\x1b@"; // init
  out += "\x1b\x61\x01"; // center
  out += "\x1b\x21\x30" + (shop.header || "BUCICI") + "\n" + "\x1b\x21\x00";
  if (shop.address) out += shop.address + "\n";
  if (shop.phone) out += shop.phone + "\n";
  out += "\x1b\x61\x00"; // left
  out += line();
  out += d.code + "\n" + dateTimeID(d.at) + "\n";
  if (d.customer) out += "Pembeli: " + d.customer + "\n";
  if (d.cashier) out += "Kasir  : " + d.cashier + "\n";
  out += line();
  for (const l of d.lines) {
    out += l.name + "\n";
    out += pair(`  ${l.qty} x ${rupiah(l.price)}`, rupiah(l.price * l.qty));
  }
  out += line();
  out += pair("Subtotal", rupiah(d.subtotal));
  if (d.discount) out += pair("Diskon", "-" + rupiah(d.discount));
  if (d.tax) out += pair("Pajak", rupiah(d.tax));
  out += "\x1b\x21\x08" + pair("TOTAL", rupiah(d.total)) + "\x1b\x21\x00";
  out += pair(`Bayar (${d.method})`, rupiah(d.paid));
  out += pair("Kembali", rupiah(d.change));
  out += line();
  out += "\x1b\x61\x01";
  out += `** ${STATUS_META[d.status].label} **\n`;
  if (d.note) out += "Catatan: " + d.note + "\n";
  out += (shop.footer || "Terima kasih") + "\n";
  if (shop.extra) out += shop.extra + "\n";
  out += "\n\n\n";
  out += "\x1d\x56\x00"; // potong kertas
  return out;
}

export function bluetoothSupported() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export async function printBluetooth(d: ReceiptData, shop: ShopInfo) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bt = (navigator as any).bluetooth;
  if (!bt) throw new Error("Perangkat ini tidak mendukung Bluetooth langsung dari browser.");

  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINT_SERVICES,
  });
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();

  let characteristic: { writeValue?: (v: BufferSource) => Promise<void>; writeValueWithoutResponse?: (v: BufferSource) => Promise<void> } | null =
    null;
  for (const service of services) {
    const chars = await service.getCharacteristics();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writable = chars.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
    if (writable) {
      characteristic = writable;
      break;
    }
  }
  if (!characteristic) throw new Error("Printer tidak punya jalur tulis yang cocok.");

  const bytes = new TextEncoder().encode(escposText(d, shop));
  const CHUNK = 180;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.slice(i, i + CHUNK);
    if (characteristic.writeValueWithoutResponse) await characteristic.writeValueWithoutResponse(chunk);
    else await characteristic.writeValue!(chunk);
    await new Promise((r) => setTimeout(r, 24));
  }
  try {
    server.disconnect();
  } catch {
    /* abaikan */
  }
}
