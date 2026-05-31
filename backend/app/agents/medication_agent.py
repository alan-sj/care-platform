"""
Medication Agent — ADK-native rewrite.

Replaces the old direct google-genai call with a proper ADK Agent + tool.
The agent interprets a patient's free-text reply to a medication reminder
and returns a structured JSON result.
"""

from __future__ import annotations

import json
import os
from typing import Any

from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService


# ── Session service (in-memory; swap for DatabaseSessionService in prod) ─────
_session_service = InMemorySessionService()

APP_NAME = "medication_agent_app"


# ── Tool: parse medication reply ──────────────────────────────────────────────

def parse_medication_reply(
    patient_name: str,
    medication_list: str,
    patient_message: str,
) -> dict[str, Any]:
    """
    Analyse a patient's free-text reply and return a structured interpretation.

    Args:
        patient_name: The patient's first name (used to personalise the reply).
        medication_list: Numbered list of medications, e.g.
            "1. Metformin 500mg\\n2. Lisinopril 10mg"
        patient_message: The raw message the patient sent back.

    Returns:
        A dict with keys:
          - medications: list of {medication_name, status, concern}
          - reply: warm human-readable reply to send back to the patient
    """
    # This function is called *by* the ADK agent as a tool.
    # The real logic lives in the agent's system instruction + Gemini reasoning.
    # We return the raw input so the agent can reason over it and output JSON.
    return {
        "patient_name": patient_name,
        "medication_list": medication_list,
        "patient_message": patient_message,
    }


# ── Agent definition ──────────────────────────────────────────────────────────

MEDICATION_AGENT_INSTRUCTION = """
You are a compassionate AI care assistant for a home care platform.

A patient has replied to a medication reminder. Your job is to:
1. Call the `parse_medication_reply` tool with the provided inputs.
2. Use the tool's output to reason about each medication's status.
3. Respond with ONLY a valid JSON object — no extra text, no markdown fences.

JSON format (strictly follow this):
{
    "medications": [
        {
            "medication_name": "<name>",
            "status": "confirmed" | "missed" | "flagged" | "unclear",
            "concern": null | "<description>"
        }
    ],
    "reply": "<warm single reply covering all medications>"
}

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
    model="gemini-2.5-flash-lite",
    instruction=MEDICATION_AGENT_INSTRUCTION,
    tools=[parse_medication_reply],
)


# ── Public async helper ───────────────────────────────────────────────────────

async def interpret_patient_reply(
    patient_name: str,
    medications: list[dict],          # [{"index": 1, "name": "Metformin", "dosage": "500mg"}, ...]
    message: str,
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    High-level helper that wraps the ADK runner call.

    Args:
        patient_name: Patient's name.
        medications:  List of medication dicts with index/name/dosage keys.
        message:      Raw patient reply text.
        session_id:   Optional session ID for continuity (defaults to a new UUID).

    Returns:
        Parsed dict with 'medications' list and 'reply' string.
    """
    import uuid

    session_id = session_id or str(uuid.uuid4())

    med_list = "\n".join(
        f"{m['index']}. {m['name']} {m.get('dosage', '')}".strip()
        for m in medications
    )

    prompt = (
        f"Patient name: {patient_name}\n"
        f"Medications reminded about:\n{med_list}\n\n"
        f"Patient message: \"{message}\"\n\n"
        "Interpret this reply and respond with JSON only."
    )

    runner = Runner(
        agent=medication_agent,
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
        new_message=types.Content(role="user", parts=[types.Part(text=prompt)]),
    ):
        if event.is_final_response() and event.content and event.content.parts:
            for part in event.content.parts:
                if hasattr(part, "text") and part.text:
                    final_text += part.text

    # Strip accidental markdown fences
    raw = final_text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
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