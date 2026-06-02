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

app.include_router(patients.router, prefix="/api")
app.include_router(medications.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(summaries.router, prefix="/api")
app.include_router(reminders.router, prefix="/api")
app.include_router(family.router, prefix="/api")
app.include_router(wellness.router, prefix="/api")
app.include_router(emergency.router, prefix="/api")
app.include_router(scheduling.router, prefix="/api")
app.include_router(copilot.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "healthy"}


# Mount static files for React frontend if built
if os.path.exists("dist"):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    # Serve assets folder
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

    # Serve index.html for root "/"
    @app.get("/")
    def index():
        return FileResponse("dist/index.html")

    # Catch-all router for any other unmatched routes (SPA client-side routing)
    @app.get("/{catchall:path}")
    def catchall_route(catchall: str):
        # If it's an API route that didn't match, or health, or assets, let it 404 naturally
        if catchall.startswith("api/") or catchall.startswith("assets/") or catchall == "health":
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not Found")
        # Otherwise, return index.html to let React Router handle it
        return FileResponse("dist/index.html")
else:
    @app.get("/")
    def root():
        return {"status": "Care Platform API is running", "adk": True}