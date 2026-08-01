import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Send, Sparkles } from "lucide-react";
import { askAssistant } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Msg = { role: "user" | "assistant"; content: string };

export function AIChat({ scope = "tenant" as "tenant" | "super_admin", starters = [] as string[] }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: clean }];
    setMessages(next);
    setInput("");
    setBusy(true);
    const res = await askAssistant({ data: { messages: next, scope } });
    setMessages([
      ...next,
      { role: "assistant", content: res.ok ? res.text : `⚠️ ${res.error}` },
    ]);
    setBusy(false);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  return (
    <div className="flex h-[calc(100vh-11rem)] flex-col rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3 py-6 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-primary" />
            <p className="text-sm text-muted-foreground">
              Tanya apa saja — soal data usahamu maupun pengetahuan umum.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                  : "prose prose-sm dark:prose-invert max-w-[92%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-foreground"
              }
            >
              {m.role === "user" ? (
                m.content
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> AI-sisten sedang berpikir…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Tulis pertanyaan…"
          rows={1}
          className="max-h-32 min-h-11 resize-none"
        />
        <Button onClick={() => void send(input)} disabled={busy} size="icon" className="h-11 w-11 shrink-0">
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}