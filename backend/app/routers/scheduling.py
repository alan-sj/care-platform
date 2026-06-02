"""
Scheduling Router — daily visit plan generation.

Endpoints:
  POST /scheduling/generate     — generate today's visit schedule
  GET  /scheduling/today        — view today's schedule
  GET  /scheduling/workload     — coordinator workload overview
  PATCH /scheduling/visit/{id}  — update visit status
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Date
from sqlalchemy.dialects.postgresql import UUID

from app.database import get_db, Base
from app.models.models import Patient, User, Alert, AlertStatus, UserRole
from app.services.notification_service import send_telegram_message
from app.agents.scheduling_agent import generate_daily_schedule

from datetime import datetime, date, timedelta
from pydantic import BaseModel
from typing import Optional, List
import uuid

router = APIRouter(prefix="/scheduling", tags=["Scheduling"])


# ── Model ─────────────────────────────────────────────────────────────────────

class VisitSchedule(Base):
    __tablename__ = "visit_schedules"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id      = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"))
    coordinator_id  = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    schedule_date   = Column(Date, default=date.today)
    time_slot       = Column(String, nullable=True)
    priority        = Column(String, default="medium")
    reason          = Column(Text, nullable=True)
    notes           = Column(Text, nullable=True)
    status          = Column(String, default="planned")  # planned/completed/cancelled
    created_at      = Column(DateTime, default=datetime.utcnow)


from app.database import engine


# ── Schemas ───────────────────────────────────────────────────────────────────

class VisitScheduleResponse(BaseModel):
    id:             uuid.UUID
    patient_id:     uuid.UUID
    coordinator_id: Optional[uuid.UUID]
    schedule_date:  date
    time_slot:      Optional[str]
    priority:       str
    reason:         Optional[str]
    notes:          Optional[str]
    status:         str
    created_at:     datetime

    class Config:
        from_attributes = True


class VisitStatusUpdate(BaseModel):
    status: str  # completed / cancelled
    notes:  Optional[str] = None


class VisitCreate(BaseModel):
    patient_id:     uuid.UUID
    coordinator_id: Optional[uuid.UUID] = None
    schedule_date:  Optional[date] = None
    time_slot:      Optional[str] = None
    priority:       Optional[str] = "medium"
    reason:         Optional[str] = None
    notes:          Optional[str] = None


# ── Data helpers ──────────────────────────────────────────────────────────────

def _build_patient_data(patient: Patient, db: Session) -> dict:
    """Collect all health signals for a patient."""

    # Days since last visit
    last_visit = db.query(VisitSchedule).filter(
        VisitSchedule.patient_id == patient.id,
        VisitSchedule.status     == "completed",
    ).order_by(VisitSchedule.created_at.desc()).first()

    days_since = None
    if last_visit:
        days_since = (date.today() - last_visit.schedule_date).days

    # Consecutive missed medications
    from app.models.models import MedicationLog, MedicationStatus
    from sqlalchemy import desc
    week_ago    = datetime.utcnow() - timedelta(days=7)
    recent_logs = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient.id,
        MedicationLog.created_at >= week_ago,
    ).order_by(desc(MedicationLog.created_at)).all()

    consecutive_missed = 0
    for log in recent_logs:
        if log.status == MedicationStatus.missed:
            consecutive_missed += 1
        else:
            break

    # Latest wellness score
    latest_wellness = None
    try:
        from app.routers.wellness import WellnessLog
        wlog = db.query(WellnessLog).filter(
            WellnessLog.patient_id == patient.id,
            WellnessLog.status     == "responded",
        ).order_by(WellnessLog.created_at.desc()).first()
        if wlog:
            latest_wellness = wlog.wellness_score
    except Exception:
        pass

    # Open alerts
    open_alerts = db.query(Alert).filter(
        Alert.patient_id == patient.id,
        Alert.status     == AlertStatus.open,
    ).count()

    # Risk level from most recent alert
    latest_alert = db.query(Alert).filter(
        Alert.patient_id == patient.id,
        Alert.status     != AlertStatus.resolved,
    ).order_by(Alert.created_at.desc()).first()

    risk_level = latest_alert.severity.value if latest_alert else "none"

    return {
        "id":                            str(patient.id),
        "name":                          patient.name,
        "coordinator_id":                str(patient.coordinator_id) if patient.coordinator_id else None,
        "days_since_last_visit":         days_since,
        "visit_frequency":               "weekly",  # default — extend model later
        "consecutive_missed_medications": consecutive_missed,
        "latest_wellness_score":         latest_wellness,
        "latest_risk_level":             risk_level,
        "has_open_alerts":               open_alerts > 0,
    }


def _build_coordinator_data(coordinator: User, db: Session) -> dict:
    """Collect capacity data for a coordinator."""

    total_patients = db.query(Patient).filter(
        Patient.coordinator_id == coordinator.id
    ).count()

    visits_today = db.query(VisitSchedule).filter(
        VisitSchedule.coordinator_id == coordinator.id,
        VisitSchedule.schedule_date  == date.today(),
        VisitSchedule.status         != "cancelled",
    ).count()

    return {
        "id":           str(coordinator.id),
        "name":         coordinator.name,
        "total_patients": total_patients,
        "visits_today": visits_today,
        "is_active":    coordinator.active,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_schedule(db: Session = Depends(get_db)):
    """
    Generate today's optimised visit schedule using the ADK scheduling agent.
    Analyses all patient health signals and coordinator capacity.
    """
    today = date.today()

    # Clear existing planned visits for today (keep completed/cancelled)
    db.query(VisitSchedule).filter(
        VisitSchedule.schedule_date == today,
        VisitSchedule.status        == "planned",
    ).delete()
    db.commit()

    # Gather all patients
    patients = db.query(Patient).all()
    patients_data = [_build_patient_data(p, db) for p in patients]

    # Gather all active coordinators
    coordinators = db.query(User).filter(
        User.role   == UserRole.coordinator,
        User.active == True,
    ).all()
    coordinators_data = [_build_coordinator_data(c, db) for c in coordinators]

    if not patients_data:
        return {"status": "no_patients", "schedule": None}

    if not coordinators_data:
        return {"status": "no_coordinators", "schedule": None}

    # Run ADK scheduling agent
    schedule = await generate_daily_schedule(
        patients_data=patients_data,
        coordinators_data=coordinators_data,
        schedule_date=str(today),
    )

    # Save visits to DB
    db_visits = []
    for visit in schedule.get("visits", []):
        db_visit = VisitSchedule(
            patient_id     = uuid.UUID(visit["patient_id"]),
            coordinator_id = uuid.UUID(visit["coordinator_id"]) if visit.get("coordinator_id") else None,
            schedule_date  = today,
            time_slot      = visit.get("time_slot"),
            priority       = visit.get("priority", "medium"),
            reason         = visit.get("reason"),
            notes          = visit.get("notes"),
            status         = "planned",
        )
        db.add(db_visit)
        db_visits.append((db_visit, visit.get("coordinator_name", "your coordinator")))

    db.commit()

    # Notify patients on Telegram
    patient_map = {p.id: p for p in patients}
    for db_visit, cname in db_visits:
        patient = patient_map.get(db_visit.patient_id)
        if not patient or not patient.telegram_chat_id:
            continue

        time_slot = db_visit.time_slot or "today"
        lang = patient.language.value if patient.language else "en"

        patient_messages = {
            "en": (
                f"🔔 <b>Care Visit Scheduled</b>\n\n"
                f"Hi {patient.name}, your care coordinator <b>{cname}</b> is scheduled to visit you today at <b>{time_slot}</b>.\n\n"
                f"Does this time work for you? Please select below:"
            ),
            "ar": (
                f"🔔 <b>زيارة مجدولة اليوم</b>\n\n"
                f"مرحباً {patient.name}، من المقرر أن يقوم منسق الرعاية الخاص بك <b>{cname}</b> بزيارتك اليوم في تمام الساعة <b>{time_slot}</b>.\n\n"
                f"هل يناسبك هذا الوقت؟ يرجى الاختيار أدناه:"
            ),
            "ml": (
                f"🔔 <b>കെയർ സന്ദർശനം</b>\n\n"
                f"ഹലോ {patient.name}, നിങ്ങളുടെ കെയർ കോർഡിനേറ്റർ <b>{cname}</b> ഇന്ന് <b>{time_slot}</b>-ന് നിങ്ങളെ സന്ദർശിക്കാൻ വരുന്നുണ്ട്.\n\n"
                f"ഈ സമയം നിങ്ങൾക്ക് സൗകര്യപ്രദമാണോ? താഴെ തിരഞ്ഞെടുക്കുക:"
            ),
        }

        # Inline buttons
        yes_btn = {"en": "✅ Yes", "ar": "✅ نعم", "ml": "✅ അതേ"}
        no_btn = {"en": "❌ No", "ar": "❌ لا", "ml": "❌ അല്ല"}

        reply_markup = {
            "inline_keyboard": [
                [
                    {"text": yes_btn.get(lang, yes_btn["en"]), "callback_data": f"visit:yes:{db_visit.id}"},
                    {"text": no_btn.get(lang, no_btn["en"]), "callback_data": f"visit:no:{db_visit.id}"}
                ]
            ]
        }

        msg = patient_messages.get(lang, patient_messages["en"])
        await send_telegram_message(patient.telegram_chat_id, msg, reply_markup=reply_markup)

    # Notify coordinators on Telegram
    coordinator_map = {str(c.id): c for c in coordinators}
    coordinator_visits: dict[str, list] = {}

    for visit in schedule.get("visits", []):
        cid = visit.get("coordinator_id")
        if cid:
            coordinator_visits.setdefault(cid, []).append(visit)

    for cid, visits in coordinator_visits.items():
        coordinator = coordinator_map.get(cid)
        if not coordinator or not coordinator.telegram_chat_id:
            continue

        lines = [f"📋 <b>Your Visit Plan for Today</b>\n"]
        for v in sorted(visits, key=lambda x: x.get("time_slot", "99:99")):
            priority_emoji = {
                "urgent": "🚨", "high": "🔴",
                "medium": "🟡", "low": "🟢"
            }.get(v.get("priority", "medium"), "⚪")

            lines.append(
                f"{priority_emoji} <b>{v['time_slot']}</b> — {v['patient_name']}\n"
                f"   Reason: {v.get('reason', 'Scheduled visit')}\n"
                f"   Notes: {v.get('notes', 'None')}\n"
            )

        if schedule.get("unassigned_patients"):
            lines.append("\n⚠️ <b>Could not assign:</b>")
            for u in schedule["unassigned_patients"]:
                lines.append(f"  - {u['patient_name']}: {u['reason']}")

        await send_telegram_message(
            coordinator.telegram_chat_id,
            "\n".join(lines)
        )

    return {
        "status":   "done",
        "schedule": schedule,
    }


@router.get("/today")
def get_todays_schedule(db: Session = Depends(get_db)):
    """Get visit schedule from today onwards with patient and coordinator names."""
    today   = date.today()
    visits  = db.query(VisitSchedule).filter(
        VisitSchedule.schedule_date >= today
    ).order_by(VisitSchedule.schedule_date, VisitSchedule.time_slot).all()

    result = []
    for v in visits:
        patient     = db.query(Patient).filter(Patient.id == v.patient_id).first()
        coordinator = db.query(User).filter(User.id == v.coordinator_id).first()
        result.append({
            "id":               str(v.id),
            "patient":          patient.name if patient else "Unknown",
            "coordinator":      coordinator.name if coordinator else "Unassigned",
            "time_slot":        v.time_slot,
            "schedule_date":    str(v.schedule_date),
            "priority":         v.priority,
            "reason":           v.reason,
            "notes":            v.notes,
            "status":           v.status,
        })

    return {"date": str(today), "visits": result, "total": len(result)}


@router.get("/workload")
def get_coordinator_workload(db: Session = Depends(get_db)):
    """Overview of each coordinator's patient load and today's visits."""
    coordinators = db.query(User).filter(
        User.role   == UserRole.coordinator,
        User.active == True,
    ).all()

    result = []
    for c in coordinators:
        total_patients  = db.query(Patient).filter(Patient.coordinator_id == c.id).count()
        visits_today    = db.query(VisitSchedule).filter(
            VisitSchedule.coordinator_id == c.id,
            VisitSchedule.schedule_date  == date.today(),
            VisitSchedule.status         != "cancelled",
        ).count()
        result.append({
            "coordinator":      c.name,
            "total_patients":   total_patients,
            "visits_today":     visits_today,
            "capacity_remaining": max(0, 5 - visits_today),
        })

    return {"coordinators": result}


@router.patch("/visit/{visit_id}")
def update_visit_status(
    visit_id: uuid.UUID,
    update: VisitStatusUpdate,
    db: Session = Depends(get_db),
):
    """Mark a visit as completed or cancelled."""
    visit = db.query(VisitSchedule).filter(VisitSchedule.id == visit_id).first()
    if not visit:
        return {"error": "Visit not found"}

    visit.status = update.status
    if update.notes:
        visit.notes = update.notes
    db.commit()

    return {"status": "updated", "visit_id": str(visit_id), "new_status": update.status}


@router.post("/visit", response_model=VisitScheduleResponse)
async def schedule_individual_visit(visit_in: VisitCreate, db: Session = Depends(get_db)):
    """
    Schedule a visit individually for a patient, and notify them on Telegram.
    """
    target_date = visit_in.schedule_date or date.today()
    if target_date < date.today():
        raise HTTPException(status_code=400, detail="Cannot schedule visits in the past.")
    
    db_visit = VisitSchedule(
        patient_id     = visit_in.patient_id,
        coordinator_id = visit_in.coordinator_id,
        schedule_date  = target_date,
        time_slot      = visit_in.time_slot,
        priority       = visit_in.priority or "medium",
        reason         = visit_in.reason,
        notes          = visit_in.notes,
        status         = "planned",
    )
    db.add(db_visit)
    db.commit()
    db.refresh(db_visit)

    # Fetch patient details for notification
    patient = db.query(Patient).filter(Patient.id == db_visit.patient_id).first()
    if patient and patient.telegram_chat_id:
        cname = "your coordinator"
        if db_visit.coordinator_id:
            coord = db.query(User).filter(User.id == db_visit.coordinator_id).first()
            if coord:
                cname = coord.name
        
        time_slot = db_visit.time_slot or "today"
        lang = patient.language.value if patient.language else "en"

        patient_messages = {
            "en": (
                f"🔔 <b>Care Visit Scheduled</b>\n\n"
                f"Hi {patient.name}, your care coordinator <b>{cname}</b> is scheduled to visit you on <b>{target_date}</b> at <b>{time_slot}</b>.\n\n"
                f"Does this time work for you? Please select below:"
            ),
            "ar": (
                f"🔔 <b>زيارة مجدولة</b>\n\n"
                f"مرحباً {patient.name}، من المقرر أن يقوم منسق الرعاية الخاص بك <b>{cname}</b> بزيارتك يوم <b>{target_date}</b> في تمام الساعة <b>{time_slot}</b>.\n\n"
                f"هل يناسبك هذا الوقت؟ يرجى الاختيار أدناه:"
            ),
            "ml": (
                f"🔔 <b>കെയർ സന്ദർശനം</b>\n\n"
                f"ഹലോ {patient.name}, നിങ്ങളുടെ കെയർ കോർഡിനേറ്റർ <b>{cname}</b> {target_date}-ൽ <b>{time_slot}</b>-ന് നിങ്ങളെ സന്ദർശിക്കാൻ വരുന്നുണ്ട്.\n\n"
                f"ഈ സമയം നിങ്ങൾക്ക് സൗകര്യപ്രദമാണോ? താഴെ തിരഞ്ഞെടുക്കുക:"
            ),
        }

        yes_btn = {"en": "✅ Yes", "ar": "✅ نعم", "ml": "✅ അതേ"}
        no_btn = {"en": "❌ No", "ar": "❌ لا", "ml": "❌ അല്ല"}

        reply_markup = {
            "inline_keyboard": [
                [
                    {"text": yes_btn.get(lang, yes_btn["en"]), "callback_data": f"visit:yes:{db_visit.id}"},
                    {"text": no_btn.get(lang, no_btn["en"]), "callback_data": f"visit:no:{db_visit.id}"}
                ]
            ]
        }
        msg = patient_messages.get(lang, patient_messages["en"])
        await send_telegram_message(patient.telegram_chat_id, msg, reply_markup=reply_markup)

    # Notify coordinator
    if db_visit.coordinator_id:
        coordinator = db.query(User).filter(User.id == db_visit.coordinator_id).first()
        if coordinator and coordinator.telegram_chat_id:
            pname = patient.name if patient else "Patient"
            coord_msg = (
                f"📋 <b>New Visit Scheduled Individually</b>\n\n"
                f"Visit for <b>{pname}</b> has been scheduled for <b>{target_date} at {db_visit.time_slot or 'today'}</b>.\n"
                f"Priority: {db_visit.priority}\n"
                f"Reason: {db_visit.reason or 'None'}"
            )
            await send_telegram_message(coordinator.telegram_chat_id, coord_msg)

    return db_visit