"""
Wellness router — daily patient check-ins via Telegram.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.database import get_db, Base
from app.models.models import Patient, Alert, AlertType, AlertSeverity, AlertStatus
from app.services.notification_service import send_telegram_message, notify_coordinator
from app.agents.wellness_agent import interpret_wellness_reply, build_checkin_message

from datetime import datetime, date, timedelta
from pydantic import BaseModel
from typing import Optional, List
import uuid

router = APIRouter(prefix="/wellness", tags=["Wellness"])


# ── Model ─────────────────────────────────────────────────────────────────────

class WellnessLog(Base):
    __tablename__ = "wellness_logs"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id       = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"))
    check_in_date    = Column(DateTime, default=datetime.utcnow)
    status           = Column(String, default="pending")
    patient_reply    = Column(Text, nullable=True)
    mood             = Column(String, nullable=True)
    pain             = Column(String, nullable=True)
    eating           = Column(String, nullable=True)
    sleep            = Column(String, nullable=True)
    wellness_score   = Column(Integer, nullable=True)
    concerns         = Column(Text, nullable=True)
    needs_escalation = Column(Boolean, default=False)
    created_at       = Column(DateTime, default=datetime.utcnow)


# ── Schema ────────────────────────────────────────────────────────────────────

class WellnessLogResponse(BaseModel):
    id:               uuid.UUID
    patient_id:       uuid.UUID
    check_in_date:    datetime
    status:           str
    patient_reply:    Optional[str]
    mood:             Optional[str]
    pain:             Optional[str]
    eating:           Optional[str]
    sleep:            Optional[str]
    wellness_score:   Optional[int]
    concerns:         Optional[str]
    needs_escalation: bool
    created_at:       datetime

    class Config:
        from_attributes = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/send-checkins")
async def send_daily_checkins(db: Session = Depends(get_db)):
    import pytz
    results = []

    patients = db.query(Patient).filter(Patient.telegram_chat_id.isnot(None)).all()

    for patient in patients:
        tz_name = patient.timezone if patient.timezone else "Asia/Kolkata"
        try:
            tz = pytz.timezone(tz_name)
        except Exception:
            tz = pytz.timezone("Asia/Kolkata")
        local_now = datetime.now(tz)
        local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        utc_today_start = local_start.astimezone(pytz.utc).replace(tzinfo=None)

        existing = db.query(WellnessLog).filter(
            WellnessLog.patient_id == patient.id,
            WellnessLog.check_in_date >= utc_today_start,
        ).first()
        if existing:
            continue

        lang    = patient.language.value if patient.language else "en"
        message = build_checkin_message(patient.name, lang)
        await send_telegram_message(patient.telegram_chat_id, message)

        log = WellnessLog(
            patient_id=patient.id,
            check_in_date=datetime.utcnow(),
            status="pending",
        )
        db.add(log)
        results.append({"patient": patient.name, "status": "checkin_sent"})

    db.commit()
    return {"status": "done", "results": results}


@router.post("/respond/{patient_telegram_id}")
async def handle_wellness_response(
    patient_telegram_id: int,
    message: str,
    db: Session = Depends(get_db),
):
    patient = db.query(Patient).filter(
        Patient.telegram_chat_id == patient_telegram_id
    ).first()

    if not patient:
        return {"status": "patient_not_found"}

    import pytz
    tz_name = patient.timezone if patient.timezone else "Asia/Kolkata"
    try:
        tz = pytz.timezone(tz_name)
    except Exception:
        tz = pytz.timezone("Asia/Kolkata")
    local_now = datetime.now(tz)
    local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    utc_today_start = local_start.astimezone(pytz.utc).replace(tzinfo=None)

    log   = db.query(WellnessLog).filter(
        WellnessLog.patient_id == patient.id,
        WellnessLog.status     == "pending",
        WellnessLog.check_in_date >= utc_today_start,
    ).first()

    if not log:
        return {"status": "no_pending_checkin"}

    result = await interpret_wellness_reply(
        patient_name=patient.name,
        message=message,
        patient_id=patient.id,
    )

    log.status           = "responded"
    log.patient_reply    = message
    log.mood             = result.get("mood")
    log.pain             = result.get("pain")
    log.eating           = result.get("eating")
    log.sleep            = result.get("sleep")
    log.wellness_score   = result.get("wellness_score")
    log.concerns         = result.get("concerns")
    log.needs_escalation = result.get("needs_escalation", False)

    if result.get("needs_escalation"):
        alert = Alert(
            patient_id=patient.id,
            type=AlertType.flagged,
            severity=AlertSeverity.high,
            message=f"Wellness concern for {patient.name}: {result.get('concerns', 'Patient reported health concerns')}",
            status=AlertStatus.open,
        )
        db.add(alert)
        coordinator = patient.coordinator
        if coordinator and coordinator.active and coordinator.telegram_chat_id:
            await notify_coordinator(
                coordinator_chat_id=coordinator.telegram_chat_id,
                patient_name=patient.name,
                alert_type="flagged",
                severity="high",
                message=alert.message,
            )

    db.commit()
    await send_telegram_message(patient.telegram_chat_id, result["reply"])
    return {"status": "processed", "wellness_score": result.get("wellness_score")}


@router.post("/check-missed")
async def check_missed_checkins(db: Session = Depends(get_db)):
    cutoff  = datetime.utcnow() - timedelta(hours=4)
    results = []

    pending_logs = db.query(WellnessLog).filter(
        WellnessLog.status == "pending",
        WellnessLog.check_in_date <= cutoff,
    ).all()

    for log in pending_logs:
        log.status = "missed"
        patient    = db.query(Patient).filter(Patient.id == log.patient_id).first()
        if not patient:
            continue

        if patient.telegram_chat_id:
            await send_telegram_message(
                patient.telegram_chat_id,
                f"💙 Hi {patient.name}, we noticed you haven't checked in today. "
                "How are you doing? Just reply when you get a chance 😊"
            )

        alert = Alert(
            patient_id=patient.id,
            type=AlertType.no_response,
            severity=AlertSeverity.medium,
            message=f"{patient.name} did not respond to their daily wellness check-in.",
            status=AlertStatus.open,
        )
        db.add(alert)

        coordinator = patient.coordinator
        if coordinator and coordinator.active and coordinator.telegram_chat_id:
            await notify_coordinator(
                coordinator_chat_id=coordinator.telegram_chat_id,
                patient_name=patient.name,
                alert_type="no_response",
                severity="medium",
                message=alert.message,
            )

        results.append({"patient": patient.name, "status": "marked_missed"})

    db.commit()
    return {"status": "done", "results": results}


@router.get("/logs/{patient_id}", response_model=List[WellnessLogResponse])
def get_wellness_logs(patient_id: uuid.UUID, db: Session = Depends(get_db)):
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    return (
        db.query(WellnessLog)
        .filter(
            WellnessLog.patient_id == patient_id,
            WellnessLog.created_at >= thirty_days_ago,
        )
        .order_by(WellnessLog.created_at.desc())
        .all()
    )


@router.get("/score/{patient_id}")
def get_latest_wellness_score(patient_id: uuid.UUID, db: Session = Depends(get_db)):
    log = (
        db.query(WellnessLog)
        .filter(
            WellnessLog.patient_id == patient_id,
            WellnessLog.status     == "responded",
        )
        .order_by(WellnessLog.created_at.desc())
        .first()
    )

    if not log:
        return {"score": None, "message": "No wellness data yet"}

    return {
        "score":      log.wellness_score,
        "mood":       log.mood,
        "pain":       log.pain,
        "eating":     log.eating,
        "sleep":      log.sleep,
        "concerns":   log.concerns,
        "checked_at": log.check_in_date,
    }