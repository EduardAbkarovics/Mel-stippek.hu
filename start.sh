#!/usr/bin/env bash
set -euo pipefail

# Elsődleges domain az ékezet nélküli; az ékezetes melóstippek.hu
# (punycode: xn--melstippek-ibb.hu) másodlagosként szintén kiszolgált.
DOMAIN="${DOMAIN:-melostippek.hu}"
WWW_DOMAIN="${WWW_DOMAIN:-www.${DOMAIN}}"
EXTRA_DOMAINS="${EXTRA_DOMAINS:-xn--melstippek-ibb.hu www.xn--melstippek-ibb.hu}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
SSL_EMAIL="${SSL_EMAIL:-eduardabkarovics1@gmail.com}"
DEPLOY_REPO="${DEPLOY_REPO:-/home/deploy/Mel-stippek.hu}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Ezt rootkent futtasd: su - root, majd ./start.sh"
  exit 1
fi

echo "== Melostippek.hu telepites indul =="
echo "Domain: ${DOMAIN}"
echo "Mappa: ${APP_DIR}"

# Friss kod lehuzasa, majd a script ujrainditasa az uj verzioval.
# A MELOSTIPPEK_PULLED flag vedi ki a vegtelen ciklust, az exec pedig azt,
# hogy a bash a futas kozben modosult scriptet olvasson tovabb.
if [ "${MELOSTIPPEK_PULLED:-0}" != "1" ] && [ -d "${APP_DIR}/.git" ]; then
  echo "== Friss kod lehuzasa =="
  cd "${APP_DIR}"
  git config --global --add safe.directory "${DEPLOY_REPO}" >/dev/null 2>&1 || true
  # a file-transport remote-hoz a .git utvonal is kell a safe.directory-ba
  git config --global --add safe.directory "${DEPLOY_REPO}/.git" >/dev/null 2>&1 || true
  # CSAK fast-forward pull — szettarto agaknal nem probal merge-elni, hanem
  # ertheto utasitast ad. Igy nem fordulhat elo a "divergent branches" hiba.
  pull_ff() {
    if [ "${APP_DIR}" != "${DEPLOY_REPO}" ] && [ -d "${DEPLOY_REPO}/.git" ]; then
      git pull --ff-only "${DEPLOY_REPO}" main 2>/dev/null && return 0
    fi
    git pull --ff-only origin main
  }
  if ! pull_ff; then
    cat <<'DIVERGED'

!! HIBA: a szerveren olyan commitok vannak, amik nincsenek fent GitHubon.
!! NE futtass "git reset --hard"-ot, mert elveszne a helyi munka!
!! Mentsd fel a helyi munkat GitHubra, utana futtasd ujra a start.sh-t:
!!
!!   git branch szerver-mentes
!!   git push origin szerver-mentes
!!
!! Majd a Windows gepen Claude osszefesuli a szerver-mentes agat a main-nel.

DIVERGED
    exit 1
  fi
  MELOSTIPPEK_PULLED=1 exec "${APP_DIR}/start.sh"
fi

apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  git \
  build-essential \
  pkg-config \
  libssl-dev \
  nginx \
  certbot \
  python3-certbot-nginx

install_node() {
  local major="0"
  if command -v node >/dev/null 2>&1; then
    major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  fi

  if [ "${major}" -lt 20 ]; then
    echo "== Node.js 22 telepites =="
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list
    apt-get update
    apt-get install -y nodejs
  fi
}

install_rust() {
  if ! command -v cargo >/dev/null 2>&1; then
    echo "== Rust telepites =="
    curl https://sh.rustup.rs -sSf | sh -s -- -y
  fi
  # shellcheck disable=SC1091
  source "${HOME}/.cargo/env"
}

install_node
install_rust

cd "${APP_DIR}"

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  cat <<MSG

== backend/.env letrehozva ==
Toltsd ki ezt a fajlt eles kulcsokkal:

  ${APP_DIR}/backend/.env

Legalabb ezek kellenek:
  MONGODB_URL
  SIMPLEPAY_MERCHANT
  SIMPLEPAY_SECRET_KEY

Utana futtasd ujra:
  cd ${APP_DIR}
  ./start.sh

MSG
  exit 1
fi

