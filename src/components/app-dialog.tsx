import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ConfirmOpts = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};
type PromptOpts = {
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  inputMode?: "text" | "decimal" | "numeric";
};

type Ctx = {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
};

const AppDialogContext = createContext<Ctx | null>(null);

export function useAppDialog() {
  const ctx = useContext(AppDialogContext);
  if (!ctx) throw new Error("useAppDialog must be used inside <AppDialogProvider>");
  return ctx;
}

type State =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void }
  | null;

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null);
  const [value, setValue] = useState("");

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        setState({ kind: "confirm", opts, resolve });
      }),
    [],
  );

  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.defaultValue ?? "");
        setState({ kind: "prompt", opts, resolve });
      }),
    [],
  );

  const api = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  function close(result: boolean | string | null) {
    if (!state) return;
    if (state.kind === "confirm") state.resolve(result === true);
    else state.resolve(result as string | null);
    setState(null);
  }

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      <Dialog open={!!state} onOpenChange={(o) => !o && close(state?.kind === "confirm" ? false : null)}>
        <DialogContent className="max-w-[340px] rounded-3xl p-5 sm:max-w-[380px]">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base font-bold">{state?.opts.title}</DialogTitle>
            {state?.opts.description && (
              <DialogDescription className="text-sm">{state.opts.description}</DialogDescription>
            )}
          </DialogHeader>

          {state?.kind === "prompt" && (
            <div className="space-y-1.5 pt-1">
              {state.opts.label && <Label className="text-xs">{state.opts.label}</Label>}
              <Input
                autoFocus
                value={value}
                inputMode={state.opts.inputMode ?? "text"}
                placeholder={state.opts.placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") close(value);
                }}
              />
            </div>
          )}

          <DialogFooter className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-2">
            <Button variant="outline" className="w-full" onClick={() => close(state?.kind === "confirm" ? false : null)}>
              {state?.kind === "confirm" ? (state.opts.cancelText ?? "Batal") : "Batal"}
            </Button>
            <Button
              className="w-full"
              variant={state?.kind === "confirm" && state.opts.destructive ? "destructive" : "default"}
              onClick={() => close(state?.kind === "confirm" ? true : value)}
            >
              {state?.opts.confirmText ?? (state?.kind === "confirm" ? "Lanjut" : "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppDialogContext.Provider>
  );
}
