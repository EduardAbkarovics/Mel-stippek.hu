"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/navbar";
import { api } from "@/lib/api";

function ResetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) {
      toast.error("A két jelszó nem egyezik");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      toast.success("Jelszó megváltoztatva! Jelentkezz be az új jelszóval.");
      router.push("/login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center text-white/50 text-sm">
        Hiányzó token — használd az emailben kapott linket.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm"
    >
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">Új jelszó megadása</h1>
        <p className="text-white/40 text-sm mt-2">
          Add meg az új jelszavad (legalább 8 karakter).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Új jelszó"
            required
            minLength={8}
            className="w-full pl-9 pr-4 py-3.5 rounded-xl bg-ink-850 border border-white/10 focus:border-lime/50 outline-none text-sm transition-colors"
          />
        </div>
        <div className="relative">
          <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder="Új jelszó még egyszer"
            required
            minLength={8}
            className="w-full pl-9 pr-4 py-3.5 rounded-xl bg-ink-850 border border-white/10 focus:border-lime/50 outline-none text-sm transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-lime w-full py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <KeyRound size={15} />
          )}
          Jelszó mentése
        </button>
      </form>
    </motion.div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen hero-bg">
      <Navbar />
      <div className="flex items-center justify-center min-h-screen px-4 pt-20">
        <Suspense
          fallback={<Loader2 className="animate-spin text-lime" size={32} />}
        >
          <ResetContent />
        </Suspense>
      </div>
    </div>
  );
}
