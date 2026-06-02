"""
Caregiver Copilot Router — visit note processing.

Endpoints:
  POST /copilot/note/{patient_id}   — submit and process a visit note
  GET  /copilot/notes/{patient_id}  — get all visit notes for a patient
  GET  /copilot/note/{note_id}      — get a single note
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import get_db, Base
from app.models.models import (
    Patient, User, Alert,
    AlertType, AlertSeverity, AlertStatus,
)
from app.services.notification_service import send_telegram_message, notify_coordinator

from datetime import datetime, date, timedelta
from pydantic import BaseModel
from typing import Optional, List, Any
import uuid
import json

router = APIRouter(prefix="/copilot", tags=["Copilot"])


# ── Model ─────────────────────────────────────────────────────────────────────

class VisitNote(Base):
    __tablename__ = "visit_notes"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id         = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"))
    coordinator_id     = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    visit_date         = Column(DateTime, default=datetime.utcnow)
    raw_note           = Column(Text, nullable=False)
    visit_summary      = Column(Text, nullable=True)
    vitals             = Column(Text, nullable=True)   # JSON string
    medications_given  = Column(Text, nullable=True)   # JSON string
    observations       = Column(Text, nullable=True)
    follow_up_note     = Column(Text, nullable=True)
    follow_up_needed   = Column(Boolean, default=False)
    risk_flags         = Column(Text, nullable=True)   # JSON string
    risk_level         = Column(String, default="none")
    note_quality       = Column(String, default="partial")
    created_at         = Column(DateTime, default=datetime.utcnow)


from app.database import engine


# ── Schemas ───────────────────────────────────────────────────────────────────

class VisitNoteCreate(BaseModel):
    raw_note:       str
    coordinator_id: Optional[uuid.UUID] = None

class VisitNoteResponse(BaseModel):
    id:               uuid.UUID
    patient_id:       uuid.UUID
    coordinator_id:   Optional[uuid.UUID]
    visit_date:       datetime
    raw_note:         str
    visit_summary:    Optional[str]
    vitals:           Optional[str]
    medications_given: Optional[str]
    observations:     Optional[str]
    follow_up_note:   Optional[str]
    follow_up_needed: bool
    risk_flags:       Optional[str]
    risk_level:       str
    note_quality:     str
    created_at:       datetime

    class Config:
        from_attributes = True


# ── Context builder ───────────────────────────────────────────────────────────

def _build_patient_context(patient_id, db: Session) -> dict:
    """Build patient history context for the copilot agent."""
    import logging

    # Query patient for timezone, baseline, and clinical conditions
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    conditions = patient.clinical_conditions if patient and patient.clinical_conditions else "Not specified"
    baseline_bp = patient.baseline_bp if patient and patient.baseline_bp else "Unknown"

    # Recent wellness score
    recent_wellness = None
    recent_concerns = None
    try:
        from app.routers.wellness import WellnessLog
        wlog = db.query(WellnessLog).filter(
            WellnessLog.patient_id == patient_id,
            WellnessLog.status     == "responded",
        ).order_by(WellnessLog.created_at.desc()).first()
        if wlog:
            recent_wellness = wlog.wellness_score
            recent_concerns = wlog.concerns
    except Exception as e:
        logging.error(f"Error fetching patient wellness history context: {e}")

    # Recent medication status
    from app.models.models import MedicationLog, MedicationStatus
    today     = date.today()
    today_logs = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.created_at >= datetime.combine(today, datetime.min.time()),
    ).all()

    confirmed = len([l for l in today_logs if l.status == MedicationStatus.confirmed])
    total     = len(today_logs)
    med_status = f"{confirmed}/{total} medications taken today" if total else "No data"

    # Recent open alerts
    open_alerts = db.query(Alert).filter(
        Alert.patient_id == patient_id,
        Alert.status     == AlertStatus.open,
    ).order_by(Alert.created_at.desc()).limit(3).all()

    alert_text = "; ".join([a.message for a in open_alerts]) if open_alerts else "None"

    return {
        "conditions":              conditions,
        "baseline_bp":             baseline_bp,
        "recent_wellness_score":   recent_wellness,
        "recent_medication_status": med_status,
        "recent_concerns":         recent_concerns or alert_text,
    }


# ── Wellness merge helper ─────────────────────────────────────────────────────

async def _merge_wellness_from_visit(
    patient_id: uuid.UUID,
    patient_name: str,
    copilot_result: dict,
    raw_note: str,
    db: Session,
):
    """
    Delegates entirely to the wellness agent's interpret_combined_wellness().
    Passes clean separated arguments — coordinator signals and patient reply
    kept distinct so the agent reasons over each source independently.

    If a WellnessLog already exists today (any status) it is UPDATED in place
    so the frontend always reads a single authoritative record per day.
    """
    from app.routers.wellness import WellnessLog
    from app.agents.wellness_agent import interpret_combined_wellness

    import pytz
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    tz_name = patient.timezone if patient and patient.timezone else "Asia/Kolkata"
    try:
        tz = pytz.timezone(tz_name)
    except Exception:
        tz = pytz.timezone("Asia/Kolkata")
    local_now = datetime.now(tz)
    local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    utc_today_start = local_start.astimezone(pytz.utc).replace(tzinfo=None)

    # ── Fetch today's existing wellness log (any status) ──────────────────────
    existing_log = db.query(WellnessLog).filter(
        WellnessLog.patient_id    == patient_id,
        WellnessLog.check_in_date >= utc_today_start,
    ).order_by(WellnessLog.created_at.desc()).first()

    # ── Extract patient's own reply if they submitted one today ───────────────
    # Guard against feeding back our own "[Visit note]" synthetic text.
    patient_reply: str | None = None
    if existing_log and existing_log.patient_reply:
        if not existing_log.patient_reply.startswith("[Visit note]"):
            patient_reply = existing_log.patient_reply

    # ── Extract coordinator signals from copilot result ───────────────────────
    observations   = copilot_result.get("observations", "") or ""
    visit_summary  = copilot_result.get("visit_summary", "") or ""
    risk_flags     = copilot_result.get("risk_flags", []) or []
    vitals         = copilot_result.get("vitals", {}) or {}
    follow_up_note = copilot_result.get("follow_up_note", "") or ""

    vitals_text = ", ".join(
        f"{k}: {v}" for k, v in vitals.items() if v and v != "null"
    )

    # ── Delegate all reasoning to the wellness agent ──────────────────────────
    wellness_result = await interpret_combined_wellness(
        patient_name=patient_name,
        patient_reply=patient_reply,
        coordinator_observations=observations,
        coordinator_vitals=vitals_text,
        coordinator_risk_flags=risk_flags,
        coordinator_visit_summary=visit_summary,
        coordinator_follow_up=follow_up_note,
        patient_id=patient_id,
    )

    # ── Upsert: update existing log or create new one ─────────────────────────
    if existing_log:
        # Preserve the patient's original reply text — only update the
        # scored fields so we don't lose their voice.
        if not existing_log.patient_reply or existing_log.patient_reply.startswith("[Visit note]"):
            existing_log.patient_reply = f"[Visit note] {raw_note[:300]}"

        existing_log.status           = "responded"
        existing_log.mood             = wellness_result.get("mood")
        existing_log.pain             = wellness_result.get("pain")
        existing_log.eating           = wellness_result.get("eating")
        existing_log.sleep            = wellness_result.get("sleep")
        existing_log.wellness_score   = wellness_result.get("wellness_score")
        existing_log.concerns         = wellness_result.get("concerns")
        existing_log.needs_escalation = wellness_result.get("needs_escalation", False)
    else:
        new_log = WellnessLog(
            patient_id       = patient_id,
            check_in_date    = datetime.utcnow(),
            status           = "responded",
            patient_reply    = f"[Visit note] {raw_note[:300]}",
            mood             = wellness_result.get("mood"),
            pain             = wellness_result.get("pain"),
            eating           = wellness_result.get("eating"),
            sleep            = wellness_result.get("sleep"),
            wellness_score   = wellness_result.get("wellness_score"),
            concerns         = wellness_result.get("concerns"),
            needs_escalation = wellness_result.get("needs_escalation", False),
        )
        db.add(new_log)

    return wellness_result


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/note/{patient_id}")
async def submit_visit_note(
    patient_id: uuid.UUID,
    payload: VisitNoteCreate,
    db: Session = Depends(get_db),
):
    """
    Submit a visit note for a patient.
    The copilot agent processes it into structured clinical data.
    The wellness agent then re-scores today's wellness using BOTH the
    coordinator's observations AND any patient Telegram reply from today.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Get coordinator
    coordinator = None
    if payload.coordinator_id:
        coordinator = db.query(User).filter(User.id == payload.coordinator_id).first()
    elif patient.coordinator_id:
        coordinator = db.query(User).filter(User.id == patient.coordinator_id).first()

    coordinator_name = coordinator.name if coordinator else "Care Coordinator"

    # Build patient context for agent
    context = _build_patient_context(patient_id, db)

    # ── Run copilot agent ─────────────────────────────────────────────────────
    from app.agents.copilot_agent import process_visit_note
    result = await process_visit_note(
        coordinator_name=coordinator_name,
        patient_name=patient.name,
        raw_note=payload.raw_note,
        patient_context=context,
        patient_id=patient_id,
    )

    # ── Save visit note to DB ─────────────────────────────────────────────────
    note = VisitNote(
        patient_id        = patient_id,
        coordinator_id    = coordinator.id if coordinator else None,
        visit_date        = datetime.utcnow(),
        raw_note          = payload.raw_note,
        visit_summary     = result.get("visit_summary"),
        vitals            = json.dumps(result.get("vitals", {})),
        medications_given = json.dumps(result.get("medications_given", [])),
        observations      = result.get("observations"),
        follow_up_note    = result.get("follow_up_note"),
        follow_up_needed  = result.get("follow_up_needed", False),
        risk_flags        = json.dumps(result.get("risk_flags", [])),
        risk_level        = result.get("risk_level", "none"),
        note_quality      = result.get("coordinator_note_quality", "partial"),
    )
    db.add(note)

    # ── Merge wellness: coordinator observations + patient check-in ───────────
    wellness_result = await _merge_wellness_from_visit(
        patient_id=patient_id,
        patient_name=patient.name,
        copilot_result=result,
        raw_note=payload.raw_note,
        db=db,
    )

    # ── Create alert if copilot flagged risks ─────────────────────────────────
    risk_flags = result.get("risk_flags", [])
    risk_level = result.get("risk_level", "none")

    if risk_flags and risk_level != "none":
        severity_map = {
            "low":    AlertSeverity.low,
            "medium": AlertSeverity.medium,
            "high":   AlertSeverity.high,
        }
        alert = Alert(
            patient_id = patient_id,
            type       = AlertType.flagged,
            severity   = severity_map.get(risk_level, AlertSeverity.medium),
            message    = f"Visit note risks for {patient.name}: {', '.join(risk_flags)}",
            status     = AlertStatus.open,
        )
        db.add(alert)

        if risk_level == "high" and coordinator and coordinator.telegram_chat_id:
            await notify_coordinator(
                coordinator_chat_id=coordinator.telegram_chat_id,
                patient_name=patient.name,
                alert_type="flagged",
                severity=risk_level,
                message=f"Visit note flagged: {', '.join(risk_flags)}",
            )

    # ── Create alert if wellness agent independently flagged escalation ───────
    # (covers cases where copilot missed something the wellness agent caught)
    if wellness_result.get("needs_escalation") and not risk_flags:
        alert = Alert(
            patient_id = patient_id,
            type       = AlertType.flagged,
            severity   = AlertSeverity.high,
            message    = (
                f"Wellness concern from visit note for {patient.name}: "
                f"{wellness_result.get('concerns', 'See visit note')}"
            ),
            status     = AlertStatus.open,
        )
        db.add(alert)

    # ── Mark visit schedule as completed if one exists ────────────────────────
    try:
        from app.routers.scheduling import VisitSchedule
        today_visit = db.query(VisitSchedule).filter(
            VisitSchedule.patient_id     == patient_id,
            VisitSchedule.schedule_date  == date.today(),
            VisitSchedule.status         == "planned",
        ).first()
        if today_visit:
            today_visit.status = "completed"
            today_visit.notes  = result.get("visit_summary")
    except Exception as e:
        import logging
        logging.error(f"Error updating today's visit schedule state to completed: {e}")

    # ── Send confirmation to coordinator ──────────────────────────────────────
    if coordinator and coordinator.telegram_chat_id:
        quality_emoji = {
            "complete": "✅",
            "partial":  "⚠️",
            "minimal":  "❌",
        }.get(result.get("coordinator_note_quality", "partial"), "✅")

        wellness_score = wellness_result.get("wellness_score")
        wellness_line = (
            f"🌡️ <b>Wellness score updated:</b> {wellness_score}/10\n"
            if wellness_score is not None else ""
        )

        summary_msg = (
            f"📋 <b>Visit Note Saved — {patient.name}</b>\n\n"
            f"{quality_emoji} Note quality: {result.get('coordinator_note_quality', 'partial').upper()}\n\n"
            f"<b>Summary:</b> {result.get('visit_summary', 'No summary')}\n\n"
            f"{wellness_line}"
        )

        if risk_flags:
            summary_msg += f"⚠️ <b>Flags:</b> {', '.join(risk_flags)}\n"

        if result.get("follow_up_needed"):
            summary_msg += f"📌 <b>Follow-up:</b> {result.get('follow_up_note', 'Needed')}\n"

        if result.get("coordinator_note_quality") == "minimal":
            summary_msg += "\n💡 <i>Tip: Add vitals and observations for a more complete record.</i>"

        await send_telegram_message(coordinator.telegram_chat_id, summary_msg)

    db.commit()

    return {
        "status":     "processed",
        "note_id":    str(note.id),
        "structured": result,
        "wellness":   wellness_result,
    }


