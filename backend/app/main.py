"""
Care Platform — FastAPI application entry point.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine
from app.models import models
from app.routers import (
    patients, medications, alerts, webhooks,
    users, summaries, reminders, family,
    wellness, emergency, scheduling, copilot,
)

import os
from dotenv import load_dotenv

load_dotenv()

_api_key = os.getenv("GOOGLE_API_KEY")
if not _api_key:
    import warnings
    warnings.warn("GOOGLE_API_KEY is not set — ADK agents will fail.", RuntimeWarning)


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    # Self-healing SQL migration to add missing columns to patients table
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS timezone VARCHAR DEFAULT 'Asia/Kolkata';"))
            conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinical_conditions TEXT;"))
            conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS baseline_bp VARCHAR;"))
    except Exception as e:
        print(f"Migration error (could be fine if columns exist): {e}")

    from app.agents import (          # noqa: F401
        interpret_patient_reply,
        generate_family_summary,
        interpret_wellness_reply,
        assess_patient_risk,
        generate_daily_schedule,
        process_visit_note,
    )
    yield
    try:
        from app.services.notification_service import close_notification_client
        await close_notification_client()
    except Exception as e:
        print(f"Error closing notification client: {e}")


app = FastAPI(
    title="Care Platform API",
    description="AI Agentic Home Care Platform — powered by Google ADK",
    version="2.0.0",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patients.router)
app.include_router(medications.router)
app.include_router(alerts.router)
app.include_router(webhooks.router)
app.include_router(users.router)
app.include_router(summaries.router)
app.include_router(reminders.router)
app.include_router(family.router)
app.include_router(wellness.router)
app.include_router(emergency.router)
app.include_router(scheduling.router)
app.include_router(copilot.router)


@app.get("/")
def root():
    return {"status": "Care Platform API is running", "adk": True}

@app.get("/health")
def health():
    return {"status": "healthy"}