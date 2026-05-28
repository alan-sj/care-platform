from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import (
    Patient, Medication, MedicationLog, Alert, FamilyContact,
    MedicationStatus, AlertType, AlertSeverity, AlertStatus
)
from app.agents.medication_agent import interpret_patient_reply
from app.services.notification_service import send_telegram_message, notify_coordinator
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


async def handle_start_command(chat_id: int, text: str, sender: str, db: Session):
    """Handle /start commands — supports deep link onboarding via /start CARE-XXXX or FAM-XXXX."""
    parts = text.strip().split(maxsplit=1)
    param = parts[1].strip() if len(parts) > 1 else ""

    if not param:
        await send_telegram_message(
            chat_id,
            "👋 Welcome to Care Platform!\n\n"
            "To link your account, please use the onboarding link sent to you by your care coordinator."
        )
        return

    # ── Patient onboarding ──────────────────────────────────────────────────
    if param.startswith("CARE-"):
        patient = db.query(Patient).filter(Patient.onboarding_code == param).first()

        if not patient:
            await send_telegram_message(
                chat_id,
                "❌ This onboarding link is invalid or has expired.\n"
                "Please contact your care coordinator for a new link."
            )
            return

        if patient.telegram_chat_id and patient.telegram_chat_id != chat_id:
            await send_telegram_message(
                chat_id,
                "⚠️ This onboarding link has already been used.\n"
                "Please contact your care coordinator if you need help."
            )
            return

        if patient.telegram_chat_id == chat_id:
            await send_telegram_message(
                chat_id,
                f"✅ You're already connected, {patient.name}!\n"
                "You'll receive your medication reminders here."
            )
            return

        patient.telegram_chat_id = chat_id
        db.commit()

        lang = patient.language.value if patient.language else "en"
        greetings = {
            "en": (
                f"✅ Welcome, <b>{patient.name}</b>!\n\n"
                "You're now connected to your care platform. "
                "You'll receive medication reminders here and can reply to confirm or report how you're feeling.\n\n"
                "💊 We'll remind you when it's time to take your medications."
            ),
            "ar": (
                f"✅ مرحباً، <b>{patient.name}</b>!\n\n"
                "تم ربط حسابك بنجاح. ستصلك تذكيرات الدواء هنا ويمكنك الرد لتأكيد تناوله أو الإبلاغ عن حالتك."
            ),
            "ml": (
                f"✅ സ്വാഗതം, <b>{patient.name}</b>!\n\n"
                "നിങ്ങളുടെ അക്കൗണ്ട് ബന്ധിപ്പിച്ചു. മരുന്ന് ഓർമ്മപ്പെടുത്തലുകൾ ഇവിടെ ലഭിക്കും."
            ),
        }
        await send_telegram_message(chat_id, greetings.get(lang, greetings["en"]))

        coordinator = patient.coordinator
        if coordinator and coordinator.active and coordinator.telegram_chat_id:
            await send_telegram_message(
                coordinator.telegram_chat_id,
                f"🔗 <b>{patient.name}</b> has successfully linked their Telegram account and is now connected to the care platform."
            )
        return

    # ── Family contact onboarding ───────────────────────────────────────────
    if param.startswith("FAM-"):
        contact = db.query(FamilyContact).filter(FamilyContact.onboarding_code == param).first()

        if not contact:
            await send_telegram_message(
                chat_id,
                "❌ This onboarding link is invalid or has expired.\n"
                "Please contact the care coordinator for a new link."
            )
            return

        if contact.telegram_chat_id and contact.telegram_chat_id != chat_id:
            await send_telegram_message(
                chat_id,
                "⚠️ This onboarding link has already been used.\n"
                "Please contact the care coordinator if you need help."
            )
            return

        if contact.telegram_chat_id == chat_id:
            patient = db.query(Patient).filter(Patient.id == contact.patient_id).first()
            await send_telegram_message(
                chat_id,
                f"✅ You're already connected as {contact.relation or 'family contact'} of <b>{patient.name if patient else 'your patient'}</b>!"
            )
            return

        contact.telegram_chat_id = chat_id
        db.commit()

        patient = db.query(Patient).filter(Patient.id == contact.patient_id).first()
        patient_name = patient.name if patient else "your patient"
        relation = contact.relation or "family contact"

        await send_telegram_message(
            chat_id,
            f"✅ Welcome, <b>{contact.name}</b>!\n\n"
            f"You're now connected as <b>{patient_name}</b>'s {relation}. "
            f"You'll receive health updates and summaries here."
        )

        # Notify coordinator
        if patient and patient.coordinator and patient.coordinator.active and patient.coordinator.telegram_chat_id:
            await send_telegram_message(
                patient.coordinator.telegram_chat_id,
                f"🔗 <b>{contact.name}</b> ({relation} of {patient_name}) has successfully linked their Telegram account."
            )
        return

    # Unknown code format
    await send_telegram_message(
        chat_id,
        "❌ This onboarding link is invalid.\n"
        "Please contact your care coordinator for a new link."
    )


