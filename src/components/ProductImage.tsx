import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Gambar produk tersimpan sebagai path privat, jadi dibuka lewat URL bertanda tangan. */
export function useProductImageUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["product-image", path],
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      if (!path) return null;
      if (path.startsWith("http")) return path;
      const { data } = await supabase.storage.from("product-images").createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
}

export function ProductImage({
  path,
  alt,
  className,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const { data: url } = useProductImageUrl(path);
  if (!url) {
    return (
      <span className={cn("grid place-items-center rounded-xl bg-primary/10 text-primary", className)}>
        <Package className="h-5 w-5" />
      </span>
    );
  }
  return <img src={url} alt={alt} loading="lazy" className={cn("rounded-xl object-cover", className)} />;
}
