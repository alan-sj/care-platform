from sqlalchemy import Column, String, Integer, BigInteger, Boolean, ARRAY, ForeignKey, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy import Enum as SAEnum
from app.database import Base
import uuid
import enum
from datetime import datetime


# ── Enums ────────────────────────────────────────────────────────────────────

class MedicationStatus(enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    missed = "missed"
    flagged = "flagged"

class AlertStatus(enum.Enum):
    open = "open"
    acknowledged = "acknowledged"
    resolved = "resolved"

class AlertType(enum.Enum):
    missed_medication = "missed_medication"
    no_response = "no_response"
    flagged = "flagged"

class AlertSeverity(enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"

class LanguageType(enum.Enum):
    en = "en"
    ar = "ar"
    ml = "ml"

class UserRole(enum.Enum):
    coordinator = "coordinator"
    doctor = "doctor"


# ── Models ───────────────────────────────────────────────────────────────────

# User defined FIRST because Patient references it
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    phone = Column(String)
    email = Column(String, unique=True)
    role = Column(SAEnum(UserRole), nullable=False)
    telegram_chat_id = Column(BigInteger, unique=True, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patients = relationship("Patient", back_populates="coordinator")


class Patient(Base):
    __tablename__ = "patients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    age = Column(Integer)
    language = Column(SAEnum(LanguageType), default=LanguageType.en)
    coordinator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    caregiver_id = Column(UUID(as_uuid=True), nullable=True)
    telegram_chat_id = Column(BigInteger, unique=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    coordinator = relationship("User", back_populates="patients")
    medications = relationship("Medication", back_populates="patient", cascade="all, delete")
    medication_logs = relationship("MedicationLog", back_populates="patient", cascade="all, delete")
    alerts = relationship("Alert", back_populates="patient", cascade="all, delete")
    family_contacts = relationship("FamilyContact", back_populates="patient", cascade="all, delete")


class Medication(Base):
    __tablename__ = "medications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"))
    name = Column(String, nullable=False)
    dosage = Column(String)
    frequency = Column(String)
    times = Column(ARRAY(String))
    active = Column(Boolean, default=True)

    patient = relationship("Patient", back_populates="medications")
    logs = relationship("MedicationLog", back_populates="medication", cascade="all, delete")


class MedicationLog(Base):
    __tablename__ = "medication_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"))
    medication_id = Column(UUID(as_uuid=True), ForeignKey("medications.id", ondelete="CASCADE"))
    scheduled_time = Column(DateTime)
    confirmed_at = Column(DateTime, nullable=True)
    status = Column(SAEnum(MedicationStatus), default=MedicationStatus.pending)
    patient_reply = Column(Text, nullable=True)
    ai_interpretation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="medication_logs")
    medication = relationship("Medication", back_populates="logs")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"))
    type = Column(SAEnum(AlertType))
    severity = Column(SAEnum(AlertSeverity))
    message = Column(Text)
    status = Column(SAEnum(AlertStatus), default=AlertStatus.open)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="alerts")


class FamilyContact(Base):
    __tablename__ = "family_contacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"))
    name = Column(String)
    phone = Column(String)
    relation = Column(String)
    telegram_chat_id = Column(BigInteger, nullable=True)

    patient = relationship("Patient", back_populates="family_contacts")