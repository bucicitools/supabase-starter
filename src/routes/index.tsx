import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { LogoFull } from "@/components/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BUCICI — Simple Business Buddy" },
      {
        name: "description",
        content:
          "Satu aplikasi untuk kasir, stok, hitung modal, dan kreasi prompt promosi usaha kecil Indonesia.",
      },
      { property: "og:title", content: "BUCICI — Simple Business Buddy" },
      {
        property: "og:description",
        content: "Kasir, stok, hitung modal, dan kreasi prompt dalam satu aplikasi.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { loading, user, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth", replace: true });
    } else if (role === "super_admin") {
      void navigate({ to: "/admin", replace: true });
    } else {
      void navigate({ to: "/home", replace: true });
    }
  }, [loading, user, role, navigate]);

  return (
    <div className="brand-gradient flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <LogoFull className="h-32 w-32 animate-pulse shadow-brand" />
      <h1 className="sr-only">BUCICI — Simple Business Buddy</h1>
      <p className="text-sm font-medium tracking-widest text-primary-foreground/80">MEMUAT…</p>
    </div>
  );
}