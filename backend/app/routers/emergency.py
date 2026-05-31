"""
Emergency Detection Router.

Endpoints:
  POST /emergency/scan          — scan all patients for risk signals
  POST /emergency/trigger/{id}  — manually trigger assessment for one patient
  GET  /emergency/status/{id}   — get current risk status for a patient
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, date, timedelta
from pydantic import BaseModel
from typing import Optional, List
import uuid

from app.database import get_db
from app.models.models import (
    Patient, MedicationLog, Alert, FamilyContact,
    MedicationStatus, AlertType, AlertSeverity, AlertStatus,
)
from app.services.notification_service import send_telegram_message, notify_coordinator
from app.agents.emergency_agent import assess_patient_risk

router = APIRouter(prefix="/emergency", tags=["Emergency"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_medication_data(patient_id, db: Session) -> dict:
    """Pull medication signal data for a patient."""
    today = date.today()

    # Today's logs
    today_logs = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.created_at >= datetime.combine(today, datetime.min.time()),
    ).all()

    total_today    = len(today_logs)
    missed_today   = len([l for l in today_logs if l.status == MedicationStatus.missed])
    last_reply     = next((l.patient_reply for l in reversed(today_logs) if l.patient_reply), None)

    # Consecutive missed — look at last 7 days
    week_ago = datetime.utcnow() - timedelta(days=7)
    recent_logs = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.created_at >= week_ago,
    ).order_by(desc(MedicationLog.created_at)).all()

    consecutive = 0
    for log in recent_logs:
        if log.status == MedicationStatus.missed:
            consecutive += 1
        else:
            break

    return {
        "consecutive_missed": consecutive,
        "last_reply": last_reply,
        "total_missed_today": missed_today,
        "total_scheduled_today": total_today,
    }


def _get_wellness_data(patient_id, db: Session) -> dict:
    """Pull wellness signal data for a patient."""
    try:
        from app.routers.wellness import WellnessLog

        recent = db.query(WellnessLog).filter(
            WellnessLog.patient_id == patient_id,
        ).order_by(desc(WellnessLog.created_at)).limit(5).all()

        if not recent:
            return {
                "consecutive_missed_checkins": 0,
                "latest_wellness_score": None,
                "previous_wellness_score": None,
                "latest_concerns": None,
                "latest_reply": None,
            }

        # Consecutive missed check-ins
        consecutive = 0
        for log in recent:
            if log.status == "missed":
                consecutive += 1
            else:
                break

        responded = [l for l in recent if l.status == "responded"]
        latest    = responded[0] if responded else None
        previous  = responded[1] if len(responded) > 1 else None

        return {
            "consecutive_missed_checkins": consecutive,
            "latest_wellness_score": latest.wellness_score if latest else None,
            "previous_wellness_score": previous.wellness_score if previous else None,
            "latest_concerns": latest.concerns if latest else None,
            "latest_reply": latest.patient_reply if latest else None,
        }
    except Exception:
        return {
            "consecutive_missed_checkins": 0,
            "latest_wellness_score": None,
            "previous_wellness_score": None,
            "latest_concerns": None,
            "latest_reply": None,
        }


def _get_recent_messages(patient_id, db: Session) -> list[str]:
    """Get recent patient messages for keyword scanning."""
    messages = []

    # Medication replies
    week_ago = datetime.utcnow() - timedelta(days=2)
    med_logs = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.created_at >= week_ago,
        MedicationLog.patient_reply.isnot(None),
    ).all()
    messages.extend([l.patient_reply for l in med_logs if l.patient_reply])

    # Wellness replies
    try:
        from app.routers.wellness import WellnessLog
        well_logs = db.query(WellnessLog).filter(
            WellnessLog.patient_id == patient_id,
            WellnessLog.created_at >= week_ago,
            WellnessLog.patient_reply.isnot(None),
        ).all()
        messages.extend([l.patient_reply for l in well_logs if l.patient_reply])
    except Exception:
        pass

    return messages


async def _run_assessment(patient: Patient, db: Session) -> dict:
    """Run full emergency assessment for one patient."""
    med_data      = _get_medication_data(patient.id, db)
    wellness_data = _get_wellness_data(patient.id, db)
    messages      = _get_recent_messages(patient.id, db)

    # Skip assessment if everything looks fine (save API calls)
    if (
        med_data["consecutive_missed"] == 0
        and wellness_data["consecutive_missed_checkins"] == 0
        and not messages
    ):
        return {
            "risk_level": "none",
            "risk_score": 1,
            "triggers": [],
            "needs_immediate_escalation": False,
            "needs_family_notification": False,
            "coordinator_message": "",
            "family_message": "",
            "patient_message": "",
            "recommended_action": "No action needed.",
        }

    result = await assess_patient_risk(
        patient_name=patient.name,
        medication_data=med_data,
        wellness_data=wellness_data,
        recent_messages=messages,
    )
    return result


async def _handle_escalation(patient: Patient, result: dict, db: Session):
    """Handle notifications and alert creation based on assessment."""

    risk_level = result.get("risk_level", "none")

    if risk_level == "none":
        return

    # Map risk level to alert severity
    severity_map = {
        "low":      AlertSeverity.low,
        "medium":   AlertSeverity.medium,
        "high":     AlertSeverity.high,
        "critical": AlertSeverity.critical,
    }

    triggers_text = ", ".join(result.get("triggers", ["Risk detected"]))

    # Create alert
    alert = Alert(
        patient_id=patient.id,
        type=AlertType.flagged,
        severity=severity_map.get(risk_level, AlertSeverity.medium),
        message=f"Emergency scan: {triggers_text}",
        status=AlertStatus.open,
    )
    db.add(alert)

    # Notify coordinator
    if result.get("needs_immediate_escalation"):
        coordinator = patient.coordinator
        if coordinator and coordinator.active and coordinator.telegram_chat_id:
            await notify_coordinator(
                coordinator_chat_id=coordinator.telegram_chat_id,
                patient_name=patient.name,
                alert_type="flagged",
                severity=risk_level,
                message=result.get("coordinator_message", triggers_text),
            )

    # Notify family
    if result.get("needs_family_notification"):
        family_contacts = db.query(FamilyContact).filter(
            FamilyContact.patient_id == patient.id,
            FamilyContact.telegram_chat_id.isnot(None),
        ).all()

        for contact in family_contacts:
            await send_telegram_message(
                contact.telegram_chat_id,
                f"💙 Update about <b>{patient.name}</b>\n\n"
                f"{result.get('family_message', 'We are monitoring your family member and will update you.')}",
            )

    # Send follow-up to patient
    patient_msg = result.get("patient_message", "")
    if patient_msg and patient.telegram_chat_id and risk_level in ["medium", "high", "critical"]:
        await send_telegram_message(patient.telegram_chat_id, patient_msg)

    db.commit()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/scan")
async def scan_all_patients(db: Session = Depends(get_db)):
    """
    Scan all patients for emergency risk signals.
    Run this every 30-60 minutes via cron or scheduler.
    """
    patients = db.query(Patient).filter(
        Patient.telegram_chat_id.isnot(None)
    ).all()

    results = []

    for patient in patients:
        result = await _run_assessment(patient, db)
        await _handle_escalation(patient, result, db)

        results.append({
            "patient":     patient.name,
            "risk_level":  result.get("risk_level"),
            "risk_score":  result.get("risk_score"),
            "triggers":    result.get("triggers", []),
            "escalated":   result.get("needs_immediate_escalation", False),
        })

    return {"status": "done", "results": results}


@router.post("/trigger/{patient_id}")
async def trigger_assessment(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Manually trigger emergency assessment for a specific patient."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        return {"error": "Patient not found"}

    result = await _run_assessment(patient, db)
    await _handle_escalation(patient, result, db)

    return {
        "patient":    patient.name,
        "assessment": result,
    }


@router.get("/status/{patient_id}")
def get_patient_risk_status(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Get current risk status for a patient based on recent alerts."""
    recent_alerts = db.query(Alert).filter(
        Alert.patient_id == patient_id,
        Alert.status     != AlertStatus.resolved,
        Alert.created_at >= datetime.utcnow() - timedelta(hours=24),
    ).order_by(desc(Alert.created_at)).all()

    if not recent_alerts:
        return {
            "risk_level":    "none",
            "open_alerts":   0,
            "last_assessed": None,
        }

    # Highest severity among open alerts
    severity_rank = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    highest = max(recent_alerts, key=lambda a: severity_rank.get(a.severity.value, 0))

    return {
        "risk_level":    highest.severity.value,
        "open_alerts":   len(recent_alerts),
        "last_assessed": recent_alerts[0].created_at,
        "latest_message": recent_alerts[0].message,
    }