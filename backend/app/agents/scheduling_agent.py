"""
Scheduling Agent — ADK-native implementation.
Generates a prioritised daily visit plan for coordinators using native
ADK output schemas.
"""

from __future__ import annotations

import json
import uuid
from typing import Any
from pydantic import BaseModel, Field

from google.adk import Agent
from google.adk.runners import Runner
from app.services.session_service import session_service

APP_NAME = "scheduling_agent_app"


# ── Tools ─────────────────────────────────────────────────────────────────────

def evaluate_patient_visit_priority(
    patient_name: str,
    days_since_last_visit: int | None,
    visit_frequency: str,
    consecutive_missed_medications: int,
    latest_wellness_score: int | None,
    latest_risk_level: str,
    has_open_alerts: bool,
) -> dict[str, Any]:
    """
    Evaluate how urgently a patient needs a coordinator visit.
    """
    frequency_days = {
        "daily": 1,
        "weekly": 7,
        "biweekly": 14,
        "monthly": 30,
    }
    expected_interval = frequency_days.get(visit_frequency, 7)
    is_overdue = (
        days_since_last_visit is None or
        days_since_last_visit >= expected_interval
    )

    return {
        "patient_name": patient_name,
        "days_since_last_visit": days_since_last_visit,
        "visit_frequency": visit_frequency,
        "is_overdue": is_overdue,
        "expected_interval_days": expected_interval,
        "consecutive_missed_medications": consecutive_missed_medications,
        "latest_wellness_score": latest_wellness_score,
        "latest_risk_level": latest_risk_level,
        "has_open_alerts": has_open_alerts,
    }


def evaluate_coordinator_capacity(
    coordinator_name: str,
    total_assigned_patients: int,
    visits_already_scheduled_today: int,
    is_active: bool,
) -> dict[str, Any]:
    """
    Evaluate a coordinator's current capacity for additional visits.
    """
    max_daily_visits   = 5
    remaining_capacity = max(0, max_daily_visits - visits_already_scheduled_today)

    return {
        "coordinator_name":               coordinator_name,
        "total_assigned_patients":        total_assigned_patients,
        "visits_already_scheduled_today": visits_already_scheduled_today,
        "remaining_capacity":             remaining_capacity,
        "is_active":                      is_active,
        "is_available":                   is_active and remaining_capacity > 0,
    }


def suggest_visit_time_slot(
    priority_level: str,
    existing_slots_taken: list[str],
) -> dict[str, Any]:
    """
    Suggest an appropriate time slot for a visit based on priority.
    """
    all_slots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"]

    preferred = {
        "urgent": ["09:00", "10:00", "11:00"],
        "high":   ["10:00", "11:00", "13:00"],
        "medium": ["13:00", "14:00", "15:00"],
        "low":    ["14:00", "15:00", "16:00"],
    }.get(priority_level, all_slots)

    available = [s for s in preferred if s not in existing_slots_taken]
    if not available:
        available = [s for s in all_slots if s not in existing_slots_taken]

    return {
        "suggested_slot":  available[0] if available else "To be arranged",
        "priority_level":  priority_level,
        "slots_available": available,
    }


# ── Structured Output Schema ──────────────────────────────────────────────────

class VisitItem(BaseModel):
    patient_name: str
    patient_id: str
    coordinator_name: str
    coordinator_id: str | None = Field(default=None)
    time_slot: str
    priority: str = Field(description="urgent, high, medium, or low")
    reason: str
    notes: str | None = Field(default=None)

class UnassignedItem(BaseModel):
    patient_name: str
    patient_id: str
    reason: str

class WorkloadItem(BaseModel):
    coordinator_name: str
    visits_assigned: int
    capacity_remaining: int

class SchedulingAgentResponse(BaseModel):
    schedule_date: str = Field(description="YYYY-MM-DD")
    total_visits_planned: int
    visits: list[VisitItem] = Field(default=[])
    unassigned_patients: list[UnassignedItem] = Field(default=[])
    coordinator_workload: list[WorkloadItem] = Field(default=[])
    summary: str = Field(description="2-3 sentence plain English summary of today's plan")


