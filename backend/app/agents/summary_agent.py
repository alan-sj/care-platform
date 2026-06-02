"""
Summary Agent — ADK-native implementation.
Generates a warm, family-friendly daily medication summary.
"""

from __future__ import annotations

from google.adk import Agent
from google.adk.runners import Runner
from app.services.session_service import session_service

from typing import Any

APP_NAME = "summary_agent_app"


# ── Agent definition ──────────────────────────────────────────────────────────

SUMMARY_AGENT_INSTRUCTION = """
You are a compassionate care assistant writing a daily update for a patient's family.

Your job is to write a warm, human, family-friendly summary of the patient's day based on the provided daily care updates (medication logs, wellness check-in details, and/or coordinator visit observations).

Rules:
- Keep it under 200 words.
- Sound human — not clinical, not robotic.
- Integrate the patient's wellness check-in details (mood, pain, sleep, wellness score) and coordinator visit observations (if present) naturally.
- Mention what went well (e.g., good mood, eating well, successful visits).
- Mention any concerns (e.g., back pain, fatigue, missed medication) gently and supportively, without alarm.
- Never use medical jargon.
- Always end on a positive or reassuring note.
- Write as if speaking to a worried family member who loves this person.
- Do NOT include a JSON wrapper — output plain readable text only.
"""

summary_agent = Agent(
    name="summary_agent",
    model="gemini-flash-lite-latest",
    instruction=SUMMARY_AGENT_INSTRUCTION,
)


# ── Public async helper ───────────────────────────────────────────────────────

async def generate_family_summary(
    patient_name: str,
    logs: list[dict],
    wellness_data: dict | None = None,
    visit_note_data: dict | None = None,
    patient_id: Any = None,
    session_id: str | None = None,
) -> str:
    """
    Generate a family-friendly daily summary for a patient.
    Uses direct Gemini client call.
    """
    import uuid

    session_id = session_id or (f"summary_{patient_id}" if patient_id else str(uuid.uuid4()))

    details = ""
    if logs:
        confirmed = [l for l in logs if l["status"] == "confirmed"]
        missed    = [l for l in logs if l["status"] == "missed"]
        flagged   = [l for l in logs if l["status"] == "flagged"]

        med_details = "\n".join(
            f"- {l['medication']} at {l['time']}: {l['status']} — {l.get('reply', 'No reply')}"
            for l in logs
        )
        details += (
            f"Medication Status:\n"
            f"- Total scheduled: {len(logs)}\n"
            f"- Confirmed taken: {len(confirmed)}\n"
            f"- Missed: {len(missed)}\n"
            f"- Flagged concerns: {len(flagged)}\n"
            f"Individual log entries:\n{med_details}\n\n"
        )
    else:
        confirmed = []

    if wellness_data:
        details += (
            f"Today's Wellness Check-in details:\n"
            f"- Health/Wellness Score: {wellness_data.get('score')}/10\n"
            f"- Patient reported mood: {wellness_data.get('mood')}\n"
            f"- Patient reported pain: {wellness_data.get('pain')}\n"
            f"- Patient reported eating: {wellness_data.get('eating')}\n"
            f"- Patient reported sleep: {wellness_data.get('sleep')}\n"
            f"- Noted health concerns: {wellness_data.get('concerns') or 'None'}\n\n"
        )

    if visit_note_data:
        details += (
            f"Today's Visit from Care Coordinator:\n"
            f"- Summary of visit: {visit_note_data.get('summary')}\n"
            f"- Coordinator observations: {visit_note_data.get('observations')}\n"
            f"- Care coordinator risk level: {visit_note_data.get('risk_level')}\n\n"
        )

    prompt = (
        f"Patient: {patient_name}\n\n"
        f"Today's Care Updates:\n"
        f"{details}\n"
        "Generate the family summary now."
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
        final_text = await generate_content_with_retry(
            prompt=prompt,
            system_instruction=SUMMARY_AGENT_INSTRUCTION,
            response_schema=None,
            model="gemini-flash-lite-latest",
        )
        if final_text:
            return final_text
    except Exception as e:
        import logging
        logging.error(f"Error calling summary agent directly: {e}")

    # Fallback
    confirmed_count = len(confirmed)
    return (
        f"Good evening! Here's a quick update on {patient_name}. "
        f"Today they confirmed {confirmed_count} out of {len(logs)} scheduled medications. "
        "Our care team is monitoring their progress. "
        "Feel free to reach out if you have any questions."
    )