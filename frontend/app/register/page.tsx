"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { GoogleButton } from "@/components/google-button";
import { TelegramLogin } from "@/components/telegram-login";
import { api } from "@/lib/api";
import { playSound } from "@/lib/sounds";
import { useAuthStore } from "@/lib/store";

const INPUT_CLASS =
  "w-full px-4 py-3 rounded-xl bg-ink-850/80 border border-white/10 focus:border-lime/50 outline-none text-sm transition-colors placeholder:text-white/30";

export default function RegisterPage() {
  const router = useRouter();
  const { isAuthenticated, setAuth } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace("/tippek");
  }, [isAuthenticated, router]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { token, user } = await api.register(email, password, name || undefined);
      setAuth(token, user);
      playSound("success");
      toast.success("Sikeres regisztráció!");
      router.push("/#csomagok");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell quote="Fogadj okosan. Nyerj velünk.">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Hozd létre a fiókod</h1>
        <p className="mt-1.5 text-sm text-white/40">
          Add meg az adataid — 30 másodperc az egész
        </p>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-white/60">
            Neved <span className="text-white/30">(nem kötelező)</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kovács Péter"
            className={INPUT_CLASS}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-white/60">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="te@email.hu"
            required
            className={INPUT_CLASS}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-white/60">Jelszó</span>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 karakter"
              required
              minLength={8}
              className={`${INPUT_CLASS} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPw((p) => !p)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 transition-colors hover:text-white/60"
              aria-label={showPw ? "Jelszó elrejtése" : "Jelszó megjelenítése"}
              tabIndex={-1}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="btn-lime flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm disabled:opacity-60"
        >
          {loading && <Loader2 size={15} className="animate-spin" />}
          Fiók létrehozása
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-white/40">
        Van már fiókod?{" "}
        <Link href="/login" className="font-medium text-lime hover:underline">
          Lépj be
        </Link>
      </p>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-white/30">vagy folytasd ezzel</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <GoogleButton label="Regisztráció Google fiókkal" />
      <div className="mt-4">
        <TelegramLogin />
      </div>
    </AuthShell>
  );
}
