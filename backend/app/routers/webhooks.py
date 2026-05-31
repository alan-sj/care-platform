"""
Telegram webhook router.
Handles:
  - /start deep-link onboarding (patient + family)
  - Medication reminder replies  → medication_agent
  - Wellness check-in replies    → wellness_agent
  - Unrecognised messages        → friendly fallback
"""

from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from datetime import datetime, date

from app.database import get_db
from app.models.models import (
    Patient, Medication, MedicationLog, Alert, FamilyContact,
    MedicationStatus, AlertType, AlertSeverity, AlertStatus,
)
from app.agents.medication_agent import interpret_patient_reply
from app.services.notification_service import send_telegram_message, notify_coordinator

import os
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


# ── /start onboarding ─────────────────────────────────────────────────────────

async def handle_start_command(chat_id: int, text: str, sender: str, db: Session):
    parts = text.strip().split(maxsplit=1)
    param = parts[1].strip() if len(parts) > 1 else ""

    if not param:
        await send_telegram_message(
            chat_id,
            "👋 Welcome to Care Platform!\n\n"
            "To link your account, please use the onboarding link sent by your care coordinator."
        )
        return

    # Patient onboarding
    if param.startswith("CARE-"):
        patient = db.query(Patient).filter(Patient.onboarding_code == param).first()
        if not patient:
            await send_telegram_message(chat_id, "❌ Invalid onboarding link. Please contact your care coordinator.")
            return
        if patient.telegram_chat_id and patient.telegram_chat_id != chat_id:
            await send_telegram_message(chat_id, "⚠️ This link has already been used.")
            return
        if patient.telegram_chat_id == chat_id:
            await send_telegram_message(chat_id, f"✅ You're already connected, {patient.name}!")
            return

        patient.telegram_chat_id = chat_id
        db.commit()

        lang = patient.language.value if patient.language else "en"
        greetings = {
            "en": (
                f"✅ Welcome, <b>{patient.name}</b>!\n\n"
                "You're now connected to your care platform. "
                "You'll receive medication reminders and daily wellness check-ins here.\n\n"
                "💊 We'll remind you when it's time to take your medications.\n"
                "🌟 Every morning we'll check in on how you're feeling."
            ),
            "ar": f"✅ مرحباً، <b>{patient.name}</b>!\n\nتم ربط حسابك بنجاح.",
            "ml": f"✅ സ്വാഗതം, <b>{patient.name}</b>!\n\nനിങ്ങളുടെ അക്കൗണ്ട് ബന്ധിപ്പിച്ചു.",
        }
        await send_telegram_message(chat_id, greetings.get(lang, greetings["en"]))

        coordinator = patient.coordinator
        if coordinator and coordinator.active and coordinator.telegram_chat_id:
            await send_telegram_message(
                coordinator.telegram_chat_id,
                f"🔗 <b>{patient.name}</b> has successfully linked their Telegram account."
            )
        return

    # Family onboarding
    if param.startswith("FAM-"):
        contact = db.query(FamilyContact).filter(FamilyContact.onboarding_code == param).first()
        if not contact:
            await send_telegram_message(chat_id, "❌ Invalid onboarding link.")
            return
        if contact.telegram_chat_id and contact.telegram_chat_id != chat_id:
            await send_telegram_message(chat_id, "⚠️ This link has already been used.")
            return
        if contact.telegram_chat_id == chat_id:
            patient = db.query(Patient).filter(Patient.id == contact.patient_id).first()
            await send_telegram_message(chat_id, f"✅ Already connected as {contact.relation} of {patient.name if patient else 'your patient'}!")
            return

        contact.telegram_chat_id = chat_id
        db.commit()

        patient  = db.query(Patient).filter(Patient.id == contact.patient_id).first()
        relation = contact.relation or "family contact"
        await send_telegram_message(
            chat_id,
            f"✅ Welcome, <b>{contact.name}</b>!\n\n"
            f"You're now connected as <b>{patient.name if patient else 'your patient'}</b>'s {relation}. "
            "You'll receive health updates and daily summaries here."
        )
        return

    await send_telegram_message(chat_id, "❌ Invalid onboarding link.")


# ── Message routing helpers ───────────────────────────────────────────────────

def _has_pending_wellness(patient_id, db: Session) -> bool:
    """Check if patient has an unanswered wellness check-in today."""
    try:
        from app.routers.wellness import WellnessLog
        today = date.today()
        return db.query(WellnessLog).filter(
            WellnessLog.patient_id    == patient_id,
            WellnessLog.status        == "pending",
            WellnessLog.check_in_date >= datetime.combine(today, datetime.min.time()),
        ).first() is not None
    except Exception:
        return False


