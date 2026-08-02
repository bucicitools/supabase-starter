import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, WifiOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { flushQueue, isOnline, queueSize } from "@/lib/offline";
import { Button } from "@/components/ui/button";

export function useOfflineStatus() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const sync = () => {
      setOnline(isOnline());
      setPending(queueSize());
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("bucici-outbox", sync as EventListener);
    const t = setInterval(sync, 4000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("bucici-outbox", sync as EventListener);
      clearInterval(t);
    };
  }, []);

  return { online, pending };
}

export function OfflineBanner() {
  const { online, pending } = useOfflineStatus();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!online || !pending) return;
    void (async () => {
      const sent = await flushQueue();
      if (sent) {
        toast.success(`${sent} data offline berhasil tersinkron`);
        void qc.invalidateQueries();
      }
    })();
  }, [online, pending, qc]);

  if (online && !pending) return null;

  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">
      {online ? <CloudOff className="h-4 w-4 shrink-0 text-warning" /> : <WifiOff className="h-4 w-4 shrink-0 text-warning" />}
      <p className="min-w-0 flex-1 text-foreground">
        {online ? "Menyinkronkan data offline…" : "Mode offline — transaksi tetap bisa dicatat."}
        {pending > 0 && <span className="font-semibold"> {pending} data menunggu kirim.</span>}
      </p>
      {online && pending > 0 && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const sent = await flushQueue();
            setBusy(false);
            void qc.invalidateQueries();
            toast[sent ? "success" : "info"](sent ? `${sent} data tersinkron` : "Belum bisa tersinkron, coba lagi.");
          }}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Sinkron
        </Button>
      )}
    </div>
  );
}
