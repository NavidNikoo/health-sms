#!/usr/bin/env bash
# ============================================================
# Health SMS — Frontend Deployment (S3 + CloudFront)
# ============================================================
# Builds the React app and uploads it to an S3 bucket, then
# invalidates the CloudFront distribution so users get the
# latest version immediately.
#
# Prerequisites:
#   - AWS CLI installed and configured (or running on EC2 with IAM role)
#   - An S3 bucket configured for static website hosting
#   - A CloudFront distribution pointing to that bucket
#
# Required IAM permissions:
#   s3:PutObject, s3:DeleteObject, s3:ListBucket on the bucket
#   cloudfront:CreateInvalidation on the distribution
#
# Usage:
#   S3_BUCKET=health-sms-frontend \
#   CLOUDFRONT_DIST_ID=E1ABC2DEF3GHI \
#   VITE_API_URL=https://api.yourdomain.com/api \
#   ./deploy-frontend.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"

# --- Validate required variables ---------------------------------
: "${S3_BUCKET:?Set S3_BUCKET to your S3 bucket name}"
: "${CLOUDFRONT_DIST_ID:?Set CLOUDFRONT_DIST_ID to your CloudFront distribution ID}"
: "${VITE_API_URL:?Set VITE_API_URL to your backend API URL, e.g. https://api.yourdomain.com/api}"

echo "==> Building frontend..."
cd "$FRONTEND_DIR"
VITE_API_URL="$VITE_API_URL" npm run build

echo "==> Syncing static assets to s3://${S3_BUCKET} (long-lived cache)..."
aws s3 sync dist/ "s3://${S3_BUCKET}/" \
  --delete \
  --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable"

echo "==> Uploading index.html (no-cache)..."
aws s3 cp dist/index.html "s3://${S3_BUCKET}/index.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --content-type "text/html"

echo "==> Invalidating CloudFront distribution ${CLOUDFRONT_DIST_ID}..."
INVALIDATION_ID=$(
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DIST_ID" \
    --paths "/*" \
    --query "Invalidation.Id" \
    --output text
)
echo "    Invalidation ID: $INVALIDATION_ID"

echo ""
echo "============================================================"
echo "  Frontend deployed!"
echo "  Bucket:       s3://${S3_BUCKET}"
echo "  Distribution: ${CLOUDFRONT_DIST_ID}"
echo "  API URL:      ${VITE_API_URL}"
echo "============================================================"
