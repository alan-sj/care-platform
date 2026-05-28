from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
from app.models import models
from app.routers import patients, medications, alerts, webhooks, users, summaries, reminders, family
import os

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Care Platform API",
    description="AI Agentic Home Care Platform",
    version="0.1.0"
)

# CORS — allow React dashboard
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


@app.get("/")
def root():
    return {"status": "Care Platform API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}