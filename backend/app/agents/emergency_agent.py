"""
Emergency Detection Agent — ADK-native implementation.
Monitors patient data signals and triggers escalation when risk patterns
are detected. Uses native ADK output schemas.
"""

from __future__ import annotations

import json
import uuid
from typing import Any
from pydantic import BaseModel, Field

from google.adk import Agent
from google.adk.runners import Runner
from app.services.session_service import session_service

APP_NAME = "emergency_agent_app"


# ── Tools ─────────────────────────────────────────────────────────────────────

def analyse_medication_pattern(
    consecutive_missed: int = 0,
    last_reply: str | None = None,
    total_missed_today: int = 0,
    total_scheduled_today: int = 0,
) -> dict[str, Any]:
    """
    Analyse a patient's medication adherence pattern for emergency signals.
    """
    consecutive_missed = consecutive_missed or 0
    total_missed_today = total_missed_today or 0
    total_scheduled_today = total_scheduled_today or 0
    return {
        "consecutive_missed": consecutive_missed,
        "last_reply": last_reply or "No reply",
        "total_missed_today": total_missed_today,
        "total_scheduled_today": total_scheduled_today,
        "missed_ratio": round(total_missed_today / max(total_scheduled_today, 1), 2),
    }


def analyse_wellness_pattern(
    consecutive_missed_checkins: int = 0,
    latest_wellness_score: int | None = None,
    previous_wellness_score: int | None = None,
    latest_concerns: str | None = None,
    latest_reply: str | None = None,
) -> dict[str, Any]:
    """
    Analyse a patient's wellness check-in pattern for emergency signals.
    """
    consecutive_missed_checkins = consecutive_missed_checkins or 0
    score_drop = None
    if latest_wellness_score is not None and previous_wellness_score is not None:
        score_drop = previous_wellness_score - latest_wellness_score

    return {
        "consecutive_missed_checkins": consecutive_missed_checkins,
        "latest_wellness_score": latest_wellness_score,
        "previous_wellness_score": previous_wellness_score,
        "score_drop": score_drop,
        "latest_concerns": latest_concerns or "None reported",
        "latest_reply": latest_reply or "No reply",
    }


def check_severe_keywords(text: str) -> dict[str, Any]:
    """
    Scan text for severe medical emergency keywords.
    Supports English, Arabic, and Malayalam.
    """
    severe_keywords = [
        # English
        "chest pain", "can't breathe", "cannot breathe", "difficulty breathing",
        "fell down", "i fell", "fallen", "unconscious", "fainted",
        "severe pain", "unbearable pain", "heart", "stroke",
        "bleeding", "vomiting blood", "can't move", "cannot move",
        "help me", "emergency", "ambulance", "hospital",
        "very bad", "extremely bad", "worst", "dying",
        # Arabic
        "ألم في الصدر", "وجع صدر", "ضيق تنفس", "صعوبة في التنفس", "لا أستطيع التنفس",
        "سقطت", "وقعت", "وقوع", "سقوط", "مغمى عليه", "فقدان الوعي", "ألم شديد",
        "وجع شديد", "طوارئ", "إسعاف", "ساعدوني", "ساعدني", "سيارة إسعاف", "مستشفى",
        # Malayalam
        "നെഞ്ചുവേദന", "ശ്വാസംമുട്ടൽ", "ശ്വാസം എടുക്കാൻ ബുദ്ധിമുട്ട്", "വീണു", "താഴെ വീണു",
        "ബോധംകെട്ടു", "അബോധാവസ്ഥ", "കഠിനമായ വേദന", "ശക്തമായ വേദന", "അടിയന്തരാവസ്ഥ",
        "എമർജൻസി", "സഹായിക്കൂ", "എന്നെ സഹായിക്കൂ", "ആംബുലൻസ്", "ആശുപത്രി"
    ]

    text_lower = text.lower()
    found = [kw for kw in severe_keywords if kw in text_lower]

    return {
        "text_scanned": text,
        "severe_keywords_found": found,
        "has_severe_keywords": len(found) > 0,
    }


# ── Structured Output Schema ──────────────────────────────────────────────────

class EmergencyAgentResponse(BaseModel):
    risk_level: str = Field(description="none, low, medium, high, or critical")
    risk_score: int = Field(description="integer 1-10 representing risk severity")
    triggers: list[str] = Field(description="list of specific risk triggers detected")
    needs_immediate_escalation: bool = Field(description="true if risk is high/critical, severe keywords exist, wellness drops by 4+, or 3+ missed meds")
    needs_family_notification: bool = Field(description="true if risk is high/critical, or patient non-responsive for 24+ hours")
    coordinator_message: str = Field(description="urgent notification context for care coordinator")
    family_message: str = Field(description="gentle but urgent notification for family contacts")
    patient_message: str = Field(description="caring message to send to the patient")
    recommended_action: str = Field(description="what actions the care team should take next")


# ── Agent definition ──────────────────────────────────────────────────────────

