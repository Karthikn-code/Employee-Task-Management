
from sqlalchemy import text
from database import engine

try:
    with engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))

        print("PostgreSQL connection successful!")
        print("Database test result:", result.scalar())

except Exception as error:
    print("Database connection failed!")
    print("Error:", error)
