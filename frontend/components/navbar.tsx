"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, LogOut, User, Shield, TrendingUp, Volume2, VolumeX } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { api } from "@/lib/api";
import { isMuted, setMuted } from "@/lib/sounds";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Főoldal" },
  { href: "/#csomagok", label: "Csomagok" },
  { href: "/tippek", label: "Tippjeim" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [muted, setMutedState] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuthStore();

  useEffect(() => setMutedState(isMuted()), []);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {}
    logout();
    router.push("/");
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-ink-950/85 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo — szöveges, a sötét témához illeszkedik, minden böngészőben azonos */}
          <Link href="/" className="flex items-center gap-2 group" aria-label="Melóstippek.hu">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-lime/15 border border-lime/30 group-hover:bg-lime/25 transition-colors">
              <TrendingUp size={18} className="text-lime" />
            </span>
            <span className="text-lg sm:text-xl font-extrabold tracking-tight whitespace-nowrap">
              <span className="text-white">Melós</span>
              <span className="text-lime">tippek</span>
              <span className="text-white/40">.hu</span>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors",
                  pathname === l.href && "text-white"
                )}
              >
                {l.label}
              </Link>
            ))}
            {user?.is_admin && (
              <Link
                href="/admin"
                className="px-4 py-2 rounded-xl text-sm font-medium text-lime hover:bg-lime/10 transition-colors flex items-center gap-1.5"
              >
                <Shield size={14} />
                Admin
              </Link>
            )}
          </div>

          {/* Auth buttons */}
          <div className="hidden md:flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <Link
                  href="/profil"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <User size={15} />
                  {user?.name || user?.email?.split("@")[0]}
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                  title="Kijelentkezés"
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white transition-colors"
                >
                  Belépés
                </Link>
                <Link
                  href="/register"
                  className="btn-lime px-5 py-2 rounded-xl text-sm"
                >
                  Regisztráció
                </Link>
              </>
            )}
          </div>

          {/* Hangok némítása + mobile hamburger */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleMute}
              aria-label={muted ? "Hangok bekapcsolása" : "Hangok némítása"}
              title={muted ? "Hangok bekapcsolása" : "Hangok némítása"}
              className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <button
              className="md:hidden p-2 text-white/70 hover:text-white"
              onClick={() => setOpen((o) => !o)}
              aria-label="Menü"
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-ink-900 border-t border-white/5 px-4 py-3 space-y-1">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-3 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/5"
            >
              {l.label}
            </Link>
          ))}
          {user?.is_admin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 rounded-xl text-sm font-medium text-lime hover:bg-lime/10"
            >
              Admin panel
            </Link>
          )}
          <div className="h-px bg-white/5 my-2" />
          {isAuthenticated ? (
            <>
              <Link
                href="/profil"
                onClick={() => setOpen(false)}
                className="block px-4 py-3 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/5"
              >
                Profilom
              </Link>
              <button
                onClick={() => {
                  setOpen(false);
                  handleLogout();
                }}
                className="block w-full text-left px-4 py-3 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/5"
              >
                Kijelentkezés
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="block px-4 py-3 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/5"
              >
                Belépés
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="block px-4 py-3 rounded-xl text-sm font-bold text-center btn-lime"
              >
                Regisztráció
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