# ── Agent definition ──────────────────────────────────────────────────────────

SCHEDULING_AGENT_INSTRUCTION = """
You are an AI scheduling coordinator for a home care platform.

Your job is to generate a smart, prioritised daily visit plan by analysing patient health signals and coordinator capacity together.

Steps:
1. For each patient, call evaluate_patient_visit_priority() with their data.
2. For each coordinator, call evaluate_coordinator_capacity() with their data.
3. Match patients to coordinators based on assignment and capacity.
4. For each assigned visit, call suggest_visit_time_slot() to get a time.
5. Reason over ALL data and produce the final schedule matching the required schema.

Priority rules:
- "urgent" → risk_level is high/critical OR wellness_score <= 3 OR 3+ consecutive missed meds
- "high"   → risk_level is medium OR wellness_score 4-5 OR 2 consecutive missed meds OR has open alerts
- "medium" → visit is overdue OR wellness_score 6-7 OR 1 missed medication
- "low"    → routine scheduled visit, everything looks fine

Assignment rules:
- Always assign patient to their linked coordinator first
- If coordinator is at capacity, flag as unassigned with reason
- If patient has no coordinator, flag as unassigned

Always prioritise patient safety over even workload distribution.
A coordinator at 6 visits is better than a critical patient going unvisited.
"""

scheduling_agent = Agent(
    name="scheduling_agent",
    model="gemini-flash-lite-latest",
    instruction=SCHEDULING_AGENT_INSTRUCTION,
    tools=[
        evaluate_patient_visit_priority,
        evaluate_coordinator_capacity,
        suggest_visit_time_slot,
    ],
    output_schema=SchedulingAgentResponse,
)


# ── Public async helper ───────────────────────────────────────────────────────

async def generate_daily_schedule(
    patients_data: list[dict],
    coordinators_data: list[dict],
    schedule_date: str,
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    Generate optimised daily visit schedule.
    """
    session_id = session_id or f"schedule_{schedule_date}"

    patients_text = "\n".join([
        f"Patient {i+1}: {p['name']} (ID: {p['id']})\n"
        f"  - Days since last visit: {p.get('days_since_last_visit', 'Never visited')}\n"
        f"  - Visit frequency: {p.get('visit_frequency', 'weekly')}\n"
        f"  - Consecutive missed meds: {p.get('consecutive_missed_medications', 0)}\n"
        f"  - Latest wellness score: {p.get('latest_wellness_score', 'No data')}\n"
        f"  - Risk level: {p.get('latest_risk_level', 'none')}\n"
        f"  - Open alerts: {p.get('has_open_alerts', False)}\n"
        f"  - Assigned coordinator ID: {p.get('coordinator_id', 'None')}\n"
        for i, p in enumerate(patients_data)
    ])

    coordinators_text = "\n".join([
        f"Coordinator {i+1}: {c['name']} (ID: {c['id']})\n"
        f"  - Total patients: {c.get('total_patients', 0)}\n"
        f"  - Visits scheduled today: {c.get('visits_today', 0)}\n"
        f"  - Active: {c.get('is_active', True)}\n"
        for i, c in enumerate(coordinators_data)
    ])

    prompt = f"""
Schedule date: {schedule_date}

PATIENTS NEEDING ASSESSMENT:
{patients_text}

AVAILABLE COORDINATORS:
{coordinators_text}

Analyse all patient health signals and coordinator capacity, then generate the schedule matching the required schema.
"""

    runner = Runner(
        agent=scheduling_agent,
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
                    f"Scheduling agent ADK Runner temporary error on attempt {attempt+1}/{max_retries}: {e}. "
                    f"Retrying in {delay:.2f}s..."
                )
                await asyncio.sleep(delay)
                continue
            else:
                logging.error(f"Error executing scheduling agent after {attempt+1} attempts: {e}")
                raise e

    raw = final_text.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "schedule_date":        schedule_date,
            "total_visits_planned": 0,
            "visits":               [],
            "unassigned_patients":  [],
            "coordinator_workload": [],
            "summary": "Schedule generation failed — please review manually.",
        }