import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { generateCreativePrompt } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/prompt")({
  head: () => ({
    meta: [
      { title: "Kreasi Prompt — BUCICI" },
      { name: "description", content: "Buat prompt foto produk dan caption promosi siap pakai dengan bantuan AI." },
      { property: "og:title", content: "Kreasi Prompt — BUCICI" },
      { property: "og:description", content: "Buat prompt foto produk dan caption promosi dengan AI." },
    ],
  }),
  component: PromptPage,
});

const CATEGORIES = ["Makanan", "Minuman", "Fashion", "Kerajinan", "Jasa", "Kecantikan", "Elektronik", "Lainnya"];
const STYLES = [
  "Studio bersih minimalis",
  "Rustic kayu hangat",
  "Flat lay estetik",
  "Cinematic dramatis",
  "Outdoor natural light",
  "Neon modern",
  "Poster promo bold",
];
const RATIOS = [
  { label: "Feed 1:1", pixels: "1080x1080" },
  { label: "Story 9:16", pixels: "1080x1920" },
  { label: "Landscape 16:9", pixels: "1920x1080" },
  { label: "Portrait 4:5", pixels: "1080x1350" },
];

function PromptPage() {
  const [form, setForm] = useState({
    category: CATEGORIES[0]!,
    style: STYLES[0]!,
    title: "",
    tagline: "",
    price: "",
    info: "",
    cta: "",
    ratio: RATIOS[0]!.label,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, string> | null>(null);

  async function generate() {
    if (!form.title.trim()) {
      toast.error("Isi judul/nama produk dulu");
      return;
    }
    setBusy(true);
    const ratio = RATIOS.find((r) => r.label === form.ratio)!;
    const res = await generateCreativePrompt({
      data: { ...form, ratio: ratio.label, pixels: ratio.pixels },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResult(res.data);
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast.success("Disalin ke clipboard");
  }

  return (
    <AppShell title="Kreasi Prompt">
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="grid gap-3 sm:grid-cols-2">
          <Picker
            label="Jenis produk"
            value={form.category}
            options={CATEGORIES}
            onChange={(v) => setForm({ ...form, category: v })}
          />
          <Picker
            label="Gaya visual"
            value={form.style}
            options={STYLES}
            onChange={(v) => setForm({ ...form, style: v })}
          />
          <Picker
            label="Rasio gambar"
            value={form.ratio}
            options={RATIOS.map((r) => r.label)}
            onChange={(v) => setForm({ ...form, ratio: v })}
          />
          <TextField label="Judul / nama produk" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          <TextField label="Tagline" value={form.tagline} onChange={(v) => setForm({ ...form, tagline: v })} />
          <TextField label="Harga" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
          <TextField label="Info tambahan" value={form.info} onChange={(v) => setForm({ ...form, info: v })} />
          <TextField label="Call to action" value={form.cta} onChange={(v) => setForm({ ...form, cta: v })} />
        </div>
        <Button className="h-12 w-full font-semibold" onClick={() => void generate()} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
          Buat Prompt & Caption
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <ResultCard title="Prompt Gambar (EN)" text={result["prompt"] ?? ""} onCopy={copy} />
          <ResultCard title="Negative Prompt" text={result["negative_prompt"] ?? ""} onCopy={copy} />
          <ResultCard title="Caption Instagram" text={result["caption_instagram"] ?? ""} onCopy={copy} />
          <ResultCard title="Caption Facebook" text={result["caption_facebook"] ?? ""} onCopy={copy} />
          <ResultCard title="Hashtag" text={result["hashtags"] ?? ""} onCopy={copy} />
        </div>
      )}
    </AppShell>
  );
}

function ResultCard({
  title,
  text,
  onCopy,
}: {
  title: string;
  text: string;
  onCopy: (t: string) => void;
}) {
  if (!text) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold">{title}</p>
        <Button size="sm" variant="outline" onClick={() => onCopy(text)}>
          <Copy className="mr-2 h-3.5 w-3.5" /> Salin
        </Button>
      </div>
      <Textarea readOnly value={text} rows={5} className="resize-none text-sm" />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}