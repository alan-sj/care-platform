"""
agent.py — ADK entry point.

This file lives at backend/app/agents/agent.py so you can do:

    adk web backend/app/agents
    adk run backend/app/agents

ADK discovers the `root_agent` symbol automatically.

The root_agent orchestrates medication_agent and summary_agent as sub-agents.
"""

from .root_agent import root_agent  # noqa: F401 — ADK discovers this symbol