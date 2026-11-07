
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

import models
import schemas

from database import get_db
from dependencies import get_current_user, get_admin_user
from websocket_manager import manager


router = APIRouter(
    prefix="/tasks",
    tags=["Task Management"]
)


# --------------------------------------------------
# HELPER: CREATE NOTIFICATION
# --------------------------------------------------

def create_notification(
    db: Session,
    user_id: int,
    task_id: int,
    message: str,
    notification_type: str
):
    notification = models.Notification(
        user_id=user_id,
        task_id=task_id,
        message=message,
        notification_type=notification_type
    )

    db.add(notification)


# --------------------------------------------------
# HELPER: GET ACTIVE ADMIN IDS
# --------------------------------------------------

def get_active_admin_ids(db: Session) -> list[int]:
    admins = (
        db.query(models.User)
        .filter(
            models.User.role == "admin",
            models.User.is_active == True,
            models.User.is_deleted == False
        )
        .all()
    )

    return [admin.id for admin in admins]


# --------------------------------------------------
# HELPER: SERIALIZE TASK
# --------------------------------------------------

def serialize_task(task: models.Task) -> dict:
    return jsonable_encoder(
        schemas.TaskResponse.model_validate(task)
    )


# --------------------------------------------------
# HELPER: SEND WEBSOCKET TASK EVENT
# --------------------------------------------------

async def send_task_event(
    user_ids: list[int],
    event_type: str,
    task_data: dict | None = None,
    task_id: int | None = None
):
    message = {
        "type": event_type,
        "task_id": task_id,
        "task": task_data
    }

    await manager.broadcast_to_users(
        user_ids=user_ids,
        message=message
    )


# --------------------------------------------------
# HELPER: SEND WEBSOCKET NOTIFICATION EVENT
# --------------------------------------------------

async def send_notification_event(user_ids: list[int]):
    await manager.broadcast_to_users(
        user_ids=user_ids,
        message={
            "type": "notification_updated"
        }
    )


# --------------------------------------------------
# CREATE TASK - ADMIN ONLY
# --------------------------------------------------

@router.post("/", response_model=schemas.TaskResponse)
def create_task(
    task: schemas.TaskCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_admin_user)
):
    employee = (
        db.query(models.User)
        .filter(
            models.User.id == task.assigned_to,
            models.User.role == "employee",
            models.User.is_active == True,
            models.User.is_deleted == False
        )
        .first()
    )

    if employee is None:
        raise HTTPException(
            status_code=404,
            detail="Active employee not found"
        )

    new_task = models.Task(
        title=task.title,
        description=task.description,
        priority=task.priority or "medium",
        status="pending",
        due_date=task.due_date,
        assigned_to=employee.id,
        created_by=current_admin.id,
        verification_status="not_submitted"
    )

    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    task_data = serialize_task(new_task)

    recipients = get_active_admin_ids(db)
    recipients.append(employee.id)

    background_tasks.add_task(
        send_task_event,
        recipients,
        "task_created",
        task_data,
        new_task.id
    )

    return new_task


# --------------------------------------------------
# GET MY TASKS - EMPLOYEE
# --------------------------------------------------

