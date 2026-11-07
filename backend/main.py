
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

import models
from models import User
from database import engine, Base, get_db
from dependencies import get_admin_user, get_current_user
from security import create_access_token, verify_access_token
from auth import verify_password, hash_password
from websocket_manager import manager

from schemas import (
    UserCreate,
    UserResponse,
    TokenResponse,
    AdminEmployeeCreate,
    AdminEmployeeUpdate,
    ArchiveEmployeeRequest,
    PermanentDeleteEmployeeRequest,
)

from routers.tasks import router as tasks_router


# --------------------------------------------------
# DATABASE INITIALIZATION
# --------------------------------------------------

Base.metadata.create_all(bind=engine)


# --------------------------------------------------
# FASTAPI APPLICATION
# --------------------------------------------------

app = FastAPI(
    title="Employee Task Manager API",
    description="Backend API for managing employees and their tasks",
    version="1.0.0"
)


# --------------------------------------------------
# CORS CONFIGURATION
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://100.64.0.158:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# INCLUDE ROUTERS
# --------------------------------------------------

app.include_router(tasks_router)


# --------------------------------------------------
# ROOT AND HEALTH CHECK
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "message": "Welcome to Employee Task Manager API",
        "status": "Backend is running"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy"
    }


# --------------------------------------------------
# WEBSOCKET CONNECTION
# --------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):

    # Get JWT token from WebSocket query parameters.
    token = websocket.query_params.get("token")

    if not token:
        await websocket.close(code=1008)
        return

    # Validate JWT token.
    payload = verify_access_token(token)

    if payload is None:
        await websocket.close(code=1008)
        return

    # Extract user ID.
    user_id = payload.get("sub")

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        await websocket.close(code=1008)
        return

    # Verify that the user exists and is active.
    db = next(get_db())

    try:
        user = db.query(User).filter(
            User.id == user_id,
            User.is_active == True,
            User.is_deleted == False
        ).first()

        if user is None:
            await websocket.close(code=1008)
            return

    finally:
        db.close()

    # Register the authenticated connection.
    await manager.connect(user_id, websocket)

    try:
        while True:
            # Keep the WebSocket connection alive.
            await websocket.receive_text()

    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)

    except Exception:
        manager.disconnect(user_id, websocket)


# --------------------------------------------------
# USER REGISTRATION
# --------------------------------------------------

@app.post(
    "/register",
    response_model=UserResponse,
    status_code=201
)
def register_user(
    user: UserCreate,
    db: Session = Depends(get_db)
):
    if user.role != "employee":
        raise HTTPException(
            status_code=403,
            detail="Public registration is only available for employees"
        )

    existing_username = db.query(User).filter(
        User.username == user.username
    ).first()

    if existing_username:
        raise HTTPException(
            status_code=400,
            detail="Username is already taken"
        )

    existing_email = db.query(User).filter(
        User.email == user.email
    ).first()

    if existing_email:
        raise HTTPException(
            status_code=400,
            detail="Email is already registered"
        )

    new_user = User(
        name=user.name,
        username=user.username,
        email=user.email,
        hashed_password=hash_password(user.password),
        role="employee",
        is_active=True,
        is_deleted=False
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        return new_user

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to register user"
        )


# --------------------------------------------------
# USER LOGIN
# --------------------------------------------------

@app.post("/login", response_model=TokenResponse)
def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    # Login currently accepts email.
    existing_user = db.query(User).filter(
        User.email == form_data.username
    ).first()

    if not existing_user or not verify_password(
        form_data.password,
        existing_user.hashed_password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not existing_user.is_active or existing_user.is_deleted:
        raise HTTPException(
            status_code=403,
            detail="Account is inactive or archived"
        )

    access_token = create_access_token({
        "sub": str(existing_user.id),
        "role": existing_user.role
    })

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": existing_user.id,
        "name": existing_user.name,
        "email": existing_user.email,
        "role": existing_user.role
    }


# --------------------------------------------------
# CURRENT USER PROFILE
# --------------------------------------------------

@app.get("/me", response_model=UserResponse)
def get_my_profile(
    current_user: User = Depends(get_current_user)
):
    return current_user


# --------------------------------------------------
# ADMIN DASHBOARD
# --------------------------------------------------

@app.get("/admin/dashboard", response_model=UserResponse)
def admin_dashboard(
    current_user: User = Depends(get_admin_user)
):
    return current_user


# --------------------------------------------------
# GET ALL NON-ARCHIVED EMPLOYEES
# --------------------------------------------------

