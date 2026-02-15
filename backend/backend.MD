# How to start the backend
* cd backend
* python -m venv venv
* venv\Scripts\activate
* pip install fastapi uvicorn
* pip install pydantic python-dotenv sqlalchemy

## How to create DB
psql -U postgres -d postgres -f backend/db/00_create_db.sql
psql -U postgres -d inkomoko_early_warning -f backend/db/01_schema.sql


## Required env file

* backend/.env:

DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/inkomoko_early_warning
JWT_SECRET=dev-secret-change-me

## simple load
uvicorn app.main:app --reload


## Production run (no reload)
uvicorn app.main:app --host 0.0.0.0 --port 8000

## Next tasks
* Connect FastAPI to PostgreSQL

* JWT authentication

* Dockerize FastAPI

* Async background tasks

* Serve ML models / YOLO / LLMs via FastAPI

* FastAPI + Nginx + HTTPS