def _has_pending_medication(patient_id, db: Session) -> bool:
    """Check if patient has unanswered medication reminders."""
    return db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.status     == MedicationStatus.pending,
    ).first() is not None


# ── Main webhook ──────────────────────────────────────────────────────────────

@router.post("/telegram")
async def telegram_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        data    = await request.json()
        message = data.get("message", {})
        chat_id = message.get("chat", {}).get("id")
        text    = message.get("text", "")
        sender  = message.get("from", {}).get("first_name", "Patient")

        if not chat_id or not text:
            return {"status": "ok"}

        print(f"Message from {sender} ({chat_id}): {text}")

        # /start — onboarding
        if text.startswith("/start"):
            await handle_start_command(chat_id, text, sender, db)
            return {"status": "ok"}

        if text.startswith("/"):
            return {"status": "ok"}

        # Find patient
        patient = db.query(Patient).filter(Patient.telegram_chat_id == chat_id).first()
        if not patient:
            await send_telegram_message(
                chat_id,
                "Sorry, your Telegram is not linked to a patient profile.\n"
                "Please use the onboarding link sent by your care coordinator."
            )
            return {"status": "ok"}

        # ── Route: wellness check-in reply ────────────────────────────────────
        if _has_pending_wellness(patient.id, db):
            from app.routers.wellness import handle_wellness_response
            await handle_wellness_response(
                patient_telegram_id=chat_id,
                message=text,
                db=db,
            )
            return {"status": "ok"}

        # ── Route: medication reminder reply ──────────────────────────────────
        if _has_pending_medication(patient.id, db):
            pending_logs = db.query(MedicationLog).filter(
                MedicationLog.patient_id == patient.id,
                MedicationLog.status     == MedicationStatus.pending,
            ).all()

            seen     = set()
            meds_for_agent = []
            log_map  = {}

            for log in pending_logs:
                med = log.medication
                if not med or med.id in seen:
                    continue
                seen.add(med.id)
                meds_for_agent.append({
                    "index":  len(meds_for_agent) + 1,
                    "name":   med.name,
                    "dosage": med.dosage or "",
                })
                log_map[med.name] = log

            result = await interpret_patient_reply(
                patient_name=patient.name,
                medications=meds_for_agent,
                message=text,
            )

            coordinator = patient.coordinator

            for med_result in result.get("medications", []):
                med_name   = med_result["medication_name"]
                status_str = med_result["status"]
                concern    = med_result.get("concern")

                log = log_map.get(med_name)
                if not log:
                    for name, l in log_map.items():
                        if med_name.lower() in name.lower() or name.lower() in med_name.lower():
                            log = l
                            break
                if not log:
                    continue

                valid = ["confirmed", "missed", "flagged"]
                log.status           = MedicationStatus[status_str] if status_str in valid else MedicationStatus.pending
                log.patient_reply    = text
                log.ai_interpretation = concern or status_str
                if status_str == "confirmed":
                    log.confirmed_at = datetime.utcnow()

                if status_str in ["missed", "flagged"]:
                    alert = Alert(
                        patient_id=patient.id,
                        type=AlertType.missed_medication if status_str == "missed" else AlertType.flagged,
                        severity=AlertSeverity.high if status_str == "missed" else AlertSeverity.medium,
                        message=concern or f"{patient.name} replied '{text}' for {log.medication.name}",
                        status=AlertStatus.open,
                    )
                    db.add(alert)
                    if coordinator and coordinator.active and coordinator.telegram_chat_id:
                        await notify_coordinator(
                            coordinator_chat_id=coordinator.telegram_chat_id,
                            patient_name=patient.name,
                            alert_type=alert.type.value,
                            severity=alert.severity.value,
                            message=alert.message,
                        )

            db.commit()
            await send_telegram_message(chat_id, result["reply"])
            return {"status": "ok"}

        # ── Fallback: no pending task ─────────────────────────────────────────
        await send_telegram_message(
            chat_id,
            f"Thank you for your message, {patient.name}! "
            "Our care team will follow up with you shortly. 😊"
        )

    except Exception as e:
        print(f"Webhook error: {e}")

    return {"status": "ok"}


@router.post("/telegram/send")
async def send_message(chat_id: int, text: str):
    await send_telegram_message(chat_id, text)
    return {"status": "sent"}