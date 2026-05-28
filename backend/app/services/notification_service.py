import httpx
import os
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"


async def send_telegram_message(chat_id: int, text: str):
    async with httpx.AsyncClient() as client:
        await client.post(f"{TELEGRAM_API}/sendMessage", json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML"
        })


async def notify_coordinator(coordinator_chat_id: int, patient_name: str, alert_type: str, severity: str, message: str):
    severity_emoji = {
        "low": "🟡",
        "medium": "🟠",
        "high": "🔴",
        "critical": "🚨"
    }

    type_label = {
        "missed_medication": "Missed Medication",
        "no_response": "No Response",
        "flagged": "Health Concern"
    }

    emoji = severity_emoji.get(severity, "⚠️")
    label = type_label.get(alert_type, alert_type)

    text = f"""{emoji} <b>Alert: {label}</b>

<b>Patient:</b> {patient_name}
<b>Severity:</b> {severity.upper()}
<b>Details:</b> {message}

Reply with /alerts to see all open alerts."""

    await send_telegram_message(coordinator_chat_id, text)


async def send_family_summary(family_chat_id: int, summary: str):
    await send_telegram_message(family_chat_id, summary)