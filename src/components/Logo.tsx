import logoMark from "@/assets/bucici-icon.jpg.asset.json";
import logoLogin from "@/assets/bucici-login-icon.jpg.asset.json";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={logoMark.url}
      alt="Logo BUCICI"
      className={cn("rounded-xl object-cover", className)}
      width={48}
      height={48}
    />
  );
}

export function LogoFull({ className }: { className?: string }) {
  return (
    <img
      src={logoLogin.url}
      alt="BUCICI — Simple Business Buddy"
      className={cn("rounded-2xl object-cover", className)}
      width={160}
      height={160}
    />
  );
}