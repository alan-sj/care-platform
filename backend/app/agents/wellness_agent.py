"""
Patient Wellness Agent — ADK-native implementation.
Sends daily check-ins to patients and interprets their replies
into structured wellness scores using native ADK schemas.
"""

from __future__ import annotations

import json
import uuid
from typing import Any
from pydantic import BaseModel, Field

from google.adk import Agent
from google.adk.runners import Runner
from app.services.session_service import session_service

APP_NAME = "wellness_agent_app"


# ── Structured Output Schema ──────────────────────────────────────────────────

class WellnessAgentResponse(BaseModel):
    mood: str = Field(description="good, okay, bad, or unknown")
    pain: str = Field(description="none, mild, moderate, severe, or unknown")
    eating: str = Field(description="yes, no, partial, or unknown")
    sleep: str = Field(description="good, okay, poor, or unknown")
    wellness_score: int = Field(description="integer 1-10 based on guidelines")
    concerns: str | None = Field(default=None, description="brief description of any health concerns, if any")
    needs_escalation: bool = Field(description="true if any severe concern or low score triggers coordinator follow-up")
    reply: str = Field(description="warm, supportive, language-matched reply to send to the patient")


# ── Agent definition ──────────────────────────────────────────────────────────

WELLNESS_AGENT_INSTRUCTION = """
You are a compassionate AI wellness assistant for a home care platform.

You may be called in two modes:

─── MODE 1: Single source (patient Telegram reply only) ───────────────────────
Analyse the patient's reply across four dimensions: mood, pain, eating, sleep.

─── MODE 2: Combined sources (patient reply + coordinator visit note) ──────────
Both the patient's own words AND a coordinator's clinical observations are available.
Analyse BOTH sources together across all four dimensions.
The coordinator's observations are objective clinical findings.
The patient's reply reflects their subjective experience.
Weigh both — if they conflict, trust the lower/more concerning signal and note the conflict in the concerns field.

─── Scoring guide for wellness_score (1-10) ───────────────────────────────────
- 9-10: All dimensions good, no concerns
- 7-8:  Generally okay, one minor issue
- 5-6:  Some concerns across multiple dimensions, monitor closely
- 3-4:  Multiple concerns or one serious concern, coordinator should check in
- 1-2:  Serious concerns across dimensions, immediate escalation needed

─── Dimension scoring ─────────────────────────────────────────────────────────
Each dimension should be scored from ALL available signals:
- mood:   infer from tone, energy level, emotional words, coordinator observations
- pain:   explicit mentions of pain, discomfort, grimacing, guarding (coordinator)
- eating: direct statements about food, coordinator observations about meals
- sleep:  direct statements, tiredness, fatigue levels reported or observed

─── Conflict resolution (MODE 2 only) ─────────────────────────────────────────
If the patient says "I'm fine" but the coordinator observed confusion, low BP,
or significant pain — score based on the worse of the two signals and note:
"Patient reported feeling okay but coordinator observed [X]."

─── Escalation rules ──────────────────────────────────────────────────────────
Set needs_escalation = true if:
- Pain is moderate or severe
- Mood is bad AND another dimension is also concerning
- Vitals are outside normal range (compare against patient baseline context; flag if BP is 15%+ higher/lower than their normal baseline, SpO2 < 95%, or temperature > 38C/100.4F)
- Any mention of chest pain, difficulty breathing, falling, confusion
- Wellness score is 4 or below
- Coordinator flagged clinical risk flags

─── Reply field ───────────────────────────────────────────────────────────────
Always write a warm, supportive reply as if speaking directly to the patient.
In MODE 2, the reply should acknowledge what the coordinator observed if relevant.
Support messages in English, Arabic, and Malayalam — match the patient's language.
"""

wellness_agent = Agent(
    name="wellness_agent",
    model="gemini-flash-latest",
    instruction=WELLNESS_AGENT_INSTRUCTION,
    output_schema=WellnessAgentResponse,
)


