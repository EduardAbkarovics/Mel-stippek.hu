#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-melostippek.hu}"
WWW_DOMAIN="${WWW_DOMAIN:-www.${DOMAIN}}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
SSL_EMAIL="${SSL_EMAIL:-eduardabkarovics1@gmail.com}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Ezt rootkent futtasd: su - root, majd ./start.sh"
  exit 1
fi

echo "== Melostippek.hu telepites indul =="
echo "Domain: ${DOMAIN}"
echo "Mappa: ${APP_DIR}"

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
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET

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
    server_name ${DOMAIN} ${WWW_DOMAIN};

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
if certbot --nginx -d "${DOMAIN}" -d "${WWW_DOMAIN}" \
  --non-interactive --agree-tos -m "${SSL_EMAIL}" --redirect; then
  echo "SSL kesz."
else
  cat <<MSG
SSL most nem sikerult. Ez altalaban akkor van, ha a DNS meg nem erre a VPS-re mutat.
Az oldal HTTP-n mar indulhat, SSL-hez futtasd kesobb:

  certbot --nginx -d ${DOMAIN} -d ${WWW_DOMAIN} --agree-tos -m ${SSL_EMAIL} --redirect

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
