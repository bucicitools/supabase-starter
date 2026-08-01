import { dateTimeID, rupiah, STATUS_META } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ReceiptLine = { name: string; qty: number; price: number };

export type ReceiptData = {
  code: string;
  at: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  customer: string;
  method: string;
  status: "paid" | "unpaid" | "void";
  note?: string;
  cashier?: string;
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[(status as keyof typeof STATUS_META) ?? "unpaid"] ?? STATUS_META.unpaid;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider",
        meta.cls,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function Receipt({
  data,
  header,
  address,
  phone,
  footer,
  extra,
}: {
  data: ReceiptData;
  header?: string | null | undefined;
  address?: string | null | undefined;
  phone?: string | null | undefined;
  footer?: string | null | undefined;
  extra?: string | null | undefined;
}) {
  const stamp =
    data.status === "paid"
      ? { text: "LUNAS", color: "#16a34a" }
      : data.status === "unpaid"
        ? { text: "BELUM BAYAR", color: "#d97706" }
        : { text: "VOID", color: "#dc2626" };

  return (
    <div className="print-area relative overflow-hidden rounded-xl bg-white p-4 font-mono text-[11px] leading-5 text-black">
      <div
        className="pointer-events-none absolute right-2 top-14 -rotate-[18deg] rounded-md border-4 px-3 py-1 text-lg font-black tracking-widest opacity-80"
        style={{ color: stamp.color, borderColor: stamp.color }}
      >
        {stamp.text}
      </div>
      <p className="text-center text-sm font-bold">{header || "BUCICI"}</p>
      {address && <p className="text-center">{address}</p>}
      {phone && <p className="text-center">{phone}</p>}
      <p className="my-2 border-y border-dashed border-black/40 py-1">
        {data.code}
        <br />
        {dateTimeID(data.at)}
        {data.customer && (
          <>
            <br />
            Pembeli: {data.customer}
          </>
        )}
        {data.cashier && (
          <>
            <br />
            Kasir: {data.cashier}
          </>
        )}
      </p>
      {data.lines.map((l, i) => (
        <div key={i} className="flex justify-between">
          <span className="pr-2">
            {l.name} x{l.qty}
          </span>
          <span>{rupiah(l.price * l.qty)}</span>
        </div>
      ))}
      <div className="mt-2 border-t border-dashed border-black/40 pt-1">
        <Line label="Subtotal" value={rupiah(data.subtotal)} />
        {!!data.discount && <Line label="Diskon" value={"-" + rupiah(data.discount)} />}
        {!!data.tax && <Line label="Pajak" value={rupiah(data.tax)} />}
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{rupiah(data.total)}</span>
        </div>
        <Line label={`Bayar (${data.method})`} value={rupiah(data.paid)} />
        <Line label="Kembali" value={rupiah(data.change)} />
      </div>
      {data.note && <p className="mt-2">Catatan: {data.note}</p>}
      <p className="mt-3 text-center">{footer || "Terima kasih 🙏"}</p>
      {extra && <p className="text-center">{extra}</p>}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function receiptText(d: ReceiptData, header?: string | null, address?: string | null, footer?: string | null) {
  return [
    header || "BUCICI",
    address || "",
    `No: ${d.code}`,
    dateTimeID(d.at),
    "-------------------------",
    ...d.lines.map((l) => `${l.name} x${l.qty}  ${rupiah(l.price * l.qty)}`),
    "-------------------------",
    `Subtotal: ${rupiah(d.subtotal)}`,
    d.discount ? `Diskon: -${rupiah(d.discount)}` : "",
    d.tax ? `Pajak: ${rupiah(d.tax)}` : "",
    `TOTAL: ${rupiah(d.total)}`,
    `Bayar: ${rupiah(d.paid)} (${d.method})`,
    `Kembali: ${rupiah(d.change)}`,
    `Status: ${STATUS_META[d.status].label}`,
    footer || "Terima kasih 🙏",
  ]
    .filter(Boolean)
    .join("\n");
}