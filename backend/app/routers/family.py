from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import FamilyContact, Patient
from app.schemas.schemas import FamilyContactCreate, FamilyContactResponse, FamilyOnboardingLinkResponse
from typing import List
import uuid
import random
import string
import os
from dotenv import load_dotenv

load_dotenv()

BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME")

router = APIRouter(prefix="/family", tags=["Family"])


def generate_family_onboarding_code(db: Session) -> str:
    while True:
        suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        code = f"FAM-{suffix}"
        existing = db.query(FamilyContact).filter(FamilyContact.onboarding_code == code).first()
        if not existing:
            return code


@router.post("/", response_model=FamilyContactResponse)
def create_family_contact(contact: FamilyContactCreate, db: Session = Depends(get_db)):
    data = contact.model_dump()
    data.pop("telegram_chat_id", None)  # never accept chat_id manually
    db_contact = FamilyContact(**data)
    db_contact.onboarding_code = generate_family_onboarding_code(db)
    db.add(db_contact)
    db.commit()
    db.refresh(db_contact)
    return db_contact


@router.get("/{patient_id}", response_model=List[FamilyContactResponse])
def get_family_contacts(patient_id: uuid.UUID, db: Session = Depends(get_db)):
    return db.query(FamilyContact).filter(
        FamilyContact.patient_id == patient_id
    ).all()


@router.get("/contact/{contact_id}/onboarding-link", response_model=FamilyOnboardingLinkResponse)
def get_family_onboarding_link(contact_id: uuid.UUID, db: Session = Depends(get_db)):
    contact = db.query(FamilyContact).filter(FamilyContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    patient = db.query(Patient).filter(Patient.id == contact.patient_id).first()

    if not contact.onboarding_code:
        contact.onboarding_code = generate_family_onboarding_code(db)
        db.commit()
        db.refresh(contact)

    return FamilyOnboardingLinkResponse(
        contact_id=contact.id,
        contact_name=contact.name,
        patient_name=patient.name if patient else "Unknown",
        relation=contact.relation,
        onboarding_code=contact.onboarding_code,
        link=f"https://t.me/{BOT_USERNAME}?start={contact.onboarding_code}",
        linked=contact.telegram_chat_id is not None
    )


@router.delete("/{contact_id}")
def delete_family_contact(contact_id: uuid.UUID, db: Session = Depends(get_db)):
    contact = db.query(FamilyContact).filter(FamilyContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"message": "Contact deleted"}