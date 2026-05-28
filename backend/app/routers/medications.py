from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Medication, MedicationLog
from app.schemas.schemas import MedicationCreate, MedicationResponse, MedicationLogResponse
from typing import List
from datetime import datetime, date
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


@router.get("/logs/{patient_id}", response_model=List[MedicationLogResponse])
def get_patient_logs(patient_id: uuid.UUID, db: Session = Depends(get_db)):
    today = date.today()
    return db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.created_at >= datetime.combine(today, datetime.min.time()),
        MedicationLog.created_at <= datetime.combine(today, datetime.max.time())
    ).order_by(MedicationLog.created_at.desc()).all()


@router.delete("/{medication_id}")
def delete_medication(medication_id: uuid.UUID, db: Session = Depends(get_db)):
    med = db.query(Medication).filter(Medication.id == medication_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    db.delete(med)
    db.commit()
    return {"message": "Medication deleted"}