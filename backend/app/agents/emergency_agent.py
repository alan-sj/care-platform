"""
Emergency Detection Agent — ADK-native implementation.

Monitors multiple patient data signals simultaneously and triggers
escalation when risk patterns are detected. Unlike simple rule-based
systems, this agent reasons over combined signals to determine
true emergency vs false alarm.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

_session_service = InMemorySessionService()
APP_NAME = "emergency_agent_app"


# ── Tools ─────────────────────────────────────────────────────────────────────

def analyse_medication_pattern(
    consecutive_missed: int,
    last_reply: str | None,
    total_missed_today: int,
    total_scheduled_today: int,
) -> dict[str, Any]:
    """
    Analyse a patient's medication adherence pattern for emergency signals.

    Args:
        consecutive_missed:     Number of consecutive missed reminders in a row.
        last_reply:             Last message the patient sent (or None).
        total_missed_today:     Total medications missed today.
        total_scheduled_today:  Total medications scheduled today.

    Returns:
        Structured medication risk data for the agent to reason over.
    """
    return {
        "consecutive_missed": consecutive_missed,
        "last_reply": last_reply or "No reply",
        "total_missed_today": total_missed_today,
        "total_scheduled_today": total_scheduled_today,
        "missed_ratio": round(total_missed_today / max(total_scheduled_today, 1), 2),
    }


def analyse_wellness_pattern(
    consecutive_missed_checkins: int,
    latest_wellness_score: int | None,
    previous_wellness_score: int | None,
    latest_concerns: str | None,
    latest_reply: str | None,
) -> dict[str, Any]:
    """
    Analyse a patient's wellness check-in pattern for emergency signals.

    Args:
        consecutive_missed_checkins: Number of consecutive missed wellness check-ins.
        latest_wellness_score:       Most recent wellness score (1-10).
        previous_wellness_score:     Previous wellness score (1-10).
        latest_concerns:             AI-extracted concerns from last check-in.
        latest_reply:                Raw last reply from patient.

    Returns:
        Structured wellness risk data for the agent to reason over.
    """
    score_drop = None
    if latest_wellness_score and previous_wellness_score:
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

    Args:
        text: Any patient message or concern text to scan.

    Returns:
        Dict with found keywords and severity assessment.
    """
    severe_keywords = [
        "chest pain", "can't breathe", "cannot breathe", "difficulty breathing",
        "fell down", "i fell", "fallen", "unconscious", "fainted",
        "severe pain", "unbearable pain", "heart", "stroke",
        "bleeding", "vomiting blood", "can't move", "cannot move",
        "help me", "emergency", "ambulance", "hospital",
        "very bad", "extremely bad", "worst", "dying",
    ]

    text_lower = text.lower()
    found = [kw for kw in severe_keywords if kw in text_lower]

    return {
        "text_scanned": text,
        "severe_keywords_found": found,
        "has_severe_keywords": len(found) > 0,
    }


# ── Agent ─────────────────────────────────────────────────────────────────────

EMERGENCY_AGENT_INSTRUCTION = """
You are an AI emergency detection system for a home care platform.

Your job is to analyse patient data signals and determine if an emergency
escalation is needed. You must reason over MULTIPLE signals together —
not just apply simple rules.

Steps:
1. Call the relevant tools to analyse the data provided.
2. Reason over ALL signals together holistically.
3. Respond with ONLY a valid JSON object — no extra text, no markdown fences.

JSON format (strictly follow this):
{
    "risk_level": "none" | "low" | "medium" | "high" | "critical",
    "risk_score": <integer 1-10>,
    "triggers": ["list", "of", "specific", "reasons"],
    "needs_immediate_escalation": true | false,
    "needs_family_notification": true | false,
    "coordinator_message": "<urgent message to send coordinator>",
    "family_message": "<gentle but urgent message for family>",
    "patient_message": "<caring follow-up message for patient>",
    "recommended_action": "<what the care team should do next>"
}

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
    model="gemini-2.5-flash-lite",
    instruction=EMERGENCY_AGENT_INSTRUCTION,
    tools=[
        analyse_medication_pattern,
        analyse_wellness_pattern,
        check_severe_keywords,
    ],
)


# ── Public async helper ───────────────────────────────────────────────────────

async def assess_patient_risk(
    patient_name: str,
    medication_data: dict,
    wellness_data: dict,
    recent_messages: list[str],
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    Run full emergency risk assessment for a patient.

    Args:
        patient_name:    Patient's name.
        medication_data: Dict with consecutive_missed, last_reply,
                         total_missed_today, total_scheduled_today.
        wellness_data:   Dict with consecutive_missed_checkins,
                         latest_wellness_score, previous_wellness_score,
                         latest_concerns, latest_reply.
        recent_messages: List of recent patient messages to scan for keywords.
        session_id:      Optional ADK session ID.

    Returns:
        Risk assessment dict with risk_level, triggers, escalation flags,
        and messages to send.
    """
    session_id = session_id or str(uuid.uuid4())

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

Analyse all signals and respond with JSON risk assessment only.
"""

    runner = Runner(
        agent=emergency_agent,
        app_name=APP_NAME,
        session_service=_session_service,
    )

    session = await _session_service.create_session(
        app_name=APP_NAME,
        user_id="system",
        session_id=session_id,
    )

    from google.genai import types

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

    raw = final_text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

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