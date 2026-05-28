from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Medication
from app.schemas.schemas import MedicationCreate, MedicationResponse
from typing import List
import uuid

router = APIRouter(prefix="/medications", tags=["Medications"])


@router.post("/", response_model=MedicationResponse)
def create_medication(medication: MedicationCreate, db: Session = Depends(get_db)):
    db_med = Medication(**medication.model_dump())
    db.add(db_med)
    db.commit()
    db.refresh(db_med)
    return db_med


@router.get("/patient/{patient_id}", response_model=List[MedicationResponse])
def get_patient_medications(patient_id: uuid.UUID, db: Session = Depends(get_db)):
    return db.query(Medication).filter(
        Medication.patient_id == patient_id,
        Medication.active == True
    ).all()


@router.delete("/{medication_id}")
def delete_medication(medication_id: uuid.UUID, db: Session = Depends(get_db)):
    med = db.query(Medication).filter(Medication.id == medication_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    db.delete(med)
    db.commit()
    return {"message": "Medication deleted"}