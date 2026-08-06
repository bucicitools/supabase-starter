import { useAppDialog } from "@/components/app-dialog";
import { isOnline } from "@/lib/offline";

/**
 * Beberapa fitur (video/tautan info, generate prompt AI) memang butuh internet.
 * Hook ini menampilkan dialog gaya app saat pengguna sedang offline.
 */
export function useRequireOnline() {
  const dialog = useAppDialog();
  return async (activity: string) => {
    if (isOnline()) return true;
    await dialog.alert({
      title: "Tidak Ada Koneksi Internet",
      description: `${activity} membutuhkan jaringan internet. Sambungkan perangkat ke internet lalu coba lagi.`,
      confirmText: "Mengerti",
    });
    return false;
  };
}
