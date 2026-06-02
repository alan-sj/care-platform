from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Patient, MedicationLog, FamilyContact, Medication
from app.routers.wellness import WellnessLog
from app.routers.copilot import VisitNote
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
        # 1. Get today's medication logs
        logs = db.query(MedicationLog).filter(
            MedicationLog.patient_id == patient.id,
            MedicationLog.created_at >= datetime.combine(today, datetime.min.time()),
            MedicationLog.created_at <= datetime.combine(today, datetime.max.time())
        ).all()

        # 2. Get today's wellness check-in
        wellness_log = db.query(WellnessLog).filter(
            WellnessLog.patient_id == patient.id,
            WellnessLog.check_in_date >= datetime.combine(today, datetime.min.time()),
            WellnessLog.check_in_date <= datetime.combine(today, datetime.max.time())
        ).first()

        # 3. Get today's coordinator visit note
        visit_note = db.query(VisitNote).filter(
            VisitNote.patient_id == patient.id,
            VisitNote.visit_date >= datetime.combine(today, datetime.min.time()),
            VisitNote.visit_date <= datetime.combine(today, datetime.max.time())
        ).first()

        # Skip patient if there is zero data recorded today
        if not logs and not wellness_log and not visit_note:
            continue

        # Format medication logs
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

        # Format wellness data
        wellness_data = None
        if wellness_log:
            wellness_data = {
                "score": wellness_log.wellness_score,
                "mood": wellness_log.mood,
                "pain": wellness_log.pain,
                "eating": wellness_log.eating,
                "sleep": wellness_log.sleep,
                "concerns": wellness_log.concerns,
            }

        # Format visit note data
        visit_note_data = None
        if visit_note:
            visit_note_data = {
                "summary": visit_note.visit_summary,
                "observations": visit_note.observations,
                "risk_level": visit_note.risk_level,
            }

        # Generate summary via Gemini (integrating med logs + wellness + coordinator observations)
        summary = await generate_family_summary(
            patient_name=patient.name,
            logs=formatted_logs,
            wellness_data=wellness_data,
            visit_note_data=visit_note_data,
            patient_id=patient.id,
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