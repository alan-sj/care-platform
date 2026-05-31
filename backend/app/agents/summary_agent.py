"""
Summary Agent — ADK-native rewrite.

Replaces the old direct google-genai call with a proper ADK Agent + tool.
Generates a warm, family-friendly daily medication summary.
"""

from __future__ import annotations

import os
from typing import Any

from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService


_session_service = InMemorySessionService()
APP_NAME = "summary_agent_app"


# ── Tool: aggregate log data ──────────────────────────────────────────────────

def aggregate_medication_logs(
    patient_name: str,
    total: int,
    confirmed: int,
    missed: int,
    flagged: int,
    log_details: str,
) -> dict[str, Any]:
    """
    Aggregate today's medication log data for a patient.

    Args:
        patient_name: Name of the patient.
        total:        Total medications scheduled today.
        confirmed:    Number taken and confirmed.
        missed:       Number missed (no response or explicit "no").
        flagged:      Number taken but with reported health concerns.
        log_details:  Multiline string with per-medication details.

    Returns:
        The same data as a dict for the agent to summarise.
    """
    return {
        "patient_name": patient_name,
        "total": total,
        "confirmed": confirmed,
        "missed": missed,
        "flagged": flagged,
        "log_details": log_details,
    }


# ── Agent definition ──────────────────────────────────────────────────────────

SUMMARY_AGENT_INSTRUCTION = """
You are a compassionate care assistant writing a daily update for a patient's family.

Steps:
1. Call the `aggregate_medication_logs` tool with the data provided.
2. Write a warm, human, family-friendly summary of the patient's day.

Rules:
- Keep it under 200 words.
- Sound human — not clinical, not robotic.
- Mention what went well.
- Mention any concerns gently, without alarming the reader.
- Never use medical jargon.
- Always end on a positive or reassuring note.
- Write as if speaking to a worried family member who loves this person.
- Do NOT include a JSON wrapper — output plain readable text only.
"""

summary_agent = Agent(
    name="summary_agent",
    model="gemini-2.5-flash-lite",
    instruction=SUMMARY_AGENT_INSTRUCTION,
    tools=[aggregate_medication_logs],
)


# ── Public async helper ───────────────────────────────────────────────────────

async def generate_family_summary(
    patient_name: str,
    logs: list[dict],
    session_id: str | None = None,
) -> str:
    """
    Generate a family-friendly daily summary for a patient.

    Args:
        patient_name: Patient's name.
        logs:         List of dicts with keys: medication, time, status, reply.
        session_id:   Optional ADK session ID.

    Returns:
        Plain-text summary string.
    """
    import uuid

    session_id = session_id or str(uuid.uuid4())

    confirmed = [l for l in logs if l["status"] == "confirmed"]
    missed    = [l for l in logs if l["status"] == "missed"]
    flagged   = [l for l in logs if l["status"] == "flagged"]

    details = "\n".join(
        f"- {l['medication']} at {l['time']}: {l['status']} — {l.get('reply', 'No reply')}"
        for l in logs
    )

    prompt = (
        f"Patient: {patient_name}\n"
        f"Total medications scheduled: {len(logs)}\n"
        f"Confirmed taken: {len(confirmed)}\n"
        f"Missed: {len(missed)}\n"
        f"Flagged concerns: {len(flagged)}\n\n"
        f"Details:\n{details}\n\n"
        "Generate the family summary now."
    )

    runner = Runner(
        agent=summary_agent,
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

    if final_text.strip():
        return final_text.strip()

    # Fallback
    confirmed_count = len(confirmed)
    return (
        f"Good evening! Here's a quick update on {patient_name}. "
        f"Today they confirmed {confirmed_count} out of {len(logs)} scheduled medications. "
        "Our care team is monitoring their progress. "
        "Feel free to reach out if you have any questions."
    )