# Melóstippek.hu — Fejlesztési szabályok

## Stack
- **Backend:** Rust (Axum) + MongoDB @ `backend/` → port 8080
- **Frontend:** Next.js 15 + TS + Tailwind @ `frontend/` → port 3000
- **Backend build:** `cargo +stable-x86_64-pc-windows-gnu build --release --target x86_64-pc-windows-gnu`
  (PATH-ban kell: `C:\msys64\mingw64\bin`; kimenet: `E:/programozas/melostippek-target` — az ékezetes
  projektútvonal miatt van áthelyezve a `.cargo/config.toml`-ban!)
- **Indítás:** `start.bat`

## Konvenciók
- Minden szöveg MAGYAR, nincs i18n.
- Sötét téma: `ink-*` színek + `lime` akcent (tailwind.config.ts), `slip-card` / `slip-inner` / `btn-lime` osztályok (globals.css).
- Mobil reszponzivitás mindenhol: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `text-base sm:text-lg`, `w-full sm:w-auto`, `p-4 sm:p-6` minták.
- Auth: opaque session token (Authorization: Bearer), MongoDB `sessions` collectionben sha256 hash-elve, TTL indexszel.
- Admin jogosultság: `ADMIN_EMAILS` env (sosem hardcode).
- API kulcsok (Stripe, Odds API, PandaScore, DeepSeek) CSAK a backenden — a frontend mindent a backend proxy-n át kér.
- Csomag ID-k: `foci` | `esport` | `elo`. Kategóriák: `over_under` | `win` | `light`.
- Tipp eredmények: `pending` | `won` | `lost`.

## Fontos fájlok
| Fájl | Mit csinál |
|---|---|
| `backend/src/routes/auth.rs` | register/login/Google/Telegram/jelszó reset |
| `backend/src/routes/payments.rs` + `services/stripe.rs` | Stripe checkout (subscription, HUF) + webhook + confirm + cancel + ügyfélportál; a havi megújítást a Stripe kezeli; fizetési Discord-értesítő (DISCORD_WEBHOOK_PAYMENT) |
| `backend/src/services/odds.rs` | odds-api.io (foci+élő, max 2 bookmaker: Bet365+TippmixPRO) + PandaScore (e-sport) proxy, 10 perc cache |
| `backend/src/routes/admin.rs` | naptár, tipp CRUD, userek |
| `backend/src/routes/discord.rs` + `services/discord_bot.rs` | Discord fiók-link (OAuth) + előfizetés-alapú rang-sync (bot REST, óránkénti sweep a main.rs-ben) |
| `frontend/app/admin/page.tsx` | admin UI: naptár, odds popup, tipp kezelés |
| `frontend/components/proof-card.tsx` | bizonyíték szelvények (PROOFS adat) |
| `backend/.env` | minden kulcs és beállítás |
