from database import SessionLocal
from models import User
from auth import hash_password

db = SessionLocal()

try:
    employee = db.query(User).filter(
        User.id == 6,
        User.email == "testemployee@gmail.com"
    ).first()

    if not employee:
        print("Test employee not found.")
    else:
        employee.hashed_password = hash_password("Test@12345")
        db.commit()

        print("Test employee password reset successfully.")

finally:
    db.close()