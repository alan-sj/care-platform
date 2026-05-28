from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Alert, AlertStatus
from app.schemas.schemas import AlertResponse
from typing import List
import uuid

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("/", response_model=List[AlertResponse])
def get_all_alerts(db: Session = Depends(get_db)):
    return db.query(Alert).order_by(Alert.created_at.desc()).all()


@router.get("/open", response_model=List[AlertResponse])
def get_open_alerts(db: Session = Depends(get_db)):
    return db.query(Alert).filter(
        Alert.status == AlertStatus.open
    ).order_by(Alert.created_at.desc()).all()


@router.patch("/{alert_id}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(alert_id: uuid.UUID, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = AlertStatus.acknowledged
    db.commit()
    db.refresh(alert)
    return alert


@router.patch("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(alert_id: uuid.UUID, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = AlertStatus.resolved
    db.commit()
    db.refresh(alert)
    return alert