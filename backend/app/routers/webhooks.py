"""
Telegram webhook router.
Handles:
  - /start deep-link onboarding (patient + family)
  - Medication reminder replies (inline button callbacks or text replies via medication_agent)
  - Wellness check-in replies (wellness_agent)
  - Unrecognised messages (friendly fallback)
  - Webhook secret token validation
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
from app.routers.scheduling import VisitSchedule

import os
import uuid
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET")

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
        import pytz
        
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return False
            
        tz_name = patient.timezone if patient.timezone else "Asia/Kolkata"
        try:
            tz = pytz.timezone(tz_name)
        except Exception:
            tz = pytz.timezone("Asia/Kolkata")
            
        # Get patient's local midnight in UTC
        local_now = datetime.now(tz)
        local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        utc_today_start = local_start.astimezone(pytz.utc).replace(tzinfo=None)
        
        return db.query(WellnessLog).filter(
            WellnessLog.patient_id    == patient_id,
            WellnessLog.status        == "pending",
            WellnessLog.check_in_date >= utc_today_start,
        ).first() is not None
    except Exception as e:
        print(f"Error checking pending wellness: {e}")
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
        # ── 1. Secure Webhook Signature Token ─────────────────────────────────
        if TELEGRAM_WEBHOOK_SECRET:
            header_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
            if header_secret != TELEGRAM_WEBHOOK_SECRET:
                print("Webhook security check failed: unauthorized secret token.")
                return {"status": "unauthorized"}

        data = await request.json()

        # ── 2. Handle Inline Keyboard Callback Queries ─────────────────────────
        if "callback_query" in data:
            callback_query = data["callback_query"]
            chat_id = callback_query["message"]["chat"]["id"]
            callback_data = callback_query["data"]
            sender = callback_query["from"].get("first_name", "Patient")

            # Find patient linked to Telegram Chat
            patient = db.query(Patient).filter(Patient.telegram_chat_id == chat_id).first()
            if not patient:
                return {"status": "patient_not_found"}

            parts = callback_data.split(":")
            action = parts[0]
            status_str = parts[1]  # "confirmed" or "missed"

            coordinator = patient.coordinator

            if action == "med":
                log_id = uuid.UUID(parts[2])
                log = db.query(MedicationLog).filter(MedicationLog.id == log_id).first()
                if log:
                    valid_states = ["confirmed", "missed", "flagged"]
                    log.status = MedicationStatus[status_str] if status_str in valid_states else MedicationStatus.pending
                    log.patient_reply = f"[Button Click] {status_str.upper()}"
                    log.ai_interpretation = status_str
                    if status_str == "confirmed":
                        log.confirmed_at = datetime.utcnow()

                    if status_str in ["missed", "flagged"]:
                        alert = Alert(
                            patient_id=patient.id,
                            type=AlertType.missed_medication if status_str == "missed" else AlertType.flagged,
                            severity=AlertSeverity.high if status_str == "missed" else AlertSeverity.medium,
                            message=f"{patient.name} confirmed missed medication: {log.medication.name if log.medication else 'Medication'}",
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

                    med_name = log.medication.name if log.medication else "your medication"
                    feedback_text = (
                        f"✅ Got it, {patient.name}! You confirmed taking {med_name}. Stay healthy! 😊"
                        if status_str == "confirmed" else
                        f"⚠️ Thank you for letting us know, {patient.name}. We've logged that you missed {med_name}. Take care! ❤️"
                    )
                    await send_telegram_message(chat_id, feedback_text)

            elif action == "med_batch":
                log_ids = [uuid.UUID(lid) for lid in parts[2].split(",")]
                logs = db.query(MedicationLog).filter(MedicationLog.id.in_(log_ids)).all()

                for log in logs:
                    log.status = MedicationStatus[status_str]
                    log.patient_reply = f"[Button Batch Click] {status_str.upper()}"
                    log.ai_interpretation = status_str
                    if status_str == "confirmed":
                        log.confirmed_at = datetime.utcnow()

                    if status_str in ["missed", "flagged"]:
                        alert = Alert(
                            patient_id=patient.id,
                            type=AlertType.missed_medication if status_str == "missed" else AlertType.flagged,
                            severity=AlertSeverity.high if status_str == "missed" else AlertSeverity.medium,
                            message=f"{patient.name} confirmed missed medications in batch.",
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

                feedback_text = (
                    f"✅ Got it, {patient.name}! You confirmed taking all medications. Stay healthy! 😊"
                    if status_str == "confirmed" else
                    f"⚠️ Thank you for letting us know, {patient.name}. We've logged that you missed all medications. Take care! ❤️"
                )
                await send_telegram_message(chat_id, feedback_text)

            elif action == "visit":
                visit_id = uuid.UUID(parts[2])
                visit = db.query(VisitSchedule).filter(VisitSchedule.id == visit_id).first()
                if visit:
                    lang = patient.language.value if patient.language else "en"
                    if status_str == "yes":
                        visit.status = "confirmed"
                        db.commit()

                        feedback_messages = {
                            "en": f"✅ Thank you {patient.name}! Your visit has been confirmed for today at {visit.time_slot or 'today'}.",
                            "ar": f"✅ شكراً {patient.name}! تم تأكيد زيارتك اليوم في تمام الساعة {visit.time_slot or 'اليوم'}.",
                            "ml": f"✅ നന്ദി {patient.name}! നിങ്ങളുടെ ഇന്നത്തെ സന്ദർശനം സമയം {visit.time_slot or 'ഇന്ന്'} ഉറപ്പിച്ചു കഴിഞ്ഞു."
                        }
                        await send_telegram_message(chat_id, feedback_messages.get(lang, feedback_messages["en"]))

                        # Notify coordinator
                        if coordinator and coordinator.active and coordinator.telegram_chat_id:
                            coord_msg = (
                                f"✅ <b>Visit Confirmed by Patient</b>\n\n"
                                f"<b>{patient.name}</b> has confirmed the visit scheduled for today at <b>{visit.time_slot or 'today'}</b>."
                            )
                            await send_telegram_message(coordinator.telegram_chat_id, coord_msg)
                    else:
                        # Mark as cancelled
                        visit.status = "cancelled_by_patient"
                        db.commit()

                        feedback_messages = {
                            "en": f"⚠️ Thanks for letting us know, {patient.name}. We have informed your coordinator that this time does not work for you.",
                            "ar": f"⚠️ شكراً لإعلامنا {patient.name}. لقد أبلغنا المنسق بأن هذا الوقت لا يناسبك.",
                            "ml": f"⚠️ അറിയിച്ചതിന് നന്ദി {patient.name}. ഈ സമയം നിങ്ങൾക്ക് സൗകര്യപ്രദമല്ല എന്ന് ഞങ്ങൾ കോർഡിനേറ്ററെ അറിയിച്ചിട്ടുണ്ട്."
                        }
                        await send_telegram_message(chat_id, feedback_messages.get(lang, feedback_messages["en"]))

                        # Notify coordinator
                        if coordinator and coordinator.active and coordinator.telegram_chat_id:
                            coord_msg = (
                                f"❌ <b>Visit Declined by Patient</b>\n\n"
                                f"<b>{patient.name}</b> has declined the visit scheduled for today at <b>{visit.time_slot or 'today'}</b>. Please contact them to reschedule."
                            )
                            await send_telegram_message(coordinator.telegram_chat_id, coord_msg)

            return {"status": "ok"}

        # ── 3. Handle Standard Text Messages ──────────────────────────────────
        message = data.get("message", {})
        chat_id = message.get("chat", {}).get("id")
        text    = message.get("text", "")
        sender  = message.get("from", {}).get("first_name", "Patient")

        if not chat_id or not text:
            return {"status": "ok"}

        print(f"Message from {sender} ({chat_id}): {text}")

        # /start command onboarding
        if text.startswith("/start"):
            await handle_start_command(chat_id, text, sender, db)
            return {"status": "ok"}

        if text.startswith("/"):
            return {"status": "ok"}

        # Find patient linked to Telegram Chat
        patient = db.query(Patient).filter(Patient.telegram_chat_id == chat_id).first()
        if not patient:
            await send_telegram_message(
                chat_id,
                "Sorry, your Telegram is not linked to a patient profile.\n"
                "Please use the onboarding link sent by your care coordinator."
            )
            return {"status": "ok"}

        # (Rescheduling agent check bypassed — keeping button confirm/cancel flow only)

        # Route: wellness check-in response
        if _has_pending_wellness(patient.id, db):
            from app.routers.wellness import handle_wellness_response
            await handle_wellness_response(
                patient_telegram_id=chat_id,
                message=text,
                db=db,
            )
            return {"status": "ok"}

        # Route: medication text replies (e.g., patient typed a custom explanation)
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

            # Call AI Medication Agent to interpret the patient's custom text reply
            result = await interpret_patient_reply(
                patient_name=patient.name,
                medications=meds_for_agent,
                message=text,
                patient_id=patient.id,
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

        # Fallback: no pending flow, send default warm message
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