EMERGENCY_AGENT_INSTRUCTION = """
You are an AI emergency detection system for a home care platform.

Your job is to analyse patient data signals and determine if an emergency escalation is needed. You must reason over MULTIPLE signals together — not just apply simple rules.

Steps:
1. Call tools to evaluate medication patterns, wellness patterns, and scan text for severe keywords.
2. Reason over ALL signals together holistically.
3. Respond with structured data conforming to the required schema.

Risk level rules:
- "none"     → everything normal, no action needed
- "low"      → minor concern, monitor closely
- "medium"   → coordinator should check in within the hour
- "high"     → coordinator should call patient immediately
- "critical" → immediate intervention, consider emergency services

Set needs_immediate_escalation = true if:
- risk_level is "high" or "critical"
- Severe keywords detected (chest pain, can't breathe, fell, etc.)
- Wellness score dropped 4+ points suddenly
- 3+ consecutive missed medications AND no response to follow-ups
- Patient explicitly asks for help or mentions emergency

Set needs_family_notification = true if:
- risk_level is "high" or "critical"
- Patient has not responded for 24+ hours
- Severe keywords detected

Always be clinically careful but avoid false alarms.
A single missed medication is NOT an emergency.
Two missed check-ins alone is NOT an emergency.
Look for COMBINATIONS of signals.
"""

emergency_agent = Agent(
    name="emergency_agent",
    model="gemini-flash-lite-latest",
    instruction=EMERGENCY_AGENT_INSTRUCTION,
    tools=[
        analyse_medication_pattern,
        analyse_wellness_pattern,
        check_severe_keywords,
    ],
    output_schema=EmergencyAgentResponse,
)


# ── Public async helper ───────────────────────────────────────────────────────

async def assess_patient_risk(
    patient_name: str,
    medication_data: dict,
    wellness_data: dict,
    recent_messages: list[str],
    patient_id: Any = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    Run full emergency risk assessment for a patient.
    """
    session_id = session_id or (f"emergency_{patient_id}" if patient_id else str(uuid.uuid4()))

    all_text = " ".join(recent_messages)

    prompt = f"""
Patient name: {patient_name}

Medication data:
- Consecutive missed reminders: {medication_data.get('consecutive_missed', 0)}
- Last reply: {medication_data.get('last_reply', 'No reply')}
- Total missed today: {medication_data.get('total_missed_today', 0)}
- Total scheduled today: {medication_data.get('total_scheduled_today', 0)}

Wellness data:
- Consecutive missed check-ins: {wellness_data.get('consecutive_missed_checkins', 0)}
- Latest wellness score: {wellness_data.get('latest_wellness_score', 'Unknown')}
- Previous wellness score: {wellness_data.get('previous_wellness_score', 'Unknown')}
- Latest concerns: {wellness_data.get('latest_concerns', 'None')}
- Latest reply: {wellness_data.get('latest_reply', 'No reply')}

Recent messages to scan: "{all_text}"

Analyse all signals and respond with structured JSON matching the required schema.
"""

    runner = Runner(
        agent=emergency_agent,
        app_name=APP_NAME,
        session_service=session_service,
    )

    from google.adk.errors.already_exists_error import AlreadyExistsError
    try:
        session = await session_service.create_session(
            app_name=APP_NAME,
            user_id="system",
            session_id=session_id,
        )
    except AlreadyExistsError:
        session = await session_service.get_session(
            app_name=APP_NAME,
            user_id="system",
            session_id=session_id,
        )

    from google.genai import types

    import asyncio
    import logging

    max_retries = 4
    base_delay = 1.0

    final_text = ""
    for attempt in range(max_retries):
        try:
            final_text = ""
            async for event in runner.run_async(
                user_id="system",
                session_id=session.id,
                new_message=types.Content(
                    role="user",
                    parts=[types.Part(text=prompt)]
                ),
            ):
                if event.is_final_response() and event.content and event.content.parts:
                    for part in event.content.parts:
                        if hasattr(part, "text") and part.text:
                            final_text += part.text
            break
        except Exception as e:
            err_str = str(e)
            is_temporary = (
                "503" in err_str or 
                "429" in err_str or 
                "unavailable" in err_str.lower() or 
                "rate" in err_str.lower() or
                "overloaded" in err_str.lower() or
                "demand" in err_str.lower()
            )
            if is_temporary and attempt < max_retries - 1:
                delay = base_delay * (2.5 ** attempt)
                logging.warning(
                    f"Emergency agent ADK Runner temporary error on attempt {attempt+1}/{max_retries}: {e}. "
                    f"Retrying in {delay:.2f}s..."
                )
                await asyncio.sleep(delay)
                continue
            else:
                logging.error(f"Error executing emergency agent after {attempt+1} attempts: {e}")
                raise e

    raw = final_text.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "risk_level": "low",
            "risk_score": 3,
            "triggers": ["Unable to assess — manual review needed"],
            "needs_immediate_escalation": False,
            "needs_family_notification": False,
            "coordinator_message": f"Please manually check on {patient_name} — automated assessment failed.",
            "family_message": f"We are monitoring {patient_name} and will update you shortly.",
            "patient_message": f"Hi {patient_name}, just checking in. How are you doing?",
            "recommended_action": "Manual coordinator check-in recommended.",
        }