"use client";

import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/store";
import { API_URL } from "@/lib/api";

/* Google OAuth visszatérési pont: a backend ide irányít ?token=... paraméterrel,
   itt lekérjük a usert és elmentjük a sessiont. */
function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get("token");
    if (!token) {
      toast.error("Sikertelen bejelentkezés");
      router.replace("/login");
      return;
    }

    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("auth failed");
        return r.json();
      })
      .then((user) => {
        setAuth(token, user);
        toast.success("Sikeres bejelentkezés!");
        router.replace("/tippek");
      })
      .catch(() => {
        toast.error("Sikertelen bejelentkezés");
        router.replace("/login");
      });
  }, [router, searchParams, setAuth]);

  return (
    <div className="min-h-screen hero-bg flex items-center justify-center">
      <Loader2 className="animate-spin text-lime" size={32} />
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen hero-bg flex items-center justify-center">
          <Loader2 className="animate-spin text-lime" size={32} />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
