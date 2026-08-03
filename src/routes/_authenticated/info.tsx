import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { AIChat } from "@/components/AIChat";
import { dateID } from "@/lib/format";
import { youtubeEmbed } from "@/lib/format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/info")({
  head: () => ({
    meta: [
      { title: "Info & AI-sisten — BUCICI" },
      { name: "description", content: "Kabar terbaru dari BUCICI dan asisten AI untuk pertanyaan usaha." },
      { property: "og:title", content: "Info & AI-sisten — BUCICI" },
      { property: "og:description", content: "Kabar terbaru dan asisten AI untuk pertanyaan usaha." },
    ],
  }),
  component: InfoPage,
});

function InfoPage() {
  const { data: posts = [] } = useQuery({
    queryKey: ["info_posts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("info_posts")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <AppShell title="Info & AI-sisten">
      <Tabs defaultValue="ai">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ai">AI-sisten</TabsTrigger>
          <TabsTrigger value="kabar">Kabar</TabsTrigger>
        </TabsList>
        <TabsContent value="ai" className="mt-4">
          <AIChat
            scope="tenant"
            starters={[
              "Berapa omzet saya bulan ini?",
              "Produk apa yang paling laku?",
              "Beri ide promosi untuk minggu ini",
              "Bagaimana cara menaikkan margin?",
            ]}
          />
        </TabsContent>
        <TabsContent value="kabar" className="mt-4 space-y-3">
          {posts.length === 0 && <p className="text-sm text-muted-foreground">Belum ada kabar terbaru.</p>}
          {posts.map((p) => {
            const embed = youtubeEmbed(p.link);
            return (
            <article
              key={p.id}
              className={`rounded-2xl border bg-card p-4 shadow-soft ${p.is_pinned ? "border-primary/50 ring-1 ring-primary/20" : "border-border"}`}
            >
              {p.is_pinned && (
                <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <Pin className="h-3 w-3" /> Disematkan
                </p>
              )}
              <h2 className="font-bold">{p.title}</h2>
              <p className="text-xs text-muted-foreground">{dateID(p.created_at)}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{p.content}</p>
              {embed && (
                <div className="mt-3 aspect-video w-full overflow-hidden rounded-xl border border-border">
                  <iframe
                    src={embed}
                    title={p.title}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
              {p.link && !embed && (
                <a
                  href={p.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Buka tautan <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </article>
            );
          })}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}