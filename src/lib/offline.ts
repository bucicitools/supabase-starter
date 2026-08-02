/**
 * Dukungan mode offline BUCICI.
 *
 * - `cacheGet` / `cacheSet` menyimpan hasil query terakhir agar daftar produk,
 *   kategori, riwayat, dan kas tetap bisa dibuka saat internet mati.
 * - `enqueue` menampung operasi tulis (transaksi, item, kas, stok) di localStorage,
 *   lalu `flushQueue` mengirimnya ke database begitu koneksi kembali.
 */
import { supabase } from "@/integrations/supabase/client";

const CACHE_PREFIX = "bucici:cache:";
const QUEUE_KEY = "bucici:outbox";

export type QueuedOp =
  | { kind: "insert"; table: string; rows: Record<string, unknown>[] }
  | { kind: "update"; table: string; id: string; patch: Record<string, unknown> };

export type QueueItem = { id: string; at: string; ops: QueuedOp[] };

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function cacheSet(key: string, data: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    /* kuota penuh — abaikan */
  }
}

export function cacheGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return safeParse<T>(localStorage.getItem(CACHE_PREFIX + key), fallback);
}

export function readQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  return safeParse<QueueItem[]>(localStorage.getItem(QUEUE_KEY), []);
}

function writeQueue(items: QueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("bucici-outbox"));
}

export function enqueue(ops: QueuedOp[]) {
  const items = readQueue();
  items.push({ id: crypto.randomUUID(), at: new Date().toISOString(), ops });
  writeQueue(items);
}

export function queueSize() {
  return readQueue().length;
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

let flushing = false;

/** Kirim semua antrian ke database. Mengembalikan jumlah yang berhasil terkirim. */
export async function flushQueue(): Promise<number> {
  if (flushing || !isOnline()) return 0;
  flushing = true;
  let sent = 0;
  try {
    let items = readQueue();
    while (items.length) {
      const item = items[0]!;
      let ok = true;
      for (const op of item.ops) {
        if (op.kind === "insert") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase.from(op.table as any) as any).upsert(op.rows, {
            onConflict: "id",
            ignoreDuplicates: true,
          });
          if (error) ok = false;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase.from(op.table as any) as any).update(op.patch).eq("id", op.id);
          if (error) ok = false;
        }
        if (!ok) break;
      }
      if (!ok) break;
      sent += 1;
      items = readQueue().filter((x) => x.id !== item.id);
      writeQueue(items);
    }
  } finally {
    flushing = false;
  }
  return sent;
}
