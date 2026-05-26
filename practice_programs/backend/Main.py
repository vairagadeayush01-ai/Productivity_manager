import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from core.limiter import limiter
from core.logging_config import setup_logging
from database import init_db, verify_database_path
from routes import auth, diary, ingest, quiz, reader, report, search
from routes.Auto_fetch import router as auto_fetch_router
from routes.activity import router as activity_router
from routes.profile import router as profile_router       # Phase 2.1
from routes.github import router as github_router         # Phase 2.2
from routes.leetcode import router as leetcode_router     # Phase 2.3
from routes.chat import router as chat_router             # Phase 3.1
from routes.tutor import router as tutor_router           # Phase 3.3
from routes.calendar import router as calendar_router           # Phase 3.3
from services.scheduler import start_scheduler

load_dotenv()
setup_logging()

import logging

logger = logging.getLogger(__name__)

_default_origins = "http://localhost:5173,http://127.0.0.1:5173,https://www.youtube.com"
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", _default_origins).split(",")
    if o.strip()
]

# Optional Sentry
_sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
if _sentry_dsn:
    try:
        import sentry_sdk

        sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.2, environment=os.getenv("ENVIRONMENT", "development"))
        logger.info("Sentry initialized")
    except ImportError:
        logger.warning("SENTRY_DSN set but sentry-sdk not installed")

app = FastAPI(
    title="Antigravity — AI Developer Intelligence",
    description="Your personal AI-powered developer productivity tracker.",
    version="2.0.0",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth.router)
app.include_router(activity_router)        # Phase 1.1 — offline sync batch endpoint
app.include_router(github_router, prefix="/api/v1/github")
app.include_router(leetcode_router, prefix="/api/v1/leetcode")
app.include_router(chat_router, prefix="/api/v1/chat")
app.include_router(tutor_router, prefix="/api/v1/tutor")
app.include_router(calendar_router, prefix="/calendar")
app.include_router(ingest.router)
app.include_router(search.router)
app.include_router(reader.router)
app.include_router(auto_fetch_router)
app.include_router(quiz.router)
app.include_router(report.router)
app.include_router(diary.router)
app.include_router(profile_router)         # Phase 2.1 — profile + connected accounts
app.include_router(github_router)          # Phase 2.2 — GitHub diff intelligence
app.include_router(leetcode_router)        # Phase 2.3 — LeetCode solution intelligence
app.include_router(chat_router)            # Phase 3.1 — RAG chat
app.include_router(tutor_router)           # Phase 3.3 — AI tutor with memory



@app.on_event("startup")
async def startup():
    verify_database_path()
    init_db()
    start_scheduler()
    logger.info("Database ready")
    logger.info("Scheduler started")
    logger.info("API docs -> http://localhost:8000/docs")


@app.get("/")
async def root():
    return {"message": "Learning Tracker is running!", "docs": "http://localhost:8000/docs", "auth": "/auth/register"}