@router.get(
    "/my-tasks",
    response_model=list[schemas.TaskResponse]
)
def get_my_tasks(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    tasks = (
        db.query(models.Task)
        .filter(
            models.Task.assigned_to == current_user.id
        )
        .order_by(models.Task.created_at.desc())
        .all()
    )

    return tasks


# --------------------------------------------------
# UPDATE TASK STATUS / SUBMIT / RESUBMIT
# --------------------------------------------------

@router.patch(
    "/{task_id}/status",
    response_model=schemas.TaskResponse
)
def update_task_status(
    task_id: int,
    update: schemas.TaskStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        # ------------------------------------------
        # DEBUG AUTHENTICATED USER
        # ------------------------------------------

        print("\n========== TASK STATUS DEBUG ==========")
        print("Authenticated user ID:", current_user.id)
        print("Authenticated user name:", current_user.name)
        print("Authenticated user role:", repr(current_user.role))
        print("Authenticated user active:", current_user.is_active)
        print("Authenticated user deleted:", current_user.is_deleted)
        print("Requested task ID:", task_id)
        print("Requested status:", update.status)
        print("=======================================\n")

        # ------------------------------------------
        # VALIDATE STATUS
        # ------------------------------------------

        allowed_statuses = [
            "pending",
            "in_progress",
            "completed"
        ]

        if update.status not in allowed_statuses:
            raise HTTPException(
                status_code=400,
                detail="Invalid task status"
            )

        # ------------------------------------------
        # VALIDATE EMPLOYEE ROLE
        # ------------------------------------------

        user_role = (
            str(current_user.role).strip().lower()
            if current_user.role is not None
            else ""
        )

        if user_role != "employee":
            print("ROLE VALIDATION FAILED:", repr(user_role))

            raise HTTPException(
                status_code=403,
                detail="Only employees can update their task status"
            )

        # ------------------------------------------
        # VERIFY TASK OWNERSHIP
        # ------------------------------------------

        task = (
            db.query(models.Task)
            .filter(
                models.Task.id == task_id,
                models.Task.assigned_to == current_user.id
            )
            .first()
        )

        if task is None:
            raise HTTPException(
                status_code=404,
                detail="Task not found or access denied"
            )

        print("Task found:", task.id)
        print("Current verification status:", task.verification_status)

        # ------------------------------------------
        # PREVENT UPDATING VERIFIED TASKS
        # ------------------------------------------

        if task.verification_status == "verified":
            raise HTTPException(
                status_code=400,
                detail="This task has already been verified"
            )

        previous_verification_status = task.verification_status

        admin_ids = get_active_admin_ids(db)

        event_type = "task_updated"
        notifications_created = False

        # ------------------------------------------
        # EMPLOYEE COMPLETES OR RESUBMITS TASK
        # ------------------------------------------

        if update.status == "completed":

            if task.verification_status == "pending":
                raise HTTPException(
                    status_code=400,
                    detail="This task is already awaiting admin verification"
                )

            if previous_verification_status == "rejected":
                event_type = "task_resubmitted"
                print("Processing rejected task resubmission...")
            else:
                event_type = "task_submitted"
                print("Processing new task submission...")

            task.status = "completed"
            task.verification_status = "pending"

            task.completed_at = datetime.now(timezone.utc)
            task.verified_at = None
            task.verified_by = None
            task.rejection_reason = None

            # --------------------------------------
            # CREATE ADMIN NOTIFICATIONS
            # --------------------------------------

            admins = (
                db.query(models.User)
                .filter(
                    models.User.role == "admin",
                    models.User.is_active == True,
                    models.User.is_deleted == False
                )
                .all()
            )

            for admin in admins:
                create_notification(
                    db=db,
                    user_id=admin.id,
                    task_id=task.id,
                    message=(
                        f"{current_user.name} has completed the task "
                        f"'{task.title}'. Please verify the task."
                    ),
                    notification_type="task_completed"
                )

            notifications_created = bool(admins)

        # ------------------------------------------
        # NORMAL STATUS UPDATE
        # ------------------------------------------

        else:

            if task.verification_status == "pending":
                raise HTTPException(
                    status_code=400,
                    detail="Task is awaiting admin verification"
                )

            task.status = update.status

        # ------------------------------------------
        # SAVE DATABASE CHANGES
        # ------------------------------------------

        db.commit()
        db.refresh(task)

        print("Task updated successfully.")
        print("Updated task status:", task.status)
        print("Updated verification status:", task.verification_status)
        print("WebSocket event:", event_type)

        # ------------------------------------------
        # SERIALIZE TASK
        # ------------------------------------------

        task_data = serialize_task(task)

        recipients = admin_ids + [current_user.id]

        # ------------------------------------------
        # BROADCAST TASK EVENT
        # ------------------------------------------

        background_tasks.add_task(
            send_task_event,
            recipients,
            event_type,
            task_data,
            task.id
        )

        # ------------------------------------------
        # BROADCAST NOTIFICATION EVENT
        # ------------------------------------------

        if notifications_created:
            background_tasks.add_task(
                send_notification_event,
                admin_ids
            )

        print("Task event scheduled successfully.")
        print("=======================================\n")

        return task

    except HTTPException:
        db.rollback()
        raise

    except Exception as error:
        db.rollback()

        print("TASK STATUS UPDATE ERROR:", repr(error))

        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred while updating the task."
        )


# --------------------------------------------------
# ADMIN VERIFY OR REJECT TASK
# --------------------------------------------------

@router.patch(
    "/{task_id}/verify",
    response_model=schemas.TaskResponse
)
def verify_task(
    task_id: int,
    verification: schemas.TaskVerificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_admin_user)
):
    if verification.action not in ["approve", "reject"]:
        raise HTTPException(
            status_code=400,
            detail="Action must be approve or reject"
        )

    if (
        verification.action == "reject"
        and not (
            verification.rejection_reason
            and verification.rejection_reason.strip()
        )
    ):
        raise HTTPException(
            status_code=400,
            detail="Rejection reason is required"
        )

    task = (
        db.query(models.Task)
        .filter(models.Task.id == task_id)
        .first()
    )

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    if (
        task.status != "completed"
        or task.verification_status != "pending"
    ):
        raise HTTPException(
            status_code=400,
            detail="Task is not awaiting verification"
        )

    if verification.action == "approve":

        task.verification_status = "verified"
        task.verified_at = datetime.now(timezone.utc)
        task.verified_by = current_admin.id
        task.rejection_reason = None

        message = (
            f"Your task '{task.title}' has been verified "
            f"by admin {current_admin.name}."
        )

        notification_type = "task_verified"
        event_type = "task_verified"

    else:

        task.verification_status = "rejected"
        task.status = "in_progress"
        task.verified_at = None
        task.verified_by = current_admin.id
        task.rejection_reason = verification.rejection_reason.strip()

        message = (
            f"Your task '{task.title}' was rejected by "
            f"admin {current_admin.name}. "
            f"Reason: {task.rejection_reason}"
        )

        notification_type = "task_rejected"
        event_type = "task_rejected"

    # ------------------------------------------
    # NOTIFY ASSIGNED EMPLOYEE
    # ------------------------------------------

    if task.assigned_to is not None:
        create_notification(
            db=db,
            user_id=task.assigned_to,
            task_id=task.id,
            message=message,
            notification_type=notification_type
        )

    db.commit()
    db.refresh(task)

    task_data = serialize_task(task)

    admin_ids = get_active_admin_ids(db)
    recipients = admin_ids.copy()

    if task.assigned_to is not None:
        recipients.append(task.assigned_to)

    background_tasks.add_task(
        send_task_event,
        recipients,
        event_type,
        task_data,
        task.id
    )

    if task.assigned_to is not None:
        background_tasks.add_task(
            send_notification_event,
            [task.assigned_to]
        )

    return task


