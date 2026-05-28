from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Patient
from app.schemas.schemas import PatientCreate, PatientResponse, OnboardingLinkResponse
from typing import List
import uuid
import random
import string
import os
from dotenv import load_dotenv

load_dotenv()

BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME")

router = APIRouter(prefix="/patients", tags=["Patients"])


def generate_onboarding_code(db: Session) -> str:
    """Generate a unique CARE-XXXX onboarding code."""
    while True:
        suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        code = f"CARE-{suffix}"
        existing = db.query(Patient).filter(Patient.onboarding_code == code).first()
        if not existing:
            return code


@router.post("/", response_model=PatientResponse)
def create_patient(patient: PatientCreate, db: Session = Depends(get_db)):
    data = patient.model_dump()
    db_patient = Patient(**data)
    db_patient.onboarding_code = generate_onboarding_code(db)
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient


@router.get("/", response_model=List[PatientResponse])
def get_all_patients(db: Session = Depends(get_db)):
    return db.query(Patient).all()


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(patient_id: uuid.UUID, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.get("/{patient_id}/onboarding-link", response_model=OnboardingLinkResponse)
def get_onboarding_link(patient_id: uuid.UUID, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Regenerate code if missing (for older records)
    if not patient.onboarding_code:
        patient.onboarding_code = generate_onboarding_code(db)
        db.commit()
        db.refresh(patient)

    return OnboardingLinkResponse(
        patient_id=patient.id,
        patient_name=patient.name,
        onboarding_code=patient.onboarding_code,
        link=f"https://t.me/{BOT_USERNAME}?start={patient.onboarding_code}",
        linked=patient.telegram_chat_id is not None
    )


@router.delete("/{patient_id}")
def delete_patient(patient_id: uuid.UUID, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.delete(patient)
    db.commit()
    return {"message": "Patient deleted"}