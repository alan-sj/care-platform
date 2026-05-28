from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import FamilyContact
from app.schemas.schemas import FamilyContactCreate, FamilyContactResponse
from typing import List
import uuid

router = APIRouter(prefix="/family", tags=["Family"])


@router.post("/", response_model=FamilyContactResponse)
def create_family_contact(contact: FamilyContactCreate, db: Session = Depends(get_db)):
    db_contact = FamilyContact(**contact.model_dump())
    db.add(db_contact)
    db.commit()
    db.refresh(db_contact)
    return db_contact


@router.get("/{patient_id}", response_model=List[FamilyContactResponse])
def get_family_contacts(patient_id: uuid.UUID, db: Session = Depends(get_db)):
    return db.query(FamilyContact).filter(
        FamilyContact.patient_id == patient_id
    ).all()


@router.delete("/{contact_id}")
def delete_family_contact(contact_id: uuid.UUID, db: Session = Depends(get_db)):
    contact = db.query(FamilyContact).filter(FamilyContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"message": "Contact deleted"}