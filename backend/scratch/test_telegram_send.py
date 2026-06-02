import asyncio
import httpx

BOT_TOKEN = "8205942130:AAGCaFiVxQ1SUx-6EWQdxCaI_50TC5NFC_4"
CHAT_ID = "6989262937"

async def test_send():
    print(f"Testing Telegram message delivery to {CHAT_ID}...")
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": "🌟 <b>Care Platform Test</b>\n\nHello Alan! This is a test message to verify the bot delivery.",
        "parse_mode": "HTML"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)
        print("Status Code:", response.status_code)
        print("Response JSON:", response.json())

if __name__ == "__main__":
    asyncio.run(test_send())
