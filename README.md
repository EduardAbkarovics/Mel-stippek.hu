# Melóstippek.hu

Előfizetés-alapú tippmix oldal — foci, e-sport és élő fogadási tippek magyar nyelven.

## Stack

- **Backend:** Rust (Axum) + MongoDB Atlas — port `8080`
- **Frontend:** Next.js 15 + TypeScript + Tailwind (shadcn struktúra) — port `3000`
- **Fizetés:** SimplePay (OTP) — havi ismétlődő előfizetés (recurring token), HUF
- **Login:** Email+jelszó, Google OAuth, Telegram widget — sessionök MongoDB-ben

## Indítás

```bash
# Backend (előbb build, ha változott a kód):
cd backend
cargo +stable-x86_64-pc-windows-gnu build --release --target x86_64-pc-windows-gnu
E:\programozas\melostippek-target\x86_64-pc-windows-gnu\release\server.exe

# Frontend:
cd frontend
npm install
npm run dev        # fejlesztés
npm run build && npm run start   # éles
```

vagy egyben: `start.bat`

> A cargo build kimenete az `E:/programozas/melostippek-target` mappába megy
> (`backend/.cargo/config.toml`), mert a MinGW linker nem bírja az ékezetes útvonalat.

## Csomagok

| Csomag | Ár | Tartalom |
|---|---|---|
| Foci (WB csoport) | **9 990 Ft** ~~19 990 Ft~~ | napi 2-5 foci tipp |
| E-sport | **7 990 Ft** | CS2 / LoL / Dota 2 tippek |
| Élő tippek | **9 990 Ft** | csak élő, meccs közbeni tippek |

Alkategóriák (minden csomagban): **Over/Under**, **Win**, **Light** fogadások.
A lejárt előfizetés automatikusan elveszti a hozzáférést (a backend minden
kérésnél az `expires_at`-ot ellenőrzi).

## Hiányzó kulcsok (backend/.env)

A rendszer ezek nélkül is fut, de a hozzájuk tartozó funkció inaktív:

| Kulcs | Mihez kell | Honnan |
|---|---|---|
| `SIMPLEPAY_MERCHANT` | fizetés | SimplePay kereskedői fiók (sandbox: `PUBLICTESTHUF`) |
| `SIMPLEPAY_SECRET_KEY` | aláírás (HMAC-SHA384) | SimplePay fiók (sandbox: `FxDa5w314kLlNseq2sKuVwaqZshZT5d6`) |
| `SIMPLEPAY_SANDBOX` | teszt/éles kapcsoló | `true` = sandbox (nincs valós terhelés), élesben `false`. IPN URL: `https://<backend>/api/payments/ipn` |
| `ODDS_API_KEY` | foci + élő meccsnaptár az adminban | the-odds-api.com (ingyenes: 500 kérés/hó) |
| `PANDASCORE_API_KEY` | e-sport meccsnaptár | pandascore.co (ingyenes) |
| `SMTP_PASS` | jelszó reset email Gmailen át | Google fiók → Biztonság → Alkalmazásjelszavak |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME` | Telegram login/linkelés | @BotFather → új bot → `/setdomain` a domainre |

## Admin

Admin emailek a `backend/.env` `ADMIN_EMAILS` változójában (nem hardcode-olt):
`eduardabkarovics1@gmail.com, privatecompany888@gmail.com`

Admin panel: `/admin` — meccsnaptár (foci/e-sport/élő oddsokkal, API kulcsok
proxy-zva a backenden, sosem kerülnek a frontendre), tipp felvétel popupból,
tippek törlése / eredmény jelölés (Nyerő/Vesztes), user + előfizetés lista.

## MongoDB

Atlas cluster (a prezentacio_weboldal projektből átvéve), adatbázis: `melostippek`.
Collectionök: `users`, `sessions` (TTL indexszel), `subscriptions`, `tips`.

## Google OAuth

A meglévő Google client-et használja (prezentacio_weboldal). A Google Cloud
Console-ban a redirect URI-k közé fel kell venni:
`http://localhost:8080/api/auth/google/callback` (és élesben a domain-es változatot).
