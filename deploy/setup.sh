#!/usr/bin/env bash
# ============================================================
# Health SMS — EC2 Bootstrap Script
# ============================================================
# Run this on a fresh Amazon Linux 2023 or Ubuntu 22.04 EC2
# instance to install everything the backend needs.
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
# After running, you still need to:
#   1. Store secrets in AWS SSM Parameter Store (no .env file on the server):
#        aws ssm put-parameter --name /health-sms/prod/PGHOST      --value "<RDS_ENDPOINT>" --type SecureString
#        aws ssm put-parameter --name /health-sms/prod/PGPORT      --value "5432"            --type SecureString
#        aws ssm put-parameter --name /health-sms/prod/PGUSER      --value "<DB_USER>"       --type SecureString
#        aws ssm put-parameter --name /health-sms/prod/PGPASSWORD  --value "<DB_PASS>"       --type SecureString
#        aws ssm put-parameter --name /health-sms/prod/PGDATABASE  --value "health_sms"      --type SecureString
#        aws ssm put-parameter --name /health-sms/prod/JWT_SECRET  --value "<RANDOM_32>"     --type SecureString
#        aws ssm put-parameter --name /health-sms/prod/FRONTEND_ORIGIN --value "https://<CF_DOMAIN>" --type String
#        aws ssm put-parameter --name /health-sms/prod/TWILIO_ACCOUNT_SID --value "<SID>"   --type SecureString
#        aws ssm put-parameter --name /health-sms/prod/TWILIO_AUTH_TOKEN  --value "<TOKEN>" --type SecureString
#      Ensure the EC2 instance role has ssm:GetParametersByPath + kms:Decrypt permissions.
#   2. Initialize the database:
#        psql -h <RDS_ENDPOINT> -U healthsms -d health_sms -f ~/health-sms/backend/schema.sql
#   3. Copy the nginx config:
#        sudo cp ~/health-sms/deploy/nginx.conf /etc/nginx/conf.d/health-sms.conf
#        (edit YOUR_DOMAIN in the file)
#        sudo nginx -t && sudo systemctl restart nginx
#   4. Start the app:
#        cd ~/health-sms/backend
#        pm2 start ecosystem.config.js
#        pm2 save
#        pm2 startup
# ============================================================

set -euo pipefail

echo "==> Detecting OS..."
if command -v yum &>/dev/null; then
    PKG_MANAGER="yum"
elif command -v apt-get &>/dev/null; then
    PKG_MANAGER="apt"
else
    echo "Unsupported OS. Use Amazon Linux 2023 or Ubuntu 22.04."
    exit 1
fi

echo "==> Installing Node.js 20..."
if [ "$PKG_MANAGER" = "yum" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs git nginx postgresql15
elif [ "$PKG_MANAGER" = "apt" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
    sudo apt-get install -y nodejs git nginx postgresql-client
fi

echo "==> Installing PM2..."
sudo npm install -g pm2

echo "==> Cloning repository..."
REPO_URL="${REPO_URL:-https://github.com/NavidNikoo/health-sms.git}"
APP_DIR="$HOME/health-sms"

if [ -d "$APP_DIR" ]; then
    echo "    $APP_DIR already exists, pulling latest..."
    cd "$APP_DIR" && git pull origin main
else
    git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> Installing backend dependencies..."
cd "$APP_DIR/backend"
npm install --production

echo "==> Enabling Nginx..."
sudo systemctl enable nginx
sudo systemctl start nginx

echo ""
echo "============================================================"
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "    1. Add secrets to SSM Parameter Store under /health-sms/prod/"
echo "       (see comments at the top of this script for the full list)"
echo "    2. Init DB:  psql -h <RDS> -U healthsms -d health_sms -f backend/schema.sql"
echo "    3. Copy nginx config:  sudo cp deploy/nginx.conf /etc/nginx/conf.d/health-sms.conf"
echo "    4. Start app:  cd backend && pm2 start ecosystem.config.js"
echo "    5. Deploy frontend:  see deploy/deploy-frontend.sh"
echo "============================================================"
