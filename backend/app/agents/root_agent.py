"""
Root Orchestrator Agent — ADK multi-agent system.
All 6 specialist sub-agents.
"""

from google.adk import Agent
from .medication_agent import medication_agent
from .summary_agent import summary_agent
from .wellness_agent import wellness_agent
from .emergency_agent import emergency_agent
from .scheduling_agent import scheduling_agent
from .copilot_agent import copilot_agent

ROOT_INSTRUCTION = """
You are the central AI coordinator for a home care platform called Care Platform.

You manage a team of specialist AI agents. Route AUTOMATICALLY — never ask the user which agent to use.

Routing rules:
- Patient replied to MEDICATION reminder → medication_agent
- Generate FAMILY SUMMARY or daily report → summary_agent
- Patient replied to WELLNESS CHECK-IN → wellness_agent
- EMERGENCY assessment or risk scan → emergency_agent
- Generate VISIT SCHEDULE or who to visit today → scheduling_agent
- VISIT NOTE or coordinator documenting a patient visit → copilot_agent

Never ask the user to choose. Always route silently and return the result.
"""

root_agent = Agent(
    name="care_platform_orchestrator",
    model="gemini-2.5-flash-lite",
    instruction=ROOT_INSTRUCTION,
    sub_agents=[
        medication_agent,
        summary_agent,
        wellness_agent,
        emergency_agent,
        scheduling_agent,
        copilot_agent,
    ],
)