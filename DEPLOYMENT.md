# Vercel deploy

## Fontos

A frontend Next.js app mehet Vercelre. A jelenlegi backend Rust Axum szerver,
ezert kulon folyamatos backend host kell neki, peldaul VPS, Render, Railway,
Fly.io vagy mas Docker/Rust futtatast tamogato szolgaltato.

A Vercel a frontend domain alatt proxyzza az API-t:

```txt
https://melostippek.hu/api/* -> BACKEND_URL/api/*
```

Igy a felhasznalo es a bongeszo felol egy domainnek tunik az egesz oldal.

## Vercel project beallitasok

Importald a GitHub repot Vercelbe, majd:

```txt
Framework Preset: Next.js
Root Directory: frontend
Build Command: npm run build
Install Command: npm install
Output Directory: .next
```

### Vercel environment variables

Production es Preview kornyezetbe:

```txt
BACKEND_URL=https://a-rust-backend-publikus-url-je
```

Ne allits be `NEXT_PUBLIC_API_URL` valtozot productionben, ha azt szeretned,
hogy minden API keres a sajat domainen, `/api` alatt menjen.

Local fejleszteshez a `frontend/.env.local` maradhat:

```txt
NEXT_PUBLIC_API_URL=http://localhost:8080
```

## Backend env elesben

A Rust backend hoston ezek legyenek a fontos URL-ek:

```txt
FRONTEND_URL=https://melostippek.hu
BACKEND_URL=https://melostippek.hu
```

Ez azert kell, mert a Google OAuth es a SimplePay IPN is a publikus domainen
keresztul eri el az API-t, a Vercel rewrite pedig tovabbitja a Rust backendhez.

SimplePay IPN URL (a SimplePay kereskedoi adminban allitsd be):

```txt
https://melostippek.hu/api/payments/ipn
```

Google OAuth redirect URI:

```txt
https://melostippek.hu/api/auth/google/callback
```

## Rackhost DNS Vercelhez

Ha a `melostippek.hu` domaint Vercelre kotod:

```txt
melostippek.hu      A      76.76.21.21
www                 CNAME  cname.vercel-dns.com
```

TTL maradhat `3600`.

Az NS rekordokhoz ne nyulj, ha a Rackhost DNS zonat hasznalod.
MX rekordokhoz csak akkor nyulj, ha domaines emailt is beallitasz.

## Teljes futtatas VPS-en

Ha nem Vercelen akarod futtatni a frontendet, hanem a Rackhost Debian VPS-en:

```bash
cd ~
git clone git@github.com:EduardAbkarovics/Mel-stippek.hu.git
cd Mel-stippek.hu
chmod +x start.sh
./start.sh
```

Az elso futas letrehozza a `backend/.env` fajlt, ha meg nincs. Toltsd ki,
majd futtasd ujra:

```bash
nano backend/.env
./start.sh
```

A script telepiti a szukseges csomagokat, buildeli a frontendet es a Rust
backendet, systemd service-kent elinditja oket, es nginx alatt a
`melostippek.hu` domainre koti az oldalt.

VPS-es DNS beallitas Rackhostban:

```txt
melostippek.hu      A      VPS_IP_CIME
www                 A      VPS_IP_CIME
```
