"""
Caregiver Copilot Agent — ADK-native implementation.

Converts a coordinator's free-text or voice-transcribed visit note
into structured clinical data. Uses patient history as context
so it can reason about what's normal vs concerning for that
specific patient.

ADK concept: Long context reasoning — patient history is injected
into the prompt so the agent reasons in context, not in isolation.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

_session_service = InMemorySessionService()
APP_NAME = "copilot_agent_app"


# ── Tools ─────────────────────────────────────────────────────────────────────

def extract_vitals(note_text: str) -> dict[str, Any]:
    """
    Extract vital signs mentioned in a visit note.

    Args:
        note_text: Raw visit note text from coordinator.

    Returns:
        Dict of any vitals found in the text.
    """
    return {
        "note_text": note_text,
        "instruction": (
            "Extract any vital signs mentioned: blood pressure (BP), "
            "pulse/heart rate, temperature, oxygen saturation (SpO2), "
            "blood sugar/glucose, weight. Return null for any not mentioned."
        ),
    }


def extract_medications_given(note_text: str) -> dict[str, Any]:
    """
    Extract medications administered during the visit.

    Args:
        note_text: Raw visit note text from coordinator.

    Returns:
        List of medications mentioned as given during the visit.
    """
    return {
        "note_text": note_text,
        "instruction": (
            "Extract any medications that were given/administered during this visit. "
            "Only include medications explicitly mentioned as given, not just prescribed."
        ),
    }


def assess_visit_risks(
    note_text: str,
    patient_baseline_bp: str | None,
    patient_conditions: str | None,
    recent_concerns: str | None,
) -> dict[str, Any]:
    """
    Assess clinical risks based on visit note and patient context.

    Args:
        note_text:            Raw visit note text.
        patient_baseline_bp:  Patient's normal/baseline BP if known.
        patient_conditions:   Known medical conditions.
        recent_concerns:      Any concerns flagged in recent wellness/medication logs.

    Returns:
        Risk assessment context for the agent to reason over.
    """
    return {
        "note_text":            note_text,
        "patient_baseline_bp":  patient_baseline_bp or "Unknown",
        "patient_conditions":   patient_conditions or "Not specified",
        "recent_concerns":      recent_concerns or "None",
        "instruction": (
            "Compare the visit findings against the patient's baseline and history. "
            "Identify what is normal for THIS patient vs what is newly concerning."
        ),
    }


# ── Agent ─────────────────────────────────────────────────────────────────────

COPILOT_AGENT_INSTRUCTION = """
You are an AI clinical documentation assistant for a home care platform.

A coordinator has just visited a patient and sent you their visit notes
(typed or voice-transcribed). Your job is to:

1. Call extract_vitals() with the note text.
2. Call extract_medications_given() with the note text.
3. Call assess_visit_risks() with the note and patient context.
4. Structure everything into a clean clinical record.
5. Respond with ONLY a valid JSON object — no extra text, no markdown fences.

JSON format (strictly follow this):
{
    "visit_time": "<HH:MM or null if not mentioned>",
    "visit_summary": "<2-3 sentence clean professional summary of the visit>",
    "vitals": {
        "bp": "<e.g. 140/90 or null>",
        "pulse": "<e.g. 78 bpm or null>",
        "temperature": "<e.g. 37.2C or null>",
        "spo2": "<e.g. 98% or null>",
        "blood_sugar": "<e.g. 6.2 mmol/L or null>",
        "weight": "<e.g. 72kg or null>"
    },
    "medications_given": ["list", "of", "medications", "administered"],
    "observations": "<what the coordinator observed about patient condition, mood, environment>",
    "follow_up_note": "<specific follow-up instructions or null>",
    "follow_up_needed": true | false,
    "risk_flags": ["list of specific concerns — empty array if none"],
    "risk_level": "none" | "low" | "medium" | "high",
    "coordinator_note_quality": "complete" | "partial" | "minimal"
}

Risk flag rules — flag these if found:
- Vitals outside normal range (BP > 140/90, SpO2 < 95%, temperature > 38C)
- Patient mentioned pain, discomfort, confusion, falls
- Medication not taken or refused
- Wound not healing or worsening
- Significant mood change (very sad, very confused, agitated)
- Patient living conditions concerning (no food, unsafe environment)
- Any new symptom not previously recorded

note_quality rules:
- "complete"  → vitals + observations + medications all present
- "partial"   → some key info missing but usable
- "minimal"   → very brief note, coordinator should add more detail

Always be clinically precise but use plain language for observations.
Consider the patient's history and baseline when assessing risks.
"""

copilot_agent = Agent(
    name="copilot_agent",
    model="gemini-2.5-flash-lite",
    instruction=COPILOT_AGENT_INSTRUCTION,
    tools=[
        extract_vitals,
        extract_medications_given,
        assess_visit_risks,
    ],
)


# ── Public async helper ───────────────────────────────────────────────────────

async def process_visit_note(
    coordinator_name: str,
    patient_name: str,
    raw_note: str,
    patient_context: dict,
    patient_id: Any = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    Process a coordinator's visit note into structured clinical data.

    Args:
        coordinator_name: Name of the coordinator who visited.
        patient_name:     Name of the patient visited.
        raw_note:         Raw text/transcribed note from coordinator.
        patient_context:  Dict with baseline_bp, conditions, recent_concerns,
                          recent_wellness_score, recent_medication_status.
        session_id:       Optional ADK session ID.

    Returns:
        Structured visit note dict.
    """
    session_id = session_id or (f"copilot_{patient_id}" if patient_id else str(uuid.uuid4()))

    prompt = f"""
Coordinator: {coordinator_name}
Patient: {patient_name}

Patient context (use this to assess what is normal vs concerning):
- Known conditions: {patient_context.get('conditions', 'Not specified')}
- Baseline BP: {patient_context.get('baseline_bp', 'Unknown')}
- Recent wellness score: {patient_context.get('recent_wellness_score', 'No data')}
- Recent medication status: {patient_context.get('recent_medication_status', 'No data')}
- Recent concerns: {patient_context.get('recent_concerns', 'None')}

Visit note from coordinator:
\"\"\"{raw_note}\"\"\"

Process this visit note and respond with structured JSON only.
"""

    runner = Runner(
        agent=copilot_agent,
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
            "visit_time":             None,
            "visit_summary":          raw_note[:200],
            "vitals":                 {},
            "medications_given":      [],
            "observations":           raw_note,
            "follow_up_note":         None,
            "follow_up_needed":       False,
            "risk_flags":             [],
            "risk_level":             "low",
            "coordinator_note_quality": "minimal",
        }