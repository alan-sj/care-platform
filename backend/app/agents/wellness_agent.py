"""
Patient Wellness Agent — ADK-native implementation.

Sends daily check-ins to patients via Telegram and interprets
their free-text replies into structured wellness scores.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

_session_service = InMemorySessionService()
APP_NAME = "wellness_agent_app"


# ── Tool ──────────────────────────────────────────────────────────────────────

def parse_wellness_reply(
    patient_name: str,
    patient_message: str,
) -> dict[str, Any]:
    """
    Parse a patient's free-text daily wellness check-in reply.

    Args:
        patient_name:    The patient's name.
        patient_message: The raw message the patient sent.

    Returns:
        Raw inputs for the agent to reason over.
    """
    return {
        "patient_name": patient_name,
        "patient_message": patient_message,
    }


# ── Agent ─────────────────────────────────────────────────────────────────────

WELLNESS_AGENT_INSTRUCTION = """
You are a compassionate AI wellness assistant for a home care platform.

A patient has replied to their daily wellness check-in. Your job is to:
1. Call the `parse_wellness_reply` tool with the provided inputs.
2. Analyse the reply across four dimensions: mood, pain, eating, sleep.
3. Respond with ONLY a valid JSON object — no extra text, no markdown fences.

JSON format (strictly follow this):
{
    "mood": "good" | "okay" | "bad" | "unknown",
    "pain": "none" | "mild" | "moderate" | "severe" | "unknown",
    "eating": "yes" | "no" | "partial" | "unknown",
    "sleep": "good" | "okay" | "poor" | "unknown",
    "wellness_score": <integer 1-10>,
    "concerns": null | "<brief description of any health concerns>",
    "needs_escalation": true | false,
    "reply": "<warm, caring reply to send back to the patient>"
}

Scoring guide for wellness_score (1-10):
- 9-10: All good, no concerns
- 7-8:  Generally okay, minor issues
- 5-6:  Some concerns, monitor closely
- 3-4:  Multiple concerns, coordinator should check in
- 1-2:  Serious concerns, immediate escalation needed

Set needs_escalation to true if:
- Pain is moderate or severe
- Mood is bad AND another dimension is also concerning
- Patient mentions chest pain, difficulty breathing, falling, confusion
- Wellness score is 4 or below

Always be warm, gentle and supportive. Patients may be elderly.
Support messages in English, Arabic, and Malayalam — match the patient's language.
"""

wellness_agent = Agent(
    name="wellness_agent",
    model="gemini-2.5-flash-lite",
    instruction=WELLNESS_AGENT_INSTRUCTION,
    tools=[parse_wellness_reply],
)


# ── Check-in message builder ──────────────────────────────────────────────────

def build_checkin_message(patient_name: str, language: str = "en") -> str:
    messages = {
        "en": (
            f"🌟 Good morning, <b>{patient_name}</b>!\n\n"
            "Time for your daily check-in. Just reply naturally:\n\n"
            "1️⃣ How are you feeling today?\n"
            "2️⃣ Any pain or discomfort?\n"
            "3️⃣ Have you eaten today?\n"
            "4️⃣ How did you sleep last night?\n\n"
            "You can reply all at once — I'll take care of the rest 😊"
        ),
        "ar": (
            f"🌟 صباح الخير، <b>{patient_name}</b>!\n\n"
            "حان وقت الفحص اليومي:\n\n"
            "1️⃣ كيف تشعر اليوم؟\n"
            "2️⃣ هل تعاني من أي ألم؟\n"
            "3️⃣ هل تناولت طعامك اليوم؟\n"
            "4️⃣ كيف كان نومك الليلة الماضية؟"
        ),
        "ml": (
            f"🌟 സുപ്രഭാതം, <b>{patient_name}</b>!\n\n"
            "ദൈനംദിന ചെക്ക്-ഇൻ സമയമായി:\n\n"
            "1️⃣ ഇന്ന് എങ്ങനെ തോന്നുന്നു?\n"
            "2️⃣ എന്തെങ്കിലും വേദന ഉണ്ടോ?\n"
            "3️⃣ ഇന്ന് ഭക്ഷണം കഴിച്ചോ?\n"
            "4️⃣ കഴിഞ്ഞ രാത്രി ഉറക്കം എങ്ങനെ ആയിരുന്നു?"
        ),
    }
    return messages.get(language, messages["en"])


# ── Public async helper ───────────────────────────────────────────────────────

async def interpret_wellness_reply(
    patient_name: str,
    message: str,
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    Interpret a patient's wellness check-in reply using the ADK agent.

    Args:
        patient_name: Patient's name.
        message:      Raw patient reply text.
        session_id:   Optional ADK session ID.

    Returns:
        Parsed wellness dict with mood, pain, eating, sleep,
        wellness_score, concerns, needs_escalation, reply.
    """
    session_id = session_id or str(uuid.uuid4())

    prompt = (
        f"Patient name: {patient_name}\n"
        f"Patient wellness reply: \"{message}\"\n\n"
        "Interpret this wellness check-in and respond with JSON only."
    )

    runner = Runner(
        agent=wellness_agent,
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
            "mood": "unknown",
            "pain": "unknown",
            "eating": "unknown",
            "sleep": "unknown",
            "wellness_score": 5,
            "concerns": None,
            "needs_escalation": False,
            "reply": (
                f"Thank you {patient_name}, I received your message. "
                "Our care team will follow up with you shortly."
            ),
        }