@router.post("/telegram")
async def telegram_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()

        message = data.get("message", {})
        chat_id = message.get("chat", {}).get("id")
        text = message.get("text", "")
        sender = message.get("from", {}).get("first_name", "Patient")

        if not chat_id or not text:
            return {"status": "ok"}

        print(f"Message from {sender} ({chat_id}): {text}")

        # Handle /start (deep link onboarding)
        if text.startswith("/start"):
            await handle_start_command(chat_id, text, sender, db)
            return {"status": "ok"}

        # Ignore other bot commands
        if text.startswith("/"):
            return {"status": "ok"}

        # Find patient by telegram chat_id
        patient = db.query(Patient).filter(
            Patient.telegram_chat_id == chat_id
        ).first()

        if not patient:
            await send_telegram_message(
                chat_id,
                "Sorry, your Telegram is not linked to a patient profile.\n"
                "Please use the onboarding link sent by your care coordinator."
            )
            return {"status": "ok"}

        # Get their first active medication for context
        medication = db.query(Medication).filter(
            Medication.patient_id == patient.id,
            Medication.active == True
        ).first()

        med_name = medication.name if medication else "your medication"

        # Call AI agent
        result = await interpret_patient_reply(
            patient_name=patient.name,
            medication_name=med_name,
            message=text
        )

        print(f"Agent result: {result}")
        print(f"Status value: '{result['status']}'")

        # Log to medication_logs
        if medication:
            log = MedicationLog(
                patient_id=patient.id,
                medication_id=medication.id,
                scheduled_time=datetime.utcnow(),
                status=MedicationStatus[result["status"]] if result["status"] in ["confirmed", "missed", "flagged"] else MedicationStatus.pending,
                patient_reply=text,
                ai_interpretation=result.get("concern") or result["status"],
                confirmed_at=datetime.utcnow() if result["status"] == "confirmed" else None
            )
            db.add(log)

        # Create alert and notify coordinator if missed or flagged
        if result["status"] in ["missed", "flagged"] and medication:
            alert = Alert(
                patient_id=patient.id,
                type=AlertType.missed_medication if result["status"] == "missed" else AlertType.flagged,
                severity=AlertSeverity.high if result["status"] == "missed" else AlertSeverity.medium,
                message=result.get("concern") or f"Patient replied: {text}",
                status=AlertStatus.open
            )
            db.add(alert)
            db.commit()

            coordinator = patient.coordinator
            if coordinator and coordinator.active and coordinator.telegram_chat_id:
                await notify_coordinator(
                    coordinator_chat_id=coordinator.telegram_chat_id,
                    patient_name=patient.name,
                    alert_type=alert.type.value,
                    severity=alert.severity.value,
                    message=alert.message
                )
        else:
            db.commit()

        # Send reply to patient
        await send_telegram_message(chat_id, result["reply"])

    except Exception as e:
        print(f"Webhook error: {e}")

    return {"status": "ok"}


@router.post("/telegram/send")
async def send_message(chat_id: int, text: str):
    await send_telegram_message(chat_id, text)
    return {"status": "sent"}