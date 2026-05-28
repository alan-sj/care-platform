from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from app.models.models import (
    MedicationStatus, AlertStatus,
    AlertType, AlertSeverity, LanguageType, UserRole
)


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    role: UserRole
    telegram_chat_id: Optional[int] = None

class UserResponse(BaseModel):
    id: UUID
    name: str
    phone: Optional[str]
    email: Optional[str]
    role: UserRole
    telegram_chat_id: Optional[int]
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Patient ───────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    name: str
    phone: str
    age: Optional[int] = None
    language: LanguageType = LanguageType.en
    coordinator_id: Optional[UUID] = None
    caregiver_id: Optional[UUID] = None
    telegram_chat_id: Optional[int] = None

class PatientResponse(BaseModel):
    id: UUID
    name: str
    phone: str
    age: Optional[int]
    language: LanguageType
    telegram_chat_id: Optional[int]
    onboarding_code: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class OnboardingLinkResponse(BaseModel):
    patient_id: UUID
    patient_name: str
    onboarding_code: str
    link: str
    linked: bool


# ── Medication ────────────────────────────────────────────────────────────────

class MedicationCreate(BaseModel):
    patient_id: UUID
    name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    times: Optional[List[str]] = None
    active: bool = True

class MedicationResponse(BaseModel):
    id: UUID
    patient_id: UUID
    name: str
    dosage: Optional[str]
    frequency: Optional[str]
    times: Optional[List[str]]
    active: bool

    class Config:
        from_attributes = True


# ── Medication Log ────────────────────────────────────────────────────────────

class MedicationLogResponse(BaseModel):
    id: UUID
    patient_id: UUID
    medication_id: UUID
    scheduled_time: Optional[datetime]
    confirmed_at: Optional[datetime]
    status: MedicationStatus
    patient_reply: Optional[str]
    ai_interpretation: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Alert ─────────────────────────────────────────────────────────────────────

class AlertResponse(BaseModel):
    id: UUID
    patient_id: UUID
    type: AlertType
    severity: AlertSeverity
    message: Optional[str]
    status: AlertStatus
    created_at: datetime

    class Config:
        from_attributes = True


# ── Family Contact ────────────────────────────────────────────────────────────

class FamilyContactCreate(BaseModel):
    patient_id: UUID
    name: str
    phone: str
    relation: Optional[str] = None
    telegram_chat_id: Optional[int] = None

class FamilyContactResponse(BaseModel):
    id: UUID
    patient_id: UUID
    name: str
    phone: str
    relation: Optional[str]
    telegram_chat_id: Optional[int]
    onboarding_code: Optional[str]

    class Config:
        from_attributes = True


class FamilyOnboardingLinkResponse(BaseModel):
    contact_id: UUID
    contact_name: str
    patient_name: str
    relation: Optional[str]
    onboarding_code: str
    link: str
    linked: bool


# ── Webhook ───────────────────────────────────────────────────────────────────

class TwilioWebhookPayload(BaseModel):
    From: str
    Body: str
    To: Optional[str] = None
    MessageSid: Optional[str] = None