@app.get("/employees/", response_model=list[UserResponse])
def get_all_employees(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user)
):
    employees = db.query(User).filter(
        User.role == "employee",
        User.is_deleted == False
    ).order_by(
        User.id.desc()
    ).all()

    return employees


# --------------------------------------------------
# GET ALL ARCHIVED EMPLOYEES
# --------------------------------------------------

@app.get(
    "/admin/employees/archived",
    response_model=list[UserResponse]
)
def get_archived_employees(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user)
):
    employees = db.query(User).filter(
        User.role == "employee",
        User.is_deleted == True
    ).order_by(
        User.id.desc()
    ).all()

    return employees


# --------------------------------------------------
# ADD NEW EMPLOYEE
# --------------------------------------------------

@app.post(
    "/admin/employees/",
    response_model=UserResponse,
    status_code=201
)
def create_employee(
    employee: AdminEmployeeCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user)
):
    existing_username = db.query(User).filter(
        User.username == employee.username
    ).first()

    if existing_username:
        raise HTTPException(
            status_code=400,
            detail="Username is already taken"
        )

    existing_email = db.query(User).filter(
        User.email == employee.email
    ).first()

    if existing_email:
        raise HTTPException(
            status_code=400,
            detail="Email is already registered"
        )

    new_employee = User(
        name=employee.name,
        username=employee.username,
        email=employee.email,
        hashed_password=hash_password(employee.password),
        role="employee",
        is_active=True,
        is_deleted=False
    )

    try:
        db.add(new_employee)
        db.commit()
        db.refresh(new_employee)

        return new_employee

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to create employee account"
        )


# --------------------------------------------------
# EDIT EMPLOYEE
# --------------------------------------------------

@app.put(
    "/admin/employees/{employee_id}",
    response_model=UserResponse
)
def update_employee(
    employee_id: int,
    employee_data: AdminEmployeeUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user)
):
    employee = db.query(User).filter(
        User.id == employee_id,
        User.role == "employee",
        User.is_deleted == False
    ).first()

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Employee not found"
        )

    existing_username = db.query(User).filter(
        User.username == employee_data.username,
        User.id != employee_id
    ).first()

    if existing_username:
        raise HTTPException(
            status_code=400,
            detail="Username is already taken"
        )

    existing_email = db.query(User).filter(
        User.email == employee_data.email,
        User.id != employee_id
    ).first()

    if existing_email:
        raise HTTPException(
            status_code=400,
            detail="Email is already registered"
        )

    employee.name = employee_data.name
    employee.username = employee_data.username
    employee.email = employee_data.email

    try:
        db.commit()
        db.refresh(employee)

        return employee

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to update employee information"
        )


# --------------------------------------------------
# ACTIVATE / DEACTIVATE EMPLOYEE
# --------------------------------------------------

@app.patch(
    "/admin/employees/{employee_id}/status",
    response_model=UserResponse
)
def update_employee_status(
    employee_id: int,
    is_active: bool,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user)
):
    employee = db.query(User).filter(
        User.id == employee_id,
        User.role == "employee",
        User.is_deleted == False
    ).first()

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Employee not found"
        )

    employee.is_active = is_active

    try:
        db.commit()
        db.refresh(employee)

        return employee

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to update employee account status"
        )


# --------------------------------------------------
# RESTORE ARCHIVED EMPLOYEE
# --------------------------------------------------

@app.patch(
    "/admin/employees/{employee_id}/restore",
    response_model=UserResponse
)
def restore_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user)
):
    employee = db.query(User).filter(
        User.id == employee_id,
        User.role == "employee",
        User.is_deleted == True
    ).first()

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Archived employee not found"
        )

    try:
        employee.is_deleted = False

        # Restored employees remain inactive.
        # Admin must activate them separately.
        employee.is_active = False

        db.commit()
        db.refresh(employee)

        return employee

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to restore employee"
        )


# --------------------------------------------------
# ARCHIVE EMPLOYEE
# --------------------------------------------------

