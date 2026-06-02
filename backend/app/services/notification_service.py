import httpx
import os
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

# Global HTTP client to prevent port exhaustion
_http_client = httpx.AsyncClient()

async def close_notification_client():
    await _http_client.aclose()


async def send_telegram_message(chat_id: int, text: str, reply_markup: dict | None = None):
    """
    Sends a telegram message using the global HTTP client pool.
    Supports optional inline keyboard markup.
    """
    if not TELEGRAM_BOT_TOKEN:
        print(f"[Telegram Mock Send to {chat_id}]: {text}")
        return

    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        response = await _http_client.post(f"{TELEGRAM_API}/sendMessage", json=payload)
        response.raise_for_status()
    except Exception as e:
        print(f"Failed to send Telegram message to {chat_id}: {e}")


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