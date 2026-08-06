import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "@/lib/offline";

/**
 * Saat harga modal (HPP) sebuah produk diisi/diubah, transaksi lama yang
 * item-nya belum punya modal ikut diperbarui supaya dashboard langsung akurat.
 */
export async function syncProductCost(tenantId: string, productId: string, cost: number) {
  if (!isOnline() || !(cost > 0)) return;
  await supabase.from("products").update({ cost }).eq("id", productId);
  await supabase
    .from("transaction_items")
    .update({ cost })
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .or("cost.is.null,cost.eq.0");
}
