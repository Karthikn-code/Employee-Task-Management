
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

import models
from database import get_db
from security import verify_access_token


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")


# ---------------- CURRENT USER ----------------

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    payload = verify_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user_id = payload.get("sub")

    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid token payload"
        )

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid token payload"
        )

    current_user = (
        db.query(models.User)
        .filter(models.User.id == user_id)
        .first()
    )

    if (
        current_user is None
        or not current_user.is_active
        or current_user.is_deleted
    ):
        raise HTTPException(
            status_code=401,
            detail="User not found, inactive, or archived"
        )

    return current_user


# ---------------- ADMIN USER ----------------

def get_admin_user(
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin privileges required."
        )

    return current_user
