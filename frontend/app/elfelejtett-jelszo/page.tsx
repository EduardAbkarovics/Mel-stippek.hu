"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, Loader2, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/navbar";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen hero-bg">
      <Navbar />
      <div className="flex items-center justify-center min-h-screen px-4 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {sent ? (
            <div className="slip-card p-8 text-center">
              <CheckCircle2 size={40} className="text-lime mx-auto mb-4" />
              <h1 className="text-xl font-bold mb-2">Email elküldve!</h1>
              <p className="text-white/50 text-sm">
                Ha létezik fiók ezzel az email címmel, elküldtük a jelszó
                visszaállító linket. Nézd meg a postaládádat (és a spam mappát
                is)!
              </p>
              <Link
                href="/login"
                className="inline-block mt-6 text-lime text-sm font-semibold hover:underline"
              >
                Vissza a belépéshez
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold">Elfelejtett jelszó</h1>
                <p className="text-white/40 text-sm mt-2">
                  Add meg az email címed, és küldünk egy visszaállító linket.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
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
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-lime w-full py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Send size={15} />
                  )}
                  Visszaállító link küldése
                </button>
              </form>

              <p className="text-center text-xs text-white/40 mt-5">
                <Link href="/login" className="text-lime font-medium hover:underline">
                  Vissza a belépéshez
                </Link>
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
