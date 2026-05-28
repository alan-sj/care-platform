from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Patient, MedicationLog, FamilyContact, Medication
from app.agents.summary_agent import generate_family_summary
from app.services.notification_service import send_family_summary
from datetime import datetime, date
import pytz

router = APIRouter(prefix="/summaries", tags=["Summaries"])


@router.post("/generate")
async def generate_summaries(db: Session = Depends(get_db)):
    today = date.today()
    results = []

    # Get all active patients
    patients = db.query(Patient).all()

    for patient in patients:
        # Get today's medication logs
        logs = db.query(MedicationLog).filter(
            MedicationLog.patient_id == patient.id,
            MedicationLog.created_at >= datetime.combine(today, datetime.min.time()),
            MedicationLog.created_at <= datetime.combine(today, datetime.max.time())
        ).all()

        if not logs:
            continue

        # Format logs for summary agent
        formatted_logs = []
        for log in logs:
            medication = db.query(Medication).filter(
                Medication.id == log.medication_id
            ).first()

            formatted_logs.append({
                "medication": medication.name if medication else "Unknown",
                "time": log.scheduled_time.strftime("%I:%M %p") if log.scheduled_time else "Unknown",
                "status": log.status.value,
                "reply": log.patient_reply or "No reply"
            })

        # Generate summary via Gemini
        summary = await generate_family_summary(
            patient_name=patient.name,
            logs=formatted_logs
        )

        # Send to all family contacts
        family_contacts = db.query(FamilyContact).filter(
            FamilyContact.patient_id == patient.id
        ).all()

        for contact in family_contacts:
            if contact.telegram_chat_id:
                message = f"👨‍👩‍👧 <b>Daily Update for {patient.name}</b>\n\n{summary}"
                await send_family_summary(contact.telegram_chat_id, message)
                results.append({
                    "patient": patient.name,
                    "family_contact": contact.name,
                    "status": "sent"
                })

    return {"status": "done", "results": results}