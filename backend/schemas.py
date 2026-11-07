
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# ---------------- USER SCHEMAS ----------------

class UserCreate(BaseModel):
    name: str
    username: str
    email: EmailStr
    password: str
    role: Optional[str] = "employee"


class AdminEmployeeCreate(BaseModel):
    name: str
    username: str
    email: EmailStr
    password: str


class AdminEmployeeUpdate(BaseModel):
    name: str
    username: str
    email: EmailStr


class UserResponse(BaseModel):
    id: int
    name: str
    username: str
    email: EmailStr
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------- TASK SCHEMAS ----------------

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"
    status: Optional[str] = "pending"
    due_date: Optional[datetime] = None
    assigned_to: int


class TaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    priority: str
    status: str
    due_date: Optional[datetime]

    # Employee and creator references can be NULL
    # after permanent employee deletion.
    assigned_to: Optional[int] = None
    created_by: Optional[int] = None

    created_at: datetime

    # Task completion and verification details
    verification_status: str
    completed_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    verified_by: Optional[int] = None
    rejection_reason: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------- AUTHENTICATION SCHEMAS ----------------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    name: str
    email: EmailStr
    role: str


# ---------------- TASK UPDATE SCHEMAS ----------------

class TaskStatusUpdate(BaseModel):
    status: str


# Employee submits completed work
class TaskCompletionRequest(BaseModel):
    status: str = "completed"


# Admin approves or rejects a completed task
class TaskVerificationRequest(BaseModel):
    action: str
    rejection_reason: Optional[str] = None


# ---------------- NOTIFICATION SCHEMAS ----------------

class NotificationResponse(BaseModel):
    id: int
    user_id: int
    task_id: Optional[int] = None
    message: str
    notification_type: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# Mark notification as read
class NotificationReadUpdate(BaseModel):
    is_read: bool = True


# ---------------- EMPLOYEE ARCHIVE SCHEMAS ----------------

class ArchiveEmployeeRequest(BaseModel):
    replacement_employee_id: Optional[int] = None


class PermanentDeleteEmployeeRequest(BaseModel):
    replacement_employee_id: Optional[int] = None
