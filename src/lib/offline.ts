/**
 * Dukungan mode offline BUCICI.
 *
 * - `cacheGet` / `cacheSet` menyimpan hasil query terakhir agar daftar produk,
 *   kategori, riwayat, dan kas tetap bisa dibuka saat internet mati.
 * - `enqueue` menampung operasi tulis (transaksi, item, kas, stok) di localStorage,
 *   lalu `flushQueue` mengirimnya ke database begitu koneksi kembali.
 */
import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

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

/* ------------------------------------------------------------------ *
 * Query dengan cadangan cache — daftar tetap tampil walau tanpa sinyal.
 * ------------------------------------------------------------------ */
export function cachedList<T>(key: string, run: () => PromiseLike<{ data: T[] | null }>) {
  return {
    queryFn: async () => {
      try {
        const { data } = await run();
        if (data) {
          cacheSet(key, data);
          return data;
        }
      } catch {
        /* offline — pakai cache */
      }
      return cacheGet<T[]>(key, []);
    },
    initialData: () => {
      const c = cacheGet<T[] | null>(key, null);
      return c ?? undefined;
    },
    initialDataUpdatedAt: 0,
  };
}

/* ------------------------------------------------------------------ *
 * Tulis data: langsung ke database saat online, masuk antrian saat offline.
 * ------------------------------------------------------------------ */
export type WriteResult = { ok: boolean; queued: boolean; error?: string };

export async function dbInsert(table: string, rows: Record<string, unknown>[]): Promise<WriteResult> {
  if (!rows.length) return { ok: true, queued: false };
  if (isOnline()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from(table as any) as any).insert(rows);
      if (!error) return { ok: true, queued: false };
      // Gagal karena jaringan → antrikan, selain itu laporkan.
      if (!/fetch|network|Failed/i.test(error.message ?? "")) {
        return { ok: false, queued: false, error: error.message };
      }
    } catch {
      /* jatuh ke antrian */
    }
  }
  enqueue([{ kind: "insert", table, rows }]);
  return { ok: true, queued: true };
}

export async function dbUpdate(table: string, id: string, patch: Record<string, unknown>): Promise<WriteResult> {
  if (isOnline()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from(table as any) as any).update(patch).eq("id", id);
      if (!error) return { ok: true, queued: false };
      if (!/fetch|network|Failed/i.test(error.message ?? "")) {
        return { ok: false, queued: false, error: error.message };
      }
    } catch {
      /* jatuh ke antrian */
    }
  }
  enqueue([{ kind: "update", table, id, patch }]);
  return { ok: true, queued: true };
}

export async function dbDelete(table: string, id: string): Promise<WriteResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from(table as any) as any).delete().eq("id", id);
  return error ? { ok: false, queued: false, error: error.message } : { ok: true, queued: false };
}

/** Tambahkan/timpa satu baris pada cache daftar agar UI langsung ikut berubah. */
export function upsertLocal<T extends { id: string }>(
  qc: QueryClient,
  queryKey: unknown[],
  cacheKey: string,
  row: T,
  atTop = true,
) {
  const next = (() => {
    const old = (qc.getQueryData<T[]>(queryKey) ?? cacheGet<T[]>(cacheKey, [])) as T[];
    const i = old.findIndex((x) => x.id === row.id);
    if (i >= 0) return old.map((x, j) => (j === i ? { ...x, ...row } : x));
    return atTop ? [row, ...old] : [...old, row];
  })();
  qc.setQueryData(queryKey, next);
  cacheSet(cacheKey, next);
}

/** Perbarui sebagian kolom satu baris pada cache daftar. */
export function patchLocal<T extends { id: string }>(
  qc: QueryClient,
  queryKey: unknown[],
  cacheKey: string,
  id: string,
  patch: Partial<T>,
) {
  const old = (qc.getQueryData<T[]>(queryKey) ?? cacheGet<T[]>(cacheKey, [])) as T[];
  const next = old.map((x) => (x.id === id ? { ...x, ...patch } : x));
  qc.setQueryData(queryKey, next);
  cacheSet(cacheKey, next);
}

/** Hapus satu baris dari cache daftar. */
export function removeLocal<T extends { id: string }>(
  qc: QueryClient,
  queryKey: unknown[],
  cacheKey: string,
  id: string,
) {
  const old = (qc.getQueryData<T[]>(queryKey) ?? cacheGet<T[]>(cacheKey, [])) as T[];
  const next = old.filter((x) => x.id !== id);
  qc.setQueryData(queryKey, next);
  cacheSet(cacheKey, next);
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
