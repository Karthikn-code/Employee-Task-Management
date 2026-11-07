
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from database import Base


# --------------------------------------------------
# USER MODEL
# --------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(100), nullable=False)

    username = Column(
        String(50),
        unique=True,
        index=True,
        nullable=False
    )

    email = Column(
        String(150),
        unique=True,
        index=True,
        nullable=False
    )

    hashed_password = Column(String(255), nullable=False)

    role = Column(
        String(20),
        default="employee",
        nullable=False
    )

    is_active = Column(
        Boolean,
        default=True,
        nullable=False
    )

    # Soft deletion / archival
    is_deleted = Column(
        Boolean,
        default=False,
        nullable=False
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


# --------------------------------------------------
# TASK MODEL
# --------------------------------------------------

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String(200), nullable=False)

    description = Column(Text, nullable=True)

    priority = Column(
        String(20),
        default="medium",
        nullable=False
    )

    status = Column(
        String(20),
        default="pending",
        nullable=False
    )

    due_date = Column(
        DateTime(timezone=True),
        nullable=True
    )

    # Employee assigned to the task.
    # Nullable to preserve task history after employee deletion.
    assigned_to = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    # Admin who created the task.
    # Nullable to preserve task history after account deletion.
    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    # --------------------------------------------------
    # TASK COMPLETION AND VERIFICATION
    # --------------------------------------------------

    # Possible values:
    # not_submitted, pending, verified, rejected
    verification_status = Column(
        String(20),
        default="not_submitted",
        nullable=False
    )

    # Time when employee submits completed work.
    completed_at = Column(
        DateTime(timezone=True),
        nullable=True
    )

    # Time when admin verifies the task.
    verified_at = Column(
        DateTime(timezone=True),
        nullable=True
    )

    # Admin who verifies the task.
    verified_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    # Admin's reason when rejecting a task.
    rejection_reason = Column(
        Text,
        nullable=True
    )

    # --------------------------------------------------
    # RELATIONSHIPS
    # --------------------------------------------------

    # Assigned employee
    assignee = relationship(
        "User",
        foreign_keys=[assigned_to]
    )

    # Task creator
    creator = relationship(
        "User",
        foreign_keys=[created_by]
    )

    # Admin who verified the task
    verifier = relationship(
        "User",
        foreign_keys=[verified_by]
    )

    # Notifications related to this task
    notifications = relationship(
        "Notification",
        back_populates="task"
    )


# --------------------------------------------------
# NOTIFICATION MODEL
# --------------------------------------------------

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)

    # User who receives the notification.
    # This can be an admin or an employee.
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Related task.
    # Nullable so notifications can remain after task deletion.
    task_id = Column(
        Integer,
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Notification message.
    message = Column(
        Text,
        nullable=False
    )

    # Possible types:
    # task_completed, task_verified, task_rejected
    notification_type = Column(
        String(50),
        nullable=False
    )

    # Whether the notification has been viewed.
    is_read = Column(
        Boolean,
        default=False,
        nullable=False
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    # Relationships
    user = relationship("User")

    task = relationship(
        "Task",
        back_populates="notifications"
    )
