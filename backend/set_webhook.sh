#!/bin/bash
BOT_TOKEN="8205942130:AAGCaFiVxQ1SUx-6EWQdxCaI_50TC5NFC_4"
CLOUDFLARE_URL="https://upgrade-dream-seeing-objectives.trycloudflare.com"

curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${CLOUDFLARE_URL}/webhooks/telegram\"}"

echo ""
echo "Webhook set to: ${CLOUDFLARE_URL}"