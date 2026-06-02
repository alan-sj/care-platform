import sys
sys.path.append("/home/alan/Documents/ADK_care-platform/care-platform/backend")

from dotenv import load_dotenv
load_dotenv("/home/alan/Documents/ADK_care-platform/care-platform/backend/.env")

from app.database import SessionLocal
from app.routers.wellness import WellnessLog
import uuid

db = SessionLocal()
try:
    patient_id = uuid.UUID("f2b9ec32-1aa4-4f5e-b143-ebec52586777")
    deleted = db.query(WellnessLog).filter(WellnessLog.patient_id == patient_id).delete()
    db.commit()
    print(f"Cleared {deleted} wellness logs for Alan Saji. You can now trigger send-checkins again!")
finally:
    db.close()