@app.delete("/admin/employees/{employee_id}")
def archive_employee(
    employee_id: int,
    archive_data: ArchiveEmployeeRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user)
):
    # Find employee.
    employee = db.query(User).filter(
        User.id == employee_id,
        User.role == "employee",
        User.is_deleted == False
    ).first()

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Employee not found or already archived"
        )

    # Find all tasks not yet completed.
    unfinished_tasks = db.query(models.Task).filter(
        models.Task.assigned_to == employee_id,
        models.Task.status != "completed"
    ).all()

    replacement_id = archive_data.replacement_employee_id

    # If unfinished tasks exist, reassignment is required.
    if unfinished_tasks and replacement_id is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"This employee has {len(unfinished_tasks)} unfinished tasks. "
                "Please select another active employee for reassignment."
            )
        )

    # Validate replacement employee.
    replacement_employee = None

    if replacement_id is not None:

        if replacement_id == employee_id:
            raise HTTPException(
                status_code=400,
                detail="An employee cannot be reassigned to themselves"
            )

        replacement_employee = db.query(User).filter(
            User.id == replacement_id,
            User.role == "employee",
            User.is_active == True,
            User.is_deleted == False
        ).first()

        if not replacement_employee:
            raise HTTPException(
                status_code=404,
                detail="Replacement employee not found or inactive"
            )

    # Reassign unfinished tasks.
    reassigned_count = 0

    try:
        if unfinished_tasks:
            for task in unfinished_tasks:
                task.assigned_to = replacement_employee.id

            reassigned_count = len(unfinished_tasks)

        # Archive rather than physically deleting the employee.
        employee.is_active = False
        employee.is_deleted = True

        db.commit()

        return {
            "message": "Employee archived successfully",
            "employee_id": employee_id,
            "employee_name": employee.name,
            "reassigned_tasks": reassigned_count,
            "replacement_employee_id": (
                replacement_employee.id
                if replacement_employee
                else None
            ),
            "completed_tasks_preserved": True,
            "account_status": "archived"
        }

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to archive employee. No changes were saved."
        )


# --------------------------------------------------
# PERMANENTLY DELETE EMPLOYEE
# --------------------------------------------------

@app.delete(
    "/admin/employees/{employee_id}/permanent"
)
def permanently_delete_employee(
    employee_id: int,
    delete_data: PermanentDeleteEmployeeRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user)
):
    # Find employee, whether active or archived.
    # Admin accounts cannot be permanently deleted here.
    employee = db.query(User).filter(
        User.id == employee_id,
        User.role == "employee"
    ).first()

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Employee not found"
        )

    employee_name = employee.name

    # Find unfinished tasks assigned to this employee.
    unfinished_tasks = db.query(models.Task).filter(
        models.Task.assigned_to == employee_id,
        models.Task.status != "completed"
    ).all()

    replacement_id = delete_data.replacement_employee_id
    replacement_employee = None

    # Reassignment is mandatory when unfinished tasks exist.
    if unfinished_tasks and replacement_id is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"This employee has {len(unfinished_tasks)} unfinished tasks. "
                "Select another active employee before permanent deletion."
            )
        )

    # Validate replacement employee.
    if replacement_id is not None:

        if replacement_id == employee_id:
            raise HTTPException(
                status_code=400,
                detail="An employee cannot be reassigned to themselves"
            )

        replacement_employee = db.query(User).filter(
            User.id == replacement_id,
            User.role == "employee",
            User.is_active == True,
            User.is_deleted == False
        ).first()

        if not replacement_employee:
            raise HTTPException(
                status_code=404,
                detail="Replacement employee not found or inactive"
            )

    try:
        reassigned_count = 0

        # Reassign unfinished tasks to another employee.
        if unfinished_tasks:
            for task in unfinished_tasks:
                task.assigned_to = replacement_employee.id

            reassigned_count = len(unfinished_tasks)

        # Find any remaining tasks assigned to this employee.
        # These are normally completed historical tasks.
        remaining_tasks = db.query(models.Task).filter(
            models.Task.assigned_to == employee_id
        ).all()

        # Preserve task records but remove the deleted employee reference.
        for task in remaining_tasks:
            task.assigned_to = None

        # Clear any creator references to this employee.
        created_tasks = db.query(models.Task).filter(
            models.Task.created_by == employee_id
        ).all()

        for task in created_tasks:
            task.created_by = None

        # Permanently remove the employee from the users table.
        db.delete(employee)

        db.commit()

        return {
            "message": "Employee permanently deleted successfully",
            "employee_id": employee_id,
            "employee_name": employee_name,
            "reassigned_tasks": reassigned_count,
            "replacement_employee_id": (
                replacement_employee.id
                if replacement_employee
                else None
            ),
            "historical_tasks_preserved": True,
            "account_status": "permanently_deleted"
        }

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to permanently delete employee. "
                "No changes were saved."
            )
        )
