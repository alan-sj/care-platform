#!/bin/bash
echo "Starting care-db..."
docker start care-db

echo "Starting n8n..."
docker start care-n8n

echo "Starting Cloudflare tunnel..."
cloudflared tunnel --url http://localhost:8001 &

echo "All services started."
echo "Now start FastAPI manually and update set_webhook.sh with new Cloudflare URL"