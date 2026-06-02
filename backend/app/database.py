from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if os.path.exists("/app/data"):
        DATABASE_URL = "sqlite:////app/data/dev.db"
    else:
        DATABASE_URL = "sqlite:///dev.db"

is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {}
if is_sqlite:
    connect_args = {"check_same_thread": False}
elif "neon.tech" in DATABASE_URL:
    connect_args = {"sslmode": "require"}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()