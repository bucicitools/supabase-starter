export const rupiah = (n: number | null | undefined) =>
  "Rp" + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n ?? 0));

/**
 * Parser angka fleksibel: mendukung desimal ("2.5" / "2,5"),
 * pecahan ("1/9", "2/3"), dan campuran ("1 1/2").
 */
export function parseNum(input: string | number | null | undefined): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const raw = String(input ?? "").trim().replace(/,/g, ".").replace(/\s+/g, " ");
  if (!raw) return 0;
  const mixed = raw.match(/^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const den = Number(mixed[3]);
    if (!den) return whole;
    const frac = Number(mixed[2]) / den;
    return whole < 0 ? whole - frac : whole + frac;
  }
  const frac = raw.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den ? Number(frac[1]) / den : 0;
  }
  const n = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export const dec = (n: number, digits = 2) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Number(n || 0));

export function youtubeEmbed(url: string | null | undefined): string | null {
  if (!url) return null;
  const m =
    url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i);
  return m?.[1] ? `https://www.youtube.com/embed/${m[1]}` : null;
}

export const STATUS_META = {
  paid: { label: "LUNAS", cls: "border-success/40 bg-success/10 text-success" },
  unpaid: { label: "BELUM BAYAR", cls: "border-warning/40 bg-warning/10 text-warning" },
  void: { label: "VOID", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
} as const;

export const num = (n: number | null | undefined) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(n ?? 0));

export const dateID = (d: string | Date) =>
  new Date(d).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export const dateTimeID = (d: string | Date) =>
  new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 11) return "Pagi";
  if (h < 15) return "Siang";
  if (h < 18) return "Sore";
  return "Malam";
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0] ?? {});
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob(["\uFEFF" + toCSV(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function txCode() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `TRX${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}