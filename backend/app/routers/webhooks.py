from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import (
    Patient, Medication, MedicationLog, Alert,
    MedicationStatus, AlertType, AlertSeverity, AlertStatus
)
from app.agents.medication_agent import interpret_patient_reply
from app.services.notification_service import send_telegram_message, notify_coordinator
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@router.post("/telegram")
async def telegram_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()

        message = data.get("message", {})
        chat_id = message.get("chat", {}).get("id")
        text = message.get("text", "")
        sender = message.get("from", {}).get("first_name", "Patient")

        print(f"Message from {sender} ({chat_id}): {text}")

        # Ignore bot commands
        if not chat_id or not text or text.startswith("/"):
            return {"status": "ok"}

        # Find patient by telegram chat_id
        patient = db.query(Patient).filter(
            Patient.telegram_chat_id == chat_id
        ).first()

        if not patient:
            await send_telegram_message(
                chat_id,
                "Sorry, your Telegram is not linked to a patient profile. Please contact your care coordinator."
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

            # Notify coordinator using relationship
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