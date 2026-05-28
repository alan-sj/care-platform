from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import (
    Patient, Medication, MedicationLog, Alert,
    MedicationStatus, AlertType, AlertSeverity, AlertStatus
)
from app.services.notification_service import send_telegram_message, notify_coordinator
from datetime import datetime, timedelta

router = APIRouter(prefix="/reminders", tags=["Reminders"])


@router.post("/send-due")
async def send_due_reminders(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    current_hour = now.hour
    current_minute = now.minute
    results = []

    print(f"Checking reminders at UTC: {now}")

    patients = db.query(Patient).all()

    for patient in patients:
        if not patient.telegram_chat_id:
            continue

        medications = db.query(Medication).filter(
            Medication.patient_id == patient.id,
            Medication.active == True
        ).all()

        for medication in medications:
            if not medication.times:
                continue

            for time_str in medication.times:
                try:
                    hour, minute = map(int, time_str.split(":"))
                except:
                    continue

                print(f"Checking {medication.name} at {hour}:{minute:02d} vs current {current_hour}:{current_minute:02d}")

                # Check if medication is due in next 15 mins
                med_total_minutes = hour * 60 + minute
                now_total_minutes = current_hour * 60 + current_minute
                diff = med_total_minutes - now_total_minutes

                print(f"Diff: {diff} minutes")

                if not (0 <= diff <= 15):
                    continue

                # Check if already sent reminder today
                today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                today_end = now.replace(hour=23, minute=59, second=59, microsecond=0)

                existing_log = db.query(MedicationLog).filter(
                    MedicationLog.patient_id == patient.id,
                    MedicationLog.medication_id == medication.id,
                    MedicationLog.created_at >= today_start,
                    MedicationLog.created_at <= today_end
                ).first()

                if existing_log:
                    print(f"Already logged for {medication.name} today, skipping")
                    continue

                # Send reminder
                message = (
                    f"💊 Hi {patient.name}! This is your reminder to take "
                    f"<b>{medication.name} {medication.dosage or ''}</b>.\n\n"
                    f"Please reply with:\n"
                    f"✅ <b>yes</b> — if you took it\n"
                    f"❌ <b>no</b> — if you haven't yet\n"
                    f"🤒 or tell us how you're feeling"
                )

                await send_telegram_message(patient.telegram_chat_id, message)

                # Log as pending
                med_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                log = MedicationLog(
                    patient_id=patient.id,
                    medication_id=medication.id,
                    scheduled_time=med_time,
                    status=MedicationStatus.pending
                )
                db.add(log)
                db.commit()

                results.append({
                    "patient": patient.name,
                    "medication": medication.name,
                    "scheduled_time": time_str,
                    "status": "reminder_sent"
                })

    return {"status": "done", "results": results}


@router.post("/check-missed")
async def check_missed_reminders(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=30)
    results = []

    # Find pending logs older than 30 minutes
    pending_logs = db.query(MedicationLog).filter(
        MedicationLog.status == MedicationStatus.pending,
        MedicationLog.created_at <= cutoff
    ).all()

    for log in pending_logs:
        log.status = MedicationStatus.missed

        patient = log.patient
        medication = log.medication

        if not patient or not medication:
            continue

        # Create alert
        alert = Alert(
            patient_id=patient.id,
            type=AlertType.no_response,
            severity=AlertSeverity.high,
            message=f"{patient.name} did not respond to {medication.name} reminder",
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

        # Send follow-up to patient
        if patient.telegram_chat_id:
            await send_telegram_message(
                patient.telegram_chat_id,
                f"💊 Hi {patient.name}, we noticed you haven't responded to your "
                f"{medication.name} reminder. Please let us know if you've taken it "
                f"or need any help. 😊"
            )

        results.append({
            "patient": patient.name,
            "medication": medication.name,
            "status": "marked_missed"
        })

    return {"status": "done", "results": results}