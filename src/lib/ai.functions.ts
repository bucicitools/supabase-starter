import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const MODEL = "google/gemini-3.6-flash";

const ChatInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(40),
  scope: z.enum(["tenant", "super_admin"]).default("tenant"),
});

function gateway() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY belum tersedia");
  return createLovableAiGatewayProvider(key);
}

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let contextText = "";

    if (data.scope === "super_admin") {
      const { data: isSA } = await supabase.rpc("is_super_admin");
      if (!isSA) return { ok: false as const, error: "Tidak diizinkan." };
      const [{ data: tenants }, { data: licenses }] = await Promise.all([
        supabase.from("tenants").select("business_name,owner_name,license_code,is_active,created_at").limit(300),
        supabase.from("licenses").select("code,batch,used_by,created_at").limit(500),
      ]);
      contextText = `DATA PLATFORM (JSON)\nTenants: ${JSON.stringify(tenants ?? [])}\nLisensi (ringkas): total=${licenses?.length ?? 0}, terpakai=${(licenses ?? []).filter((l) => l.used_by).length}`;
    } else {
      const { data: me } = await supabase.from("profiles").select("tenant_id,full_name").eq("id", userId).maybeSingle();
      if (!me?.tenant_id) return { ok: false as const, error: "Toko tidak ditemukan." };
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const [{ data: tenant }, { data: products }, { data: txs }, { data: cash }] = await Promise.all([
        supabase.from("tenants").select("business_name,owner_name,default_tax").eq("id", me.tenant_id).maybeSingle(),
        supabase.from("products").select("name,price,stock,cost,sku").eq("tenant_id", me.tenant_id).limit(300),
        supabase
          .from("transactions")
          .select("code,total,status,payment_method,cashier_name,created_at,customer_name")
          .eq("tenant_id", me.tenant_id)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(400),
        supabase.from("cash_entries").select("type,amount,note,created_at").eq("tenant_id", me.tenant_id).limit(200),
      ]);
      contextText = `DATA TOKO (JSON, 30 hari terakhir)\nToko: ${JSON.stringify(tenant)}\nProduk: ${JSON.stringify(products ?? [])}\nTransaksi: ${JSON.stringify(txs ?? [])}\nKas: ${JSON.stringify(cash ?? [])}`;
    }

    const system = `Kamu adalah AI-sisten BUCICI, asisten bisnis berbahasa Indonesia yang cerdas dan punya pengetahuan umum luas.
Kamu BUKAN chatbot basa-basi: jawab langsung, ringkas, akurat, dan actionable.
Gunakan Markdown rapi (heading, bullet, dan tabel bila membandingkan angka).
Format uang dengan format Rupiah Indonesia.
Jika pertanyaan menyangkut data di bawah, hitung dari data itu dan sebutkan angkanya. Jika data tidak cukup, katakan apa yang kurang.

${contextText}`;

    try {
      const { text } = await generateText({
        model: gateway()(MODEL),
        system,
        messages: data.messages,
      });
      return { ok: true as const, text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) return { ok: false as const, error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." };
      if (msg.includes("402")) return { ok: false as const, error: "Kredit AI habis. Silakan isi ulang di Lovable AI." };
      return { ok: false as const, error: "AI gagal merespons: " + msg };
    }
  });

const PromptInput = z.object({
  category: z.string().max(60),
  style: z.string().max(60),
  title: z.string().max(120),
  tagline: z.string().max(200).optional().default(""),
  price: z.string().max(60).optional().default(""),
  info: z.string().max(200).optional().default(""),
  cta: z.string().max(80).optional().default(""),
  ratio: z.string().max(60),
  pixels: z.string().max(60),
});

export const generateCreativePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PromptInput.parse(d))
  .handler(async ({ data }) => {
    const system = `Kamu adalah art director & prompt engineer profesional untuk foto produk komersial.
Keluarkan HANYA JSON valid tanpa markdown fence dengan bentuk:
{"prompt":"...","negative_prompt":"...","caption_instagram":"...","caption_facebook":"...","hashtags":"..."}
- "prompt": bahasa Inggris, sangat detail (subjek, komposisi, lighting, lensa, material, background, mood, penempatan teks judul/tagline/harga/CTA, rasio & resolusi), siap ditempel ke ChatGPT/Gemini/Midjourney. Minimal 120 kata.
- caption: bahasa Indonesia, persuasif, pakai emoji secukupnya.
- hashtags: 12-18 hashtag relevan dipisah spasi.`;
    const user = `Jenis produk: ${data.category}
Style: ${data.style}
Judul: ${data.title}
Tagline: ${data.tagline}
Harga: ${data.price}
Info: ${data.info}
Call to action: ${data.cta}
Rasio: ${data.ratio} (${data.pixels})`;

    try {
      const { text } = await generateText({
        model: gateway()(MODEL),
        system,
        prompt: user,
      });
      const clean = text.replace(/```json|```/g, "").trim();
      return { ok: true as const, data: JSON.parse(clean) as Record<string, string> };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Gagal membuat prompt." };
    }
  });

const PriceInput = z.object({
  productName: z.string().max(120),
  hpp: z.number(),
  ingredients: z.string().max(3000),
  market: z.string().max(200).optional().default(""),
});

export const suggestPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PriceInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const { text } = await generateText({
        model: gateway()(MODEL),
        system: `Kamu konsultan pricing UMKM Indonesia. Jawab dalam Markdown ringkas berisi tabel 3 opsi harga jual (Kompetitif / Standar / Cuan) dengan kolom: Opsi, Harga Jual, Margin %, Laba per unit, Kapan dipakai. Lalu 3 poin saran singkat. Bulatkan harga ke kelipatan 500 rupiah.`,
        prompt: `Produk: ${data.productName}\nHPP per unit: Rp${data.hpp}\nRincian bahan: ${data.ingredients}\nKonteks pasar: ${data.market}`,
      });
      return { ok: true as const, text };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memberi saran." };
    }
  });