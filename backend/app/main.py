from fastapi import FastAPI
from app.database import engine
from app.models import models
from app.routers import patients, medications, alerts, webhooks, users, summaries, reminders

# Create all tables if they don't exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Care Platform API",
    description="AI Agentic Home Care Platform",
    version="0.1.0"
)

# Register routers
app.include_router(patients.router)
app.include_router(medications.router)
app.include_router(alerts.router)
app.include_router(webhooks.router)
app.include_router(users.router)
app.include_router(summaries.router)
app.include_router(reminders.router)

@app.get("/")
def root():
    return {"status": "Care Platform API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}