if grep -Eq '^MONGODB_URL=$' backend/.env; then
  echo "HIBA: backend/.env fajlban a MONGODB_URL ures. Toltsd ki, majd futtasd ujra."
  exit 1
fi

# Hianyzo env kulcsok automatikus potlasa: ha egy uj release uj kulcsot igenyel,
# itt hozzafuzodik uresen a backend/.env-hez, a vegen pedig figyelmeztetes szol rola.
# Igy a start.sh sosem hasal el azert, mert egy kulcs meg nem letezik a fajlban.
ENV_KEYS="STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET DEEPSEEK_API_KEY \
DISCORD_WEBHOOK_PAYMENT DISCORD_WEBHOOK_SIGNUP DISCORD_WEBHOOK_VISIT \
DISCORD_CLIENT_ID DISCORD_CLIENT_SECRET DISCORD_BOT_TOKEN \
ODDS_API_KEY PANDASCORE_API_KEY"
MISSING_VALUES=""
for key in ${ENV_KEYS}; do
  if ! grep -q "^${key}=" backend/.env; then
    echo "${key}=" >> backend/.env
    echo "  + backend/.env: ${key} kulcs hozzaadva (ures)"
  fi
  if grep -Eq "^${key}=$" backend/.env; then
    MISSING_VALUES="${MISSING_VALUES} ${key}"
  fi
done

echo "== Frontend dependency telepites =="
npm install

echo "== Frontend build =="
npm run build

echo "== Backend build =="
cd "${APP_DIR}/backend"
CARGO_TARGET_DIR="${APP_DIR}/backend/target" cargo build --release

echo "== systemd service-ek letrehozasa =="
cat > /etc/systemd/system/melostippek-backend.service <<SERVICE
[Unit]
Description=Melostippek Rust backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/backend
EnvironmentFile=${APP_DIR}/backend/.env
ExecStart=${APP_DIR}/backend/target/release/server
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

cat > /etc/systemd/system/melostippek-frontend.service <<SERVICE
[Unit]
Description=Melostippek Next.js frontend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/frontend
Environment=NODE_ENV=production
Environment=PORT=${FRONTEND_PORT}
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1 -p ${FRONTEND_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable melostippek-backend melostippek-frontend
systemctl restart melostippek-backend melostippek-frontend

echo "== Nginx beallitas =="
cat > /etc/nginx/sites-available/melostippek.hu <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN} ${EXTRA_DOMAINS};

    client_max_body_size 10m;

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX

ln -sfn /etc/nginx/sites-available/melostippek.hu /etc/nginx/sites-enabled/melostippek.hu
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "== SSL tanusitvany probalkozas =="
CERT_ARGS=(-d "${DOMAIN}" -d "${WWW_DOMAIN}")
for d in ${EXTRA_DOMAINS}; do CERT_ARGS+=(-d "$d"); done
if certbot --nginx "${CERT_ARGS[@]}" \
  --non-interactive --agree-tos -m "${SSL_EMAIL}" --redirect --expand; then
  echo "SSL kesz."
else
  cat <<MSG
SSL most nem sikerult minden domainre. Ez altalaban akkor van, ha valamelyik
domain DNS-e meg nem erre a VPS-re mutat. A mar meglevo tanusitvany ervenyes
marad, az oldal megy tovabb. SSL-hez futtasd kesobb:

  certbot --nginx ${CERT_ARGS[@]} --agree-tos -m ${SSL_EMAIL} --redirect --expand

MSG
fi

echo "== Status =="
systemctl --no-pager --full status melostippek-backend || true
systemctl --no-pager --full status melostippek-frontend || true
systemctl --no-pager --full status nginx || true

cat <<MSG

Kesz.

Oldal:
  http://${DOMAIN}
  https://${DOMAIN}   ha az SSL sikerult

Logok:
  journalctl -u melostippek-backend -f
  journalctl -u melostippek-frontend -f
  journalctl -u nginx -f

MSG

if [ -n "${MISSING_VALUES}" ]; then
  cat <<MSG
!! FIGYELEM: az alabbi kulcsok URESEK a backend/.env-ben — a hozzajuk tartozo
!! funkcio addig nem mukodik, amig ki nem toltod oket:
!!  ${MISSING_VALUES}
!!
!! Kitoltes utan: systemctl restart melostippek-backend

MSG
fi
