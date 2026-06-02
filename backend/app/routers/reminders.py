from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.models import (
    Patient, Medication, MedicationLog, Alert, User,
    MedicationStatus, AlertType, AlertSeverity, AlertStatus
)
from app.services.notification_service import send_telegram_message, notify_coordinator
from datetime import datetime, timedelta
import pytz
import uuid

router = APIRouter(prefix="/reminders", tags=["Reminders"])


@router.post("/send-due")
async def send_due_reminders(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    results = []

    print(f"Checking reminders at UTC: {now}")

    # Fetch patients who have active medications, eager-loading the medications list to resolve N+1 queries
    patients = db.query(Patient).options(
        joinedload(Patient.medications)
    ).filter(
        Patient.telegram_chat_id.isnot(None),
        Patient.medications.any(Medication.active == True)
    ).all()

    for patient in patients:
        # Determine patient's local timezone (defaults to Asia/Kolkata if not set)
        tz_name = patient.timezone or "Asia/Kolkata"
        try:
            patient_tz = pytz.timezone(tz_name)
        except Exception:
            patient_tz = pytz.timezone("Asia/Kolkata")

        # Convert current UTC time to patient local time
        local_now = pytz.utc.localize(now).astimezone(patient_tz)
        current_hour = local_now.hour
        current_minute = local_now.minute

        due_medications = []

        for medication in patient.medications:
            if not medication.active or not medication.times:
                continue

            for time_str in medication.times:
                try:
                    hour, minute = map(int, time_str.split(":"))
                except Exception:
                    continue

                # Compute time difference in minutes
                med_total = hour * 60 + minute
                now_total = current_hour * 60 + current_minute
                diff = med_total - now_total

                # If scheduled within the next 15 minutes
                if not (0 <= diff <= 15):
                    continue

                # Calculate scheduled time as a naive UTC datetime
                try:
                    local_scheduled = patient_tz.localize(
                        datetime.combine(local_now.date(), datetime.min.time())
                    ).replace(hour=hour, minute=minute)
                    utc_scheduled = local_scheduled.astimezone(pytz.utc).replace(tzinfo=None)
                except Exception:
                    continue

                # Check if log already exists
                existing_log = db.query(MedicationLog).filter(
                    MedicationLog.patient_id == patient.id,
                    MedicationLog.medication_id == medication.id,
                    MedicationLog.scheduled_time == utc_scheduled
                ).first()

                if existing_log:
                    continue

                due_medications.append((medication, time_str, utc_scheduled))

        if not due_medications:
            continue

        # Create log entries in DB first to generate IDs (using flush)
        created_logs = []
        for med, time_str, utc_scheduled in due_medications:
            log = MedicationLog(
                patient_id=patient.id,
                medication_id=med.id,
                scheduled_time=utc_scheduled,
                status=MedicationStatus.pending
            )
            db.add(log)
            created_logs.append(log)

        db.flush()  # Populate generated UUIDs for the callback buttons

        # Build batched reminder message and interactive inline keyboard buttons
        inline_keyboard = []
        if len(created_logs) == 1:
            log = created_logs[0]
            med_name = log.medication.name if log.medication else "medication"
            med_dosage = log.medication.dosage if log.medication else ""
            message = (
                f"💊 Hi {patient.name}! Time to take your medication:\n\n"
                f"<b>{med_name} {med_dosage}</b>\n\n"
                f"Please confirm if you've taken it using the buttons below, or reply with how you're feeling."
            )
            inline_keyboard.append([
                {"text": "✅ Took It", "callback_data": f"med:confirmed:{log.id}"},
                {"text": "❌ Missed", "callback_data": f"med:missed:{log.id}"}
            ])
        else:
            med_lines = "\n".join(
                f"{i+1}. <b>{log.medication.name} {log.medication.dosage or ''}</b>"
                for i, log in enumerate(created_logs)
            )
            message = (
                f"💊 Hi {patient.name}! Time for your medications:\n\n"
                f"{med_lines}\n\n"
                f"Please confirm using the buttons below, or reply with how you're feeling."
            )
            # Individual confirmation rows
            for log in created_logs:
                med_name = log.medication.name if log.medication else "med"
                inline_keyboard.append([
                    {"text": f"✅ Took {med_name}", "callback_data": f"med:confirmed:{log.id}"},
                    {"text": f"❌ Missed", "callback_data": f"med:missed:{log.id}"}
                ])
            # Batch options row
            log_ids_str = ",".join(str(log.id) for log in created_logs)
            inline_keyboard.append([
                {"text": "✅ Took All", "callback_data": f"med_batch:confirmed:{log_ids_str}"},
                {"text": "❌ Missed All", "callback_data": f"med_batch:missed:{log_ids_str}"}
            ])

        reply_markup = {"inline_keyboard": inline_keyboard}
        await send_telegram_message(patient.telegram_chat_id, message, reply_markup=reply_markup)

        for log in created_logs:
            results.append({
                "patient": patient.name,
                "medication": log.medication.name if log.medication else "Unknown",
                "scheduled_time": str(log.scheduled_time),
                "status": "reminder_sent"
            })

    db.commit()
    return {"status": "done", "results": results}


@router.post("/check-missed")
async def check_missed_reminders(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=30)
    results = []

    pending_logs = db.query(MedicationLog).filter(
        MedicationLog.status == MedicationStatus.pending,
        MedicationLog.scheduled_time <= cutoff
    ).all()

    for log in pending_logs:
        log.status = MedicationStatus.missed

        patient = log.patient
        medication = log.medication

        if not patient or not medication:
            continue

        alert = Alert(
            patient_id=patient.id,
            type=AlertType.no_response,
            severity=AlertSeverity.high,
            message=f"{patient.name} did not respond to {medication.name} reminder",
            status=AlertStatus.open
        )
        db.add(alert)

        coordinator = patient.coordinator
        if coordinator and coordinator.active and coordinator.telegram_chat_id:
            await notify_coordinator(
                coordinator_chat_id=coordinator.telegram_chat_id,
                patient_name=patient.name,
                alert_type=alert.type.value,
                severity=alert.severity.value,
                message=alert.message
            )

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

    db.commit()
    return {"status": "done", "results": results}