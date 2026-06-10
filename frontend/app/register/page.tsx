"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Trophy, Mail, Lock, User, Loader2, ArrowRight, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/navbar";
import { GoogleButton } from "@/components/google-button";
import { TelegramLogin } from "@/components/telegram-login";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

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
      toast.success("Sikeres regisztráció!");
      router.push("/#csomagok");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen hero-bg">
      <Navbar />
      <div className="flex items-center justify-center min-h-screen px-4 pt-20 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-lime flex items-center justify-center mx-auto mb-4">
              <Trophy size={24} className="text-ink-950" />
            </div>
            <h1 className="text-2xl font-bold">Csatlakozz hozzánk!</h1>
            <p className="text-white/40 text-sm mt-1">
              Hozz létre fiókot 30 másodperc alatt
            </p>
          </div>

          <GoogleButton label="Regisztráció Google fiókkal" />

          <div className="my-4">
            <TelegramLogin />
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30">vagy emaillel</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <form onSubmit={handleRegister} className="space-y-3">
            <div className="relative">
              <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Neved (nem kötelező)"
                className="w-full pl-9 pr-4 py-3.5 rounded-xl bg-ink-850 border border-white/10 focus:border-lime/50 outline-none text-sm transition-colors"
              />
            </div>
            <div className="relative">
              <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email címed"
                required
                className="w-full pl-9 pr-4 py-3.5 rounded-xl bg-ink-850 border border-white/10 focus:border-lime/50 outline-none text-sm transition-colors"
              />
            </div>
            <div className="relative">
              <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Jelszó (min. 8 karakter)"
                required
                minLength={8}
                className="w-full pl-9 pr-10 py-3.5 rounded-xl bg-ink-850 border border-white/10 focus:border-lime/50 outline-none text-sm transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-lime w-full py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ArrowRight size={15} />
              )}
              Fiók létrehozása
            </button>
          </form>

          <p className="text-center text-xs text-white/40 mt-5">
            Van már fiókod?{" "}
            <Link href="/login" className="text-lime font-medium hover:underline">
              Belépés
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
