from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routes import ingest, search, reader, quiz, report
from routes.Auto_fetch import router as auto_fetch_router
from services.scheduler import start_scheduler

app = FastAPI(
    title="Learning Tracker API",
    description="Your personal AI learning diary.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router)
app.include_router(search.router)
app.include_router(reader.router)
app.include_router(auto_fetch_router)
app.include_router(quiz.router)
app.include_router(report.router)


@app.on_event("startup")
async def startup():
    init_db()
    start_scheduler()
    print("Database ready")
    print("Scheduler started")
    print("API docs -> http://localhost:8000/docs")


@app.get("/")
async def root():
    return {"message": "Learning Tracker is running!", "docs": "http://localhost:8000/docs"}