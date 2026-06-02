"""
Medication Agent — ADK-native implementation.
Interprets a patient's free-text reply to a medication reminder
and returns a structured JSON result using native ADK schemas.
"""

from __future__ import annotations

import json
from typing import Any
from pydantic import BaseModel, Field

from google.adk import Agent
from google.adk.runners import Runner
from app.services.session_service import session_service

APP_NAME = "medication_agent_app"


# ── Structured Output Schema ──────────────────────────────────────────────────

class MedicationStatusItem(BaseModel):
    medication_name: str
    status: str = Field(description="confirmed, missed, flagged, or unclear")
    concern: str | None = Field(default=None, description="detail any symptoms or concerns if status is flagged")

class MedicationAgentResponse(BaseModel):
    medications: list[MedicationStatusItem]
    reply: str = Field(description="warm, supportive, language-matched reply to send to the patient")


# ── Agent definition ──────────────────────────────────────────────────────────

MEDICATION_AGENT_INSTRUCTION = """
You are a compassionate AI care assistant for a home care platform.

A patient has replied to a medication reminder. Your job is to:
1. Interpret the patient's reply and determine the status of each medication listed.
2. Formulate a warm, supportive response in the patient's language.

Status rules:
- "confirmed"  → patient clearly took that medication
- "missed"     → patient has NOT taken it ("no", "not yet", "haven't", "will take later")
- "flagged"    → took it BUT mentioned symptoms/concerns (set concern field)
- "unclear"    → genuinely cannot determine

Interpretation shortcuts:
- "all" / "yes" / "took them all"     → all confirmed
- "no" / "none" / "not yet"           → all missed
- "1" or "2" etc.                     → only that numbered med confirmed, rest missed
- "1 and 2" / "1 2"                   → those confirmed, rest missed
- Natural language per med name       → interpret naturally

Always write a warm, supportive reply. Patients may be elderly.
Support messages in English, Arabic, and Malayalam — match the patient's language.
"""

medication_agent = Agent(
    name="medication_agent",
    model="gemini-flash-lite-latest",
    instruction=MEDICATION_AGENT_INSTRUCTION,
    output_schema=MedicationAgentResponse,
)


# ── Public async helper ───────────────────────────────────────────────────────

async def interpret_patient_reply(
    patient_name: str,
    medications: list[dict],          # [{"index": 1, "name": "Metformin", "dosage": "500mg"}, ...]
    message: str,
    patient_id: Any = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    Interpret patient reply using direct Gemini client call with response schema.
    """
    import uuid

    session_id = session_id or (f"medication_{patient_id}" if patient_id else str(uuid.uuid4()))

    med_list = "\n".join(
        f"{m['index']}. {m['name']} {m.get('dosage', '')}".strip()
        for m in medications
    )

    prompt = (
        f"Patient name: {patient_name}\n"
        f"Medications reminded about:\n{med_list}\n\n"
        f"Patient message: \"{message}\"\n\n"
        "Interpret this reply and respond matching the required schema."
    )

    # Standardize session creation to keep ADK session storage updated/initialized
    try:
        await session_service.create_session(
            app_name=APP_NAME,
            user_id="system",
            session_id=session_id,
        )
    except Exception:
        pass

    from app.services.gemini_service import generate_content_with_retry

    try:
        result = await generate_content_with_retry(
            prompt=prompt,
            system_instruction=MEDICATION_AGENT_INSTRUCTION,
            response_schema=MedicationAgentResponse,
            model="gemini-flash-lite-latest",
        )
        return result
    except Exception as e:
        import logging
        logging.error(f"Error calling medication agent directly: {e}")
        # Graceful fallback
        return {
            "medications": [
                {"medication_name": m["name"], "status": "unclear", "concern": None}
                for m in medications
            ],
            "reply": (
                f"Thank you {patient_name}, I received your message. "
                "Our care team will follow up with you shortly."
            ),
        }