@router.get("/notes/{patient_id}", response_model=List[VisitNoteResponse])
def get_patient_notes(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Get all visit notes for a patient (last 90 days)."""
    ninety_days_ago = datetime.utcnow() - timedelta(days=90)
    return (
        db.query(VisitNote)
        .filter(
            VisitNote.patient_id == patient_id,
            VisitNote.created_at >= ninety_days_ago,
        )
        .order_by(VisitNote.created_at.desc())
        .all()
    )


@router.get("/note/{note_id}")
def get_single_note(
    note_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Get a single visit note with parsed JSON fields."""
    note = db.query(VisitNote).filter(VisitNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    patient     = db.query(Patient).filter(Patient.id == note.patient_id).first()
    coordinator = db.query(User).filter(User.id == note.coordinator_id).first()

    return {
        "id":               str(note.id),
        "patient":          patient.name if patient else "Unknown",
        "coordinator":      coordinator.name if coordinator else "Unknown",
        "visit_date":       note.visit_date,
        "raw_note":         note.raw_note,
        "visit_summary":    note.visit_summary,
        "vitals":           json.loads(note.vitals) if note.vitals else {},
        "medications_given": json.loads(note.medications_given) if note.medications_given else [],
        "observations":     note.observations,
        "follow_up_note":   note.follow_up_note,
        "follow_up_needed": note.follow_up_needed,
        "risk_flags":       json.loads(note.risk_flags) if note.risk_flags else [],
        "risk_level":       note.risk_level,
        "note_quality":     note.note_quality,
    }


@router.get("/followups")
def get_pending_followups(db: Session = Depends(get_db)):
    """Get all visit notes that need follow-up."""
    notes = db.query(VisitNote).filter(
        VisitNote.follow_up_needed == True,
        VisitNote.created_at >= datetime.utcnow() - timedelta(days=7),
    ).order_by(VisitNote.created_at.desc()).all()

    result = []
    for note in notes:
        patient = db.query(Patient).filter(Patient.id == note.patient_id).first()
        result.append({
            "note_id":       str(note.id),
            "patient":       patient.name if patient else "Unknown",
            "visit_date":    note.visit_date,
            "follow_up_note": note.follow_up_note,
            "risk_level":    note.risk_level,
        })

    return {"pending_followups": result, "total": len(result)}