# --------------------------------------------------
# GET NOTIFICATIONS - CURRENT USER
# --------------------------------------------------

@router.get(
    "/notifications",
    response_model=list[schemas.NotificationResponse]
)
def get_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    notifications = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == current_user.id
        )
        .order_by(
            models.Notification.created_at.desc()
        )
        .all()
    )

    return notifications


# --------------------------------------------------
# MARK NOTIFICATION AS READ
# --------------------------------------------------

@router.patch(
    "/notifications/{notification_id}/read",
    response_model=schemas.NotificationResponse
)
def mark_notification_read(
    notification_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    notification = (
        db.query(models.Notification)
        .filter(
            models.Notification.id == notification_id,
            models.Notification.user_id == current_user.id
        )
        .first()
    )

    if notification is None:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    notification.is_read = True

    db.commit()
    db.refresh(notification)

    background_tasks.add_task(
        send_notification_event,
        [current_user.id]
    )

    return notification


# --------------------------------------------------
# GET ALL TASKS - ADMIN ONLY
# --------------------------------------------------

@router.get(
    "/",
    response_model=list[schemas.TaskResponse]
)
def get_all_tasks(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_admin_user)
):
    tasks = (
        db.query(models.Task)
        .order_by(models.Task.created_at.desc())
        .all()
    )

    return tasks


# --------------------------------------------------
# FILTER TASKS - ADMIN ONLY
# --------------------------------------------------

@router.get(
    "/filter",
    response_model=list[schemas.TaskResponse]
)
def filter_tasks(
    status: str = None,
    priority: str = None,
    assigned_to: int = None,
    title: str = None,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_admin_user)
):
    query = db.query(models.Task)

    if status:
        query = query.filter(
            models.Task.status == status
        )

    if priority:
        query = query.filter(
            models.Task.priority == priority
        )

    if assigned_to is not None:
        query = query.filter(
            models.Task.assigned_to == assigned_to
        )

    if title:
        query = query.filter(
            models.Task.title.ilike(f"%{title}%")
        )

    return query.order_by(
        models.Task.created_at.desc()
    ).all()


# --------------------------------------------------
# DELETE TASK - ADMIN ONLY
# --------------------------------------------------

@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_admin_user)
):
    task = (
        db.query(models.Task)
        .filter(models.Task.id == task_id)
        .first()
    )

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    if task.verification_status != "verified":
        raise HTTPException(
            status_code=400,
            detail="Only verified tasks can be deleted"
        )

    assigned_employee_id = task.assigned_to

    db.delete(task)
    db.commit()

    recipients = get_active_admin_ids(db)

    if assigned_employee_id is not None:
        recipients.append(assigned_employee_id)

    background_tasks.add_task(
        send_task_event,
        recipients,
        "task_deleted",
        None,
        task_id
    )

    return {
        "message": "Verified task deleted successfully",
        "task_id": task_id
    }