# ── Shared runner helper ──────────────────────────────────────────────────────

async def _run_wellness_agent(prompt: str, session_id: str) -> dict[str, Any]:
    """Runs the wellness agent using a direct Gemini client call with response schema."""
    from app.services.gemini_service import generate_content_with_retry

    # Standardize session creation to keep ADK session storage updated/initialized
    try:
        await session_service.create_session(
            app_name=APP_NAME,
            user_id="system",
            session_id=session_id,
        )
    except Exception:
        pass

    try:
        result = await generate_content_with_retry(
            prompt=prompt,
            system_instruction=WELLNESS_AGENT_INSTRUCTION,
            response_schema=WellnessAgentResponse,
            model="gemini-flash-latest",
        )
        return result
    except Exception as e:
        import logging
        logging.error(f"Error calling wellness agent directly: {e}")
        return {
            "mood":             "failed",
            "pain":             "failed",
            "eating":           "failed",
            "sleep":            "failed",
            "wellness_score":   None,
            "concerns":         f"Error calling wellness agent: {str(e)}",
            "needs_escalation": False,
            "reply": "Thank you, we received your update. Our care team will follow up shortly.",
        }


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


# ── Public async helpers ──────────────────────────────────────────────────────

async def interpret_wellness_reply(
    patient_name: str,
    message: str,
    patient_id: Any = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    MODE 1 — Interpret a single-source wellness reply (patient Telegram reply).
    """
    session_id = session_id or (f"wellness_{patient_id}" if patient_id else str(uuid.uuid4()))

    prompt = (
        f"Patient name: {patient_name}\n"
        f"Patient wellness reply: \"{message}\"\n\n"
        "Generate a structured wellness assessment matching the required schema."
    )

    return await _run_wellness_agent(prompt, session_id)


async def interpret_combined_wellness(
    patient_name: str,
    patient_reply: str | None,
    coordinator_observations: str,
    coordinator_vitals: str,
    coordinator_risk_flags: list[str],
    coordinator_visit_summary: str,
    coordinator_follow_up: str | None = None,
    patient_id: Any = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    MODE 2 — Interpret wellness from both patient reply AND coordinator visit note.
    """
    session_id = session_id or (f"wellness_{patient_id}" if patient_id else str(uuid.uuid4()))

    flags_str = ", ".join(coordinator_risk_flags) if coordinator_risk_flags else "None"

    has_patient_reply = patient_reply is not None

    if has_patient_reply:
        prompt = (
            f"Patient name: {patient_name}\n\n"
            f"You have TWO sources of wellness information for today. "
            f"Analyze both and produce a unified wellness assessment matching the required schema.\n\n"
            f"Patient's own Telegram check-in reply:\n\"{patient_reply}\"\n\n"
            f"Coordinator visit observations:\n"
            f"  Summary: {coordinator_visit_summary}\n"
            f"  Observations: {coordinator_observations}\n"
            f"  Vitals: {coordinator_vitals or 'Not recorded'}\n"
            f"  Risk flags: {flags_str}\n"
            f"  Follow-up: {coordinator_follow_up or 'None'}\n\n"
            "Weigh both sources. If they conflict, use the more concerning signal and note the conflict."
        )
    else:
        prompt = (
            f"Patient name: {patient_name}\n\n"
            f"No patient Telegram check-in reply is available today. "
            f"Analyze the coordinator's visit observations and generate the structured assessment.\n\n"
            f"Coordinator visit observations:\n"
            f"  Summary: {coordinator_visit_summary}\n"
            f"  Observations: {coordinator_observations}\n"
            f"  Vitals: {coordinator_vitals or 'Not recorded'}\n"
            f"  Risk flags: {flags_str}\n"
            f"  Follow-up: {coordinator_follow_up or 'None'}\n"
        )

    return await _run_wellness_agent(prompt, session_id)