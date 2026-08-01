import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Store, KeyRound, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { registerAccount } from "@/lib/account.functions";
import { useAuth } from "@/lib/auth";
import { LogoFull } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk atau Daftar — BUCICI" },
      { name: "description", content: "Masuk ke akun BUCICI atau daftar toko baru dengan kode lisensi." },
      { property: "og:title", content: "Masuk atau Daftar — BUCICI" },
      { property: "og:description", content: "Masuk ke akun BUCICI atau daftar toko baru." },
    ],
  }),
  component: AuthPage,
});

function PasswordField({
  id,
  value,
  onChange,
  placeholder = "••••••••",
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 pr-11"
          autoComplete="current-password"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Sembunyikan password" : "Intip password"}
          className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-md text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const { user, role, loading: authLoading, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [rName, setRName] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPass, setRPass] = useState("");
  const [rLicense, setRLicense] = useState("");
  const [rStore, setRStore] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;
    void navigate({ to: role === "super_admin" ? "/admin" : "/home", replace: true });
  }, [authLoading, user, role, navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error("Gagal masuk", { description: "Email atau password salah." });
      return;
    }
    await refresh();
    toast.success("Berhasil masuk");
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (rPass.length < 6) {
      toast.error("Password minimal 6 karakter");
      return;
    }
    setBusy(true);
    try {
      const res = await registerAccount({
        data: {
          fullName: rName.trim(),
          email: rEmail.trim(),
          password: rPass,
          licenseCode: rLicense.trim() || null,
          businessName: rStore.trim() || "Toko Saya",
        },
      });
      if (!res.ok) {
        toast.error("Pendaftaran gagal", { description: res.error });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: rEmail.trim(), password: rPass });
      if (error) {
        toast.success("Akun dibuat. Silakan masuk.");
        setMode("login");
        setEmail(rEmail);
        return;
      }
      await refresh();
      toast.success(res.superAdmin ? "Selamat datang, Super Admin!" : "Toko berhasil dibuat!");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot() {
    if (!email.trim()) {
      toast.error("Isi email dulu", { description: "Kami kirim tautan reset ke email itu." });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error("Gagal mengirim email reset");
    else toast.success("Tautan reset password dikirim ke email kamu");
  }

  return (
    <main className="brand-gradient flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoFull className="h-28 w-28 shadow-brand" />
          <h1 className="mt-4 text-3xl font-black tracking-[0.2em] text-primary-foreground">BUCICI</h1>
          <p className="mt-1 text-xs font-semibold tracking-[0.25em] text-primary-foreground/80">
            SIMPLE BUSINESS BUDDY
          </p>
        </div>

        <div className="rounded-3xl border border-border/50 bg-card p-5 shadow-soft">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Masuk</TabsTrigger>
              <TabsTrigger value="register">Daftar</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-5">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="h-12 pl-10"
                      autoComplete="email"
                    />
                  </div>
                </div>
                <PasswordField id="password" label="Password" value={password} onChange={setPassword} />
                <button
                  type="button"
                  onClick={handleForgot}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Lupa password?
                </button>
                <Button type="submit" disabled={busy} className="h-12 w-full text-base font-semibold">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Masuk"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-5">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rname">Nama</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input id="rname" required value={rName} onChange={(e) => setRName(e.target.value)} className="h-12 pl-10" placeholder="Nama lengkap" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="remail">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input id="remail" type="email" required value={rEmail} onChange={(e) => setREmail(e.target.value)} className="h-12 pl-10" placeholder="nama@email.com" />
                  </div>
                </div>
                <PasswordField id="rpass" label="Password" value={rPass} onChange={setRPass} />
                <div className="space-y-1.5">
                  <Label htmlFor="rlic">Kode Lisensi</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="rlic"
                      value={rLicense}
                      onChange={(e) => setRLicense(e.target.value.toUpperCase())}
                      className="h-12 pl-10 font-mono"
                      placeholder="BUCICI-XXXX"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pendaftar pertama pada aplikasi ini tidak memerlukan kode lisensi.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rstore">Nama Toko / Tenant</Label>
                  <div className="relative">
                    <Store className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input id="rstore" required value={rStore} onChange={(e) => setRStore(e.target.value)} className="h-12 pl-10" placeholder="Mis. Warung Bu Ani" />
                  </div>
                </div>
                <Button type="submit" disabled={busy} className="h-12 w-full text-base font-semibold">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Daftar Sekarang"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}