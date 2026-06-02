#!/bin/bash
BOT_TOKEN="8205942130:AAGCaFiVxQ1SUx-6EWQdxCaI_50TC5NFC_4"
CLOUDFLARE_URL="https://hose-occasion-step-tions.trycloudflare.com"
SECRET="CarePlatformSecureToken2026"

curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${CLOUDFLARE_URL}/api/webhooks/telegram\", \"secret_token\": \"${SECRET}\"}"