"""
Patient Rescheduling Agent.
Interprets patient reschedule requests and extracts requested times/dates.
"""

from __future__ import annotations

import json
import uuid
from typing import Any
from pydantic import BaseModel, Field

from google.adk import Agent
from app.services.session_service import session_service
from app.services.gemini_service import generate_content_with_retry

class RescheduleInterpretation(BaseModel):
    is_reschedule_request: bool = Field(description="true if the patient wants to reschedule, change, postpone, or cancel today's scheduled visit")
    requested_time: str | None = Field(default=None, description="HH:MM formatted 24-hour time, e.g. '15:00', or null if not mentioned or unclear")
    requested_date: str | None = Field(default=None, description="YYYY-MM-DD formatted date, or 'tomorrow', or null if not mentioned or unclear")
    reason: str | None = Field(default=None, description="brief reason for rescheduling if any")
    reply: str = Field(description="polite, compassionate, language-matched reply to send to the patient")

RESCHEDULE_AGENT_INSTRUCTION = """
You are a helpful home care platform scheduling assistant.

Your task is to analyze the patient's message and determine if they want to reschedule, postpone, cancel, or change the time of their scheduled caregiver visit today.

If they do:
1. Set is_reschedule_request = true.
2. Extract the requested time in 24-hour HH:MM format (e.g., "3pm" -> "15:00", "10:30am" -> "10:30").
3. Extract the requested date in YYYY-MM-DD format (if they specify a date), or "tomorrow" (if they say tomorrow), or null if not mentioned.
4. Extract the reason (e.g., "doctor appointment", "sleeping").
5. Write a warm, supportive reply in the patient's language acknowledging their request.

If their message is NOT about rescheduling, change, or cancellation of their visit, set is_reschedule_request = false and write a polite default reply.

Match the language of the patient's input (English, Arabic, or Malayalam).
"""

reschedule_agent = Agent(
    name="reschedule_agent",
    model="gemini-flash-lite-latest",
    instruction=RESCHEDULE_AGENT_INSTRUCTION,
    output_schema=RescheduleInterpretation,
)

async def interpret_reschedule_request(
    patient_name: str,
    coordinator_name: str,
    visit_time: str,
    visit_date: str,
    message: str,
    patient_id: Any = None,
) -> dict[str, Any]:
    """
    Interpret patient rescheduling text.
    """
    session_id = f"reschedule_{patient_id}" if patient_id else str(uuid.uuid4())

    prompt = (
        f"Patient name: {patient_name}\n"
        f"Assigned coordinator: {coordinator_name}\n"
        f"Current scheduled visit: {visit_date} at {visit_time}\n\n"
        f"Patient message: \"{message}\"\n\n"
        "Analyze the message and return a structured reschedule assessment."
    )

    try:
        await session_service.create_session(
            app_name="reschedule_agent_app",
            user_id="system",
            session_id=session_id,
        )
    except Exception:
        pass

    try:
        result = await generate_content_with_retry(
            prompt=prompt,
            system_instruction=RESCHEDULE_AGENT_INSTRUCTION,
            response_schema=RescheduleInterpretation,
            model="gemini-flash-lite-latest",
        )
        return result
    except Exception as e:
        import logging
        logging.error(f"Error calling reschedule agent: {e}")
        return {
            "is_reschedule_request": False,
            "requested_time": None,
            "requested_date": None,
            "reason": None,
            "reply": "Thank you. We have received your message and will contact you shortly to coordinate your visit